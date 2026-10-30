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

function formatAdjustmentDate(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
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

export function FinancePaymentDatesAction({
  onClick,
  label,
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`finance-payment-dates-action${label ? ' finance-payment-dates-action--labeled' : ''}`}
      onClick={onClick}
      title="Ver datas, valores e formas dos pagamentos"
      aria-label={label || 'Ver datas dos pagamentos'}
    >
      <CalendarClock size={16} aria-hidden="true" />
      {label && <span>{label}</span>}
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
  const [unlinkedProofs, setUnlinkedProofs] = useState(0);
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
    setUnlinkedProofs(0);
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
  const adjustments = row.adjustmentEntries || [];
  const adjustmentSum = adjustments.reduce((sum, entry) => sum + entry.amountCents, 0n);
  const adjustmentExpected = -(row.refundCents || 0n);
  const official = financePaymentOfficialAmount(row);
  const detailed = occurrences.reduce((sum, occurrence) => sum + occurrence.amountCents, 0n);
  const difference = detailed - official;
  const editable = canEdit && row.workServiceId === null && row.paymentIds.length === 1
    && !row.refundCents;
  const editDifference = draftTotal === null ? null : draftTotal - official;
  // Editing must report the CURRENT input, not yesterday's saved divergence.
  const displayedDetailed = editing ? draftTotal : detailed;
  const displayedDifference = editing ? editDifference : difference;
  const divergence = displayedDifference !== null && displayedDifference !== 0n;

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
    setUnlinkedProofs(0);
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
      const result = await replaceSupplyPurchasePaymentOccurrencesV2(
        row.paymentIds[0],
        values,
        (count) => window.confirm(
          `${count} ocorrência(s) está(ão) vinculada(s) a comprovante(s) excluído(s) ou não pertencente(s) a esta compra. ` +
          'O detalhamento será salvo sem esses vínculos; nenhum PDF ou valor será excluído. Deseja continuar?',
        ),
      );
      const savedDrafts = drafts.map((draft, index) => ({
        ...draft, attachmentId: result.occurrences[index]?.attachmentId || null,
      }));
      setDrafts(savedDrafts);
      setUnlinkedProofs(result.unlinkedCount);
      setSavedOccurrences(displayFromDrafts(savedDrafts));
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
        <div><span>Soma detalhada</span><strong>{displayedDetailed === null ? 'Valor inválido' : formatBRL(displayedDetailed)}</strong></div>
        <div><span>Diferença (detalhado − oficial)</span><strong>{displayedDifference === null ? '—' : formatBRL(displayedDifference)}</strong></div>
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
          {unlinkedProofs > 0 && <span> {unlinkedProofs} vínculo(s) a comprovante(s) indisponível(is) foram desassociados, sem excluir arquivos.</span>}
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

          {adjustments.length > 0 && (
            <section className="finance-payment-adjustment-breakdown" aria-label="Ajustes da compra">
              <header>
                <div>
                  <strong>Ajustes registrados em Ajustar compra</strong>
                  <small>Memória de cálculo auditável — estes lançamentos já estão refletidos nos créditos acima e não são somados novamente ao pagamento.</small>
                </div>
                <span className="finance-payment-adjustment-breakdown__count">{adjustments.length} ajuste(s)</span>
              </header>
              <div className="finance-payment-occurrence-table-wrap">
                <table className="finance-payment-occurrence-table">
                  <thead><tr><th>Registrado em</th><th>Variação</th><th>Lançamento</th><th>Referência</th></tr></thead>
                  <tbody>
                    {adjustments.map((entry) => (
                      <tr key={entry.id}>
                        <td><strong>{formatAdjustmentDate(entry.adjustedOn)}</strong></td>
                        <td className="is-money"><strong>{entry.amountCents > 0n ? '+' : ''}{formatBRL(entry.amountCents)}</strong></td>
                        <td><span className="finance-payment-method-pill">{entry.kind === 'freight' ? 'Ajuste de frete' : 'Item cancelado'}</span>
                          <small className="finance-payment-adjustment-breakdown__description">{entry.description}</small></td>
                        <td>{entry.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={1}>Total dos ajustes</th>
                    <th className="is-money">{formatBRL(adjustmentSum)}</th>
                    <td colSpan={2}>Crédito líquido já refletido no pagamento: {formatBRL(row.refundCents || 0n)}</td>
                  </tr></tfoot>
                </table>
              </div>
              {adjustmentSum !== adjustmentExpected && (
                <p className="finance-payment-occurrence-warning" role="alert">
                  <CircleAlert size={17} /> Divergência entre os ajustes e os créditos recebidos. Confira a compra na origem.
                </p>
              )}
            </section>
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
