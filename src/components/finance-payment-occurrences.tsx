import { CalendarClock, CircleAlert, Pencil, Plus, Save, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../app/session-provider';
import { replaceSupplyPurchasePaymentOccurrencesV2 } from '../data/purchases/payment-occurrences-repository';
import {
  financePaymentOccurrences,
  financePaymentOfficialAmount,
  type FinancePaymentOccurrenceDisplay,
  type UnifiedFinancePaymentRowWithOccurrences,
} from '../domain/finance-payment-occurrences';
import type { PaymentMethod } from '../domain/purchase-v2-types';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import { EmptyState, Modal } from './ui';
import './finance-payment-occurrences.css';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function referenceLabel(row: UnifiedFinancePaymentRowWithOccurrences): string {
  return row.referenceCodes.join(' + ') || 'Sem referência';
}

function centsToInput(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()},${fraction}`;
}

type OccurrenceDraft = {
  key: string;
  occurredOn: string;
  amount: string;
  paymentMethod: PaymentMethod;
  referenceLabel: string;
  attachmentId: string | null;
};

function draftsFromOccurrences(
  row: UnifiedFinancePaymentRowWithOccurrences,
  occurrences: FinancePaymentOccurrenceDisplay[],
): OccurrenceDraft[] {
  return occurrences.map((occurrence, index) => ({
    key: occurrence.id || `occurrence-${index + 1}`,
    occurredOn: occurrence.date,
    amount: centsToInput(occurrence.amountCents),
    paymentMethod: (occurrence.paymentMethod || row.paymentMethod || 'pix') as PaymentMethod,
    referenceLabel: occurrence.referenceLabel || '',
    attachmentId: occurrence.attachmentId,
  }));
}

function displayFromDrafts(drafts: OccurrenceDraft[]): FinancePaymentOccurrenceDisplay[] {
  return drafts.flatMap((draft) => {
    try {
      if (!draft.occurredOn || !draft.amount.trim()) return [];
      return [{
        id: draft.key,
        paymentId: null,
        attachmentId: draft.attachmentId,
        date: draft.occurredOn,
        amountCents: moneyToCents(draft.amount),
        paymentMethod: draft.paymentMethod,
        referenceLabel: draft.referenceLabel || null,
        source: 'manual' as const,
        notes: 'Detalhamento informado manualmente no Financeiro.',
      }];
    } catch {
      return [];
    }
  });
}

export function FinancePaymentDatesCell({ row }: { row: UnifiedFinancePaymentRowWithOccurrences }) {
  const dates = row.paymentDates.length ? row.paymentDates : row.date ? [row.date] : [];
  const divergence = row.occurrenceDifferenceCents !== 0n;
  if (!dates.length) return <span className="finance-payment-missing">Não informado</span>;

  return (
    <div className={`finance-payment-date-chips ${divergence ? 'is-divergent' : ''}`}>
      {dates.map((date) => (
        <span key={date} className="finance-payment-date-chip" title={divergence ? 'A soma do detalhamento diverge do valor oficial.' : undefined}>
          {formatDate(date)}
        </span>
      ))}
    </div>
  );
}

export function FinancePaymentDatesAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="finance-payment-dates-action"
      onClick={onClick}
      title="Ver datas, valores e formas dos pagamentos"
      aria-label="Ver datas dos pagamentos"
    >
      <CalendarClock size={16} />
    </button>
  );
}

export function FinancePaymentOccurrencesModal({
  row,
  onClose,
}: {
  row: UnifiedFinancePaymentRowWithOccurrences | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const canEdit = can('purchases.edit');
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<OccurrenceDraft[]>([]);
  const [savedOccurrences, setSavedOccurrences] = useState<FinancePaymentOccurrenceDisplay[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(1);

  useEffect(() => {
    if (!row) return;
    const current = financePaymentOccurrences(row);
    const next = draftsFromOccurrences(row, current);
    setDrafts(next);
    setSavedOccurrences(null);
    nextKey.current = next.length + 1;
    setEditing(false);
    setSaving(false);
    setSaved(false);
    setError(null);
  }, [row]);

  const draftTotal = useMemo(() => {
    try {
      return drafts.reduce(
        (sum, draft) => sum + (draft.amount.trim() ? moneyToCents(draft.amount) : 0n),
        0n,
      );
    } catch {
      return null;
    }
  }, [drafts]);

  if (!row) return null;
  const occurrences = savedOccurrences || financePaymentOccurrences(row);
  const official = financePaymentOfficialAmount(row);
  const detailed = occurrences.reduce((sum, occurrence) => sum + occurrence.amountCents, 0n);
  const difference = detailed - official;
  const divergence = difference !== 0n;
  const editable = canEdit && row.workServiceId === null && row.paymentIds.length === 1;
  const editDifference = draftTotal === null ? null : draftTotal - official;

  const updateDraft = (key: string, change: Partial<OccurrenceDraft>) => {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...change } : draft));
  };

  const addDraft = () => {
    const key = `manual-${nextKey.current++}`;
    setDrafts((current) => [...current, {
      key,
      occurredOn: '',
      amount: '',
      paymentMethod: (row.paymentMethod || 'pix') as PaymentMethod,
      referenceLabel: '',
      attachmentId: null,
    }]);
  };

  const startEditing = () => {
    setDrafts(draftsFromOccurrences(row, occurrences));
    setSaved(false);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!editable) return;
    setError(null);
    try {
      if (!drafts.length) throw new Error('Informe ao menos uma ocorrência de pagamento.');
      const values = drafts.map((draft) => {
        if (!draft.occurredOn) throw new Error('Informe a data de todas as ocorrências.');
        const amountCents = moneyToCents(draft.amount);
        if (amountCents <= 0n) throw new Error('Todos os valores precisam ser maiores que zero.');
        return {
          occurredOn: draft.occurredOn,
          amount: draft.amount,
          paymentMethod: draft.paymentMethod,
          referenceLabel: draft.referenceLabel,
          attachmentId: draft.attachmentId,
          source: 'manual' as const,
          notes: 'Detalhamento informado manualmente no Financeiro.',
        };
      });
      setSaving(true);
      await replaceSupplyPurchasePaymentOccurrencesV2(row.paymentIds[0], values);
      setSavedOccurrences(displayFromDrafts(drafts));
      setEditing(false);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : 'Não foi possível salvar o detalhamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Datas dos pagamentos · ${referenceLabel(row)}`}
      description="O valor oficial permanece o lançado na compra. O detalhamento mostra as ocorrências financeiras informadas ou conferidas nos comprovantes."
      onClose={onClose}
      className="finance-payment-occurrences-modal"
    >
      <div className={`finance-payment-occurrence-summary ${divergence ? 'is-divergent' : 'is-reconciled'}`}>
        <div><span>Valor oficial</span><strong>{formatBRL(official)}</strong></div>
        <div><span>Soma detalhada</span><strong>{formatBRL(detailed)}</strong></div>
        <div><span>Diferença (detalhado − oficial)</span><strong>{formatBRL(difference)}</strong></div>
      </div>

      {divergence && (
        <div className="finance-payment-occurrence-warning" role="status">
          <CircleAlert size={18} />
          <div>
            <strong>Detalhamento divergente</strong>
            <span>As ocorrências não fecham com o valor oficial. O pagamento da CMP não foi alterado.</span>
          </div>
        </div>
      )}

      {saved && (
        <div className="finance-payment-occurrence-saved" role="status">
          Detalhamento salvo. A próxima atualização da tela usará essas datas também na coluna, filtros e exportação.
        </div>
      )}

      {row.occurrenceDetailsSource === 'fallback' && !editing && !savedOccurrences && (
        <div className="finance-payment-occurrence-fallback">
          Este pagamento ainda não possui detalhamento estruturado. A linha abaixo usa a data e o valor já cadastrados no pagamento.
        </div>
      )}

      {editing ? (
        <div className="finance-payment-occurrence-editor">
          <div className="finance-payment-occurrence-editor__intro">
            <div>
              <strong>Detalhamento informado pelo usuário</strong>
              <span>Cadastre cada movimentação real. A soma pode divergir do valor oficial; o sistema apenas sinaliza e não altera a CMP.</span>
            </div>
            <button type="button" className="button button--secondary button--small" onClick={addDraft}>
              <Plus size={15} />Adicionar ocorrência
            </button>
          </div>

          <div className="finance-payment-occurrence-editor__rows">
            {drafts.map((draft, index) => (
              <div className="finance-payment-occurrence-editor__row" key={draft.key}>
                <strong>{index + 1}</strong>
                <label>
                  <span>Data</span>
                  <input type="date" value={draft.occurredOn} onChange={(event) => updateDraft(draft.key, { occurredOn: event.target.value })} />
                </label>
                <label>
                  <span>Valor</span>
                  <input value={draft.amount} onChange={(event) => updateDraft(draft.key, { amount: event.target.value })} placeholder="0,00" />
                </label>
                <label>
                  <span>Forma</span>
                  <select value={draft.paymentMethod} onChange={(event) => updateDraft(draft.key, { paymentMethod: event.target.value as PaymentMethod })}>
                    {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="finance-payment-occurrence-editor__reference">
                  <span>Referência</span>
                  <input value={draft.referenceLabel} onChange={(event) => updateDraft(draft.key, { referenceLabel: event.target.value })} placeholder="PIX, boleto, identificação..." />
                </label>
                {drafts.length > 1 && (
                  <button type="button" className="finance-payment-occurrence-editor__remove" onClick={() => setDrafts((current) => current.filter((entry) => entry.key !== draft.key))} title="Remover ocorrência" aria-label="Remover ocorrência">
                    <XCircle size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className={`finance-payment-occurrence-editor__balance ${editDifference !== null && editDifference !== 0n ? 'is-divergent' : 'is-ok'}`}>
            <span>Valor oficial <strong>{formatBRL(official)}</strong></span>
            <span>Detalhado <strong>{draftTotal === null ? 'Valor inválido' : formatBRL(draftTotal)}</strong></span>
            <span>Diferença <strong>{editDifference === null ? '—' : formatBRL(editDifference)}</strong></span>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button--secondary" onClick={() => {
              setDrafts(draftsFromOccurrences(row, occurrences));
              setEditing(false);
              setError(null);
            }}>Cancelar edição</button>
            <button type="button" className="button button--primary" disabled={saving} onClick={() => void save()}>
              <Save size={16} />{saving ? 'Salvando...' : 'Salvar detalhamento'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {occurrences.length ? (
            <div className="finance-payment-occurrence-table-wrap">
              <table className="finance-payment-occurrence-table">
                <thead>
                  <tr><th>Data</th><th>Valor</th><th>Forma</th><th>Referência</th></tr>
                </thead>
                <tbody>
                  {occurrences.map((occurrence) => (
                    <tr key={occurrence.id}>
                      <td><strong>{formatDate(occurrence.date)}</strong></td>
                      <td className="is-money"><strong>{formatBRL(occurrence.amountCents)}</strong></td>
                      <td><span className="finance-payment-method-pill">{occurrence.paymentMethod ? PAYMENT_LABELS[occurrence.paymentMethod as PaymentMethod] || occurrence.paymentMethod : 'Não informada'}</span></td>
                      <td>{occurrence.referenceLabel || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sem datas detalhadas" detail="Nenhuma ocorrência financeira foi informada para este pagamento." />
          )}

          {editable && (
            <div className="finance-payment-occurrence-edit-action">
              <button type="button" className="button button--secondary" onClick={startEditing}>
                <Pencil size={16} />Editar / informar datas
              </button>
              <small>Para novas compras, informe aqui as movimentações reais; o comprovante permanece somente como evidência.</small>
            </div>
          )}
          {canEdit && row.paymentIds.length > 1 && (
            <div className="finance-payment-occurrence-fallback">
              Este lançamento consolida mais de um pagamento. Edite o detalhamento na origem individual de cada pagamento.
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
