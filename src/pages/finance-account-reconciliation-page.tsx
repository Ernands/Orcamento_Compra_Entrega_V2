import {
  CheckCircle2,
  CircleAlert,
  Eye,
  FileDown,
  FileSpreadsheet,
  Landmark,
  Paperclip,
  Plus,
  RefreshCcw,
  Scale,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import {
  createFinanceAccountAttachmentSignedUrl,
  createFinanceAccountEntry,
  cancelFinanceAccountEntry,
  listFinanceAccountDays,
  listFinanceAccountEntries,
  saveFinanceAccountDay,
} from '../data/finance/finance-account-reconciliation-repository';
import {
  downloadFinanceAccountReconciliationExcel,
  downloadFinanceAccountReconciliationPdf,
} from '../data/exports/finance-account-reconciliation-exports';
import { listSupplyPurchasePaymentOccurrencesV2 } from '../data/purchases/payment-occurrences-repository';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import { listWorkServices } from '../data/works/works-repository';
import {
  buildFinanceAccountConsolidated,
  buildFinanceAccountDaySummaries,
  type FinanceAccountDaySummary,
  type FinanceAccountEntryType,
  type FinanceAccountManualEntry,
  type FinanceAccountPaymentEvent,
} from '../domain/finance-account-reconciliation';
import {
  decorateFinancePaymentsWithOccurrences,
  financePaymentOccurrences,
} from '../domain/finance-payment-occurrences';
import { buildUnifiedFinancePayments } from '../domain/finance-payments';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { PurchasePaymentOccurrenceV2 } from '../domain/payment-occurrences';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';
import './finance-account-reconciliation-page.css';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

function dateLabel(value: string | null): string {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function statusLabel(status: FinanceAccountDaySummary['status']): string {
  return status === 'reconciled'
    ? 'Conciliado'
    : status === 'divergent'
      ? 'Divergente'
      : 'Pendente de conferência';
}

function entryLabel(entry: FinanceAccountManualEntry): string {
  if (entry.type === 'investment') return 'Investimento';
  return entry.type === 'adjustment_credit' ? 'Acerto positivo' : 'Acerto negativo';
}

function moneyClass(value: bigint | null): string {
  if (value === null || value === 0n) return 'finance-account-money';
  return value > 0n
    ? 'finance-account-money finance-account-money--positive'
    : 'finance-account-money finance-account-money--negative';
}

type FormMode = 'bank' | 'investment' | 'adjustment' | null;

export function FinanceAccountReconciliationPage() {
  const { can } = useSession();
  const canManage = can('finance.account_reconciliation_manage');
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') || '';

  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [occurrences, setOccurrences] = useState<PurchasePaymentOccurrenceV2[]>([]);
  const [dayRecords, setDayRecords] = useState<Awaited<ReturnType<typeof listFinanceAccountDays>>>([]);
  const [manualEntries, setManualEntries] = useState<FinanceAccountManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(initialDate);
  const [dateTo, setDateTo] = useState(initialDate);
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [query, setQuery] = useState('');

  const [detailDay, setDetailDay] = useState<FinanceAccountDaySummary | null>(null);
  const [detailAdjustmentsOnly, setDetailAdjustmentsOnly] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formDate, setFormDate] = useState(initialDate);
  const [bankPayments, setBankPayments] = useState('');
  const [bankBalance, setBankBalance] = useState('');
  const [amount, setAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<FinanceAccountEntryType>('adjustment_credit');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPurchases, nextWorks, nextStores, nextOccurrences, nextDays, nextEntries] =
        await Promise.all([
          listSupplyPurchasesV2(),
          listWorkServices(),
          listStores(),
          listSupplyPurchasePaymentOccurrencesV2(),
          listFinanceAccountDays(),
          listFinanceAccountEntries(),
        ]);
      setPurchases(nextPurchases);
      setWorks(nextWorks);
      setStores(nextStores);
      setOccurrences(nextOccurrences);
      setDayRecords(nextDays);
      setManualEntries(nextEntries);
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : 'Não foi possível carregar a conciliação da conta.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const paymentEvents = useMemo<FinanceAccountPaymentEvent[]>(() => {
    const rows = decorateFinancePaymentsWithOccurrences(
      buildUnifiedFinancePayments(purchases, works),
      occurrences,
    ).filter((row) => row.status === 'paid');

    return rows.flatMap((row) => {
      const reference = row.referenceCodes.join(' + ') || 'Sem referência';
      const params = new URLSearchParams();
      params.set('refs', row.referenceCodes.join(','));
      const sourceHref = `${row.workServiceId ? '/obras' : '/suprimentos/compras'}?${params.toString()}`;
      return financePaymentOccurrences(row).map((occurrence) => ({
        id: `${row.id}:${occurrence.id}`,
        date: occurrence.date,
        amountCents: occurrence.amountCents,
        reference,
        counterpart: row.supplierName,
        description: row.description,
        paymentMethod: occurrence.paymentMethod || row.paymentMethod,
        sourceLabel: occurrence.referenceLabel || row.sourceLabel || row.installmentLabel,
        storeIds: row.storeIds,
        storeCodes: row.storeCodes,
        states: row.states,
        sourceHref,
      }));
    });
  }, [occurrences, purchases, works]);

  const days = useMemo(
    () => buildFinanceAccountDaySummaries(paymentEvents, dayRecords, manualEntries),
    [dayRecords, manualEntries, paymentEvents],
  );
  const consolidated = useMemo(() => buildFinanceAccountConsolidated(days), [days]);
  const states = useMemo(() => [...new Set(stores.map((store) => store.state))].sort(), [stores]);

  const filteredDays = useMemo(() => {
    const search = normalized(query);
    return [...days]
      .filter((day) => !dateFrom || day.date >= dateFrom)
      .filter((day) => !dateTo || day.date <= dateTo)
      .filter((day) => !statusFilter || day.status === statusFilter)
      .filter((day) => {
        if (!storeFilter) return true;
        return day.payments.some((payment) => payment.storeIds.includes(storeFilter));
      })
      .filter((day) => {
        if (!stateFilter) return true;
        return day.payments.some((payment) => payment.states.includes(stateFilter));
      })
      .filter((day) => {
        if (!search) return true;
        return normalized([
          day.date,
          ...day.payments.flatMap((payment) => [
            payment.reference,
            payment.counterpart,
            payment.description,
            payment.sourceLabel || '',
            ...payment.storeCodes,
            ...payment.states,
          ]),
          ...day.entries.flatMap((entry) => [entryLabel(entry), entry.reason, entry.notes || '']),
          day.record?.notes || '',
        ].join(' ')).includes(search);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [dateFrom, dateTo, days, query, stateFilter, statusFilter, storeFilter]);

  const overallStatus =
    consolidated.actualBalanceCents === null || consolidated.pendingDays > 0
      ? 'pending'
      : consolidated.balanceDifferenceCents !== 0n || consolidated.divergentDays > 0
        ? 'divergent'
        : 'reconciled';

  const resetForm = () => {
    setFormMode(null);
    setFormDate('');
    setBankPayments('');
    setBankBalance('');
    setAmount('');
    setAdjustmentType('adjustment_credit');
    setReason('');
    setNotes('');
    setFiles([]);
    setModalError(null);
  };

  const openBankForm = (day?: FinanceAccountDaySummary) => {
    setFormMode('bank');
    setFormDate(day?.date || initialDate || new Date().toISOString().slice(0, 10));
    setBankPayments(
      day?.bankPaymentsCents === null || day?.bankPaymentsCents === undefined
        ? ''
        : (Number(day.bankPaymentsCents) / 100).toFixed(2).replace('.', ','),
    );
    setBankBalance(
      day?.bankBalanceCents === null || day?.bankBalanceCents === undefined
        ? ''
        : (Number(day.bankBalanceCents) / 100).toFixed(2).replace('.', ','),
    );
    setNotes(day?.record?.notes || '');
    setModalError(null);
  };

  const openEntryForm = (mode: 'investment' | 'adjustment', date?: string) => {
    setFormMode(mode);
    setFormDate(date || initialDate || new Date().toISOString().slice(0, 10));
    setAmount('');
    setAdjustmentType('adjustment_credit');
    setReason(mode === 'investment' ? 'Investimento em conta' : '');
    setNotes('');
    setFiles([]);
    setModalError(null);
  };

  const saveBank = async () => {
    if (!formDate) {
      setModalError('Informe a data.');
      return;
    }
    if (!bankPayments.trim() && !bankBalance.trim()) {
      setModalError('Informe o movimento de pagamentos da Conta BB e/ou o saldo da conta.');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await saveFinanceAccountDay({
        date: formDate,
        bankPayments,
        bankBalance,
        notes,
      });
      resetForm();
      await load();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const saveEntry = async () => {
    const type = formMode === 'investment' ? 'investment' : adjustmentType;
    if (!formDate || !amount.trim()) {
      setModalError('Informe a data e o valor.');
      return;
    }
    let parsedAmount: bigint;
    try {
      parsedAmount = moneyToCents(amount);
    } catch {
      setModalError('Informe um valor válido.');
      return;
    }
    if (parsedAmount <= 0n) {
      setModalError('O valor deve ser maior que zero.');
      return;
    }
    if (reason.trim().length < 2) {
      setModalError('Informe o motivo/identificação do lançamento.');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await createFinanceAccountEntry({
        date: formDate,
        type,
        amount,
        reason,
        notes,
        files,
      });
      resetForm();
      await load();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEntry = async (entry: FinanceAccountManualEntry) => {
    const cancellationReason = window.prompt(
      `Motivo do cancelamento de “${entry.reason}”:`,
      '',
    );
    if (!cancellationReason?.trim()) return;
    try {
      await cancelFinanceAccountEntry(entry.id, cancellationReason.trim());
      setDetailDay(null);
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Não foi possível cancelar o lançamento.');
    }
  };

  const openAttachment = async (entry: FinanceAccountManualEntry, attachmentId: string) => {
    const attachment = entry.attachments.find((item) => item.id === attachmentId);
    if (!attachment) return;
    setOpeningAttachmentId(attachment.id);
    try {
      const url = await createFinanceAccountAttachmentSignedUrl(attachment.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Não foi possível abrir o comprovante.');
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const filtersText = [
    dateFrom ? `De ${dateLabel(dateFrom)}` : '',
    dateTo ? `Até ${dateLabel(dateTo)}` : '',
    statusFilter ? `Situação: ${statusLabel(statusFilter as FinanceAccountDaySummary['status'])}` : '',
    storeFilter ? `Loja: ${stores.find((store) => store.id === storeFilter)?.code || storeFilter}` : '',
    stateFilter ? `UF: ${stateFilter}` : '',
    query.trim() ? `Busca: ${query.trim()}` : '',
  ].filter(Boolean).join(' · ');

  const exportReport = async (type: 'excel' | 'pdf') => {
    setExporting(type);
    setError(null);
    try {
      const input = {
        days: filteredDays,
        consolidated,
        generatedAt: new Date(),
        filtersText,
      };
      if (type === 'excel') await downloadFinanceAccountReconciliationExcel(input);
      else await downloadFinanceAccountReconciliationPdf(input);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Não foi possível gerar o relatório.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page-stack finance-account-page">
      <header className="page-heading finance-account-heading">
        <div>
          <span className="eyebrow">Financeiro</span>
          <h2>Conciliação Conta</h2>
          <p>Conciliação da Conta BB com investimentos, pagamentos do sistema e acertos documentados.</p>
        </div>
        <div className="finance-account-heading__actions">
          <button className="button button--secondary" onClick={() => void exportReport('excel')} disabled={exporting !== null || loading}>
            <FileSpreadsheet size={16} />
            {exporting === 'excel' ? 'Gerando...' : 'Excel'}
          </button>
          <button className="button button--secondary" onClick={() => void exportReport('pdf')} disabled={exporting !== null || loading}>
            <FileDown size={16} />
            {exporting === 'pdf' ? 'Gerando...' : 'PDF'}
          </button>
          <button className="button button--secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'spin' : undefined} />
            Atualizar
          </button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <InlineLoading label="Carregando conciliação da conta" />
      ) : (
        <>
          <section className="finance-account-kpis" aria-label="Consolidado da conta">
            <article className="finance-account-kpi finance-account-kpi--investment">
              <span>Investimento acumulado</span>
              <strong>{formatBRL(consolidated.investmentCents)}</strong>
              <small>Valores colocados na Conta BB para o projeto.</small>
            </article>
            <article className="finance-account-kpi finance-account-kpi--payments">
              <span>Pagamentos realizados</span>
              <strong>{formatBRL(consolidated.systemPaymentsCents)}</strong>
              <small>Ocorrências pagas registradas no sistema.</small>
            </article>
            <article className="finance-account-kpi finance-account-kpi--adjustments">
              <span>Acertos líquidos</span>
              <strong>{formatBRL(consolidated.adjustmentCreditCents - consolidated.adjustmentDebitCents)}</strong>
              <small>Positivos {formatBRL(consolidated.adjustmentCreditCents)} · negativos {formatBRL(consolidated.adjustmentDebitCents)}</small>
            </article>
            <article className="finance-account-kpi finance-account-kpi--expected">
              <span>Saldo esperado</span>
              <strong>{formatBRL(consolidated.expectedBalanceCents)}</strong>
              <small>Investimentos − pagamentos + acertos positivos − negativos.</small>
            </article>
            <article className="finance-account-kpi finance-account-kpi--bank">
              <span>Saldo informado BB</span>
              <strong>{consolidated.actualBalanceCents === null ? 'Não informado' : formatBRL(consolidated.actualBalanceCents)}</strong>
              <small>{consolidated.actualBalanceDate ? `Última posição em ${dateLabel(consolidated.actualBalanceDate)}` : 'Sem posição bancária registrada.'}</small>
            </article>
            <article className={`finance-account-kpi finance-account-kpi--difference ${consolidated.balanceDifferenceCents === 0n ? 'finance-account-kpi--positive' : consolidated.balanceDifferenceCents === null ? 'finance-account-kpi--warning' : 'finance-account-kpi--danger'}`}>
              <span>Diferença da conta</span>
              <strong>{consolidated.balanceDifferenceCents === null ? 'Não calculada' : formatBRL(consolidated.balanceDifferenceCents)}</strong>
              <small>Saldo BB − saldo esperado pelo sistema.</small>
            </article>
            <article className="finance-account-kpi finance-account-kpi--conference">
              <span>Conferência diária</span>
              <strong>{consolidated.reconciledDays} conciliado(s)</strong>
              <small>{consolidated.divergentDays} divergente(s) · {consolidated.pendingDays} pendente(s)</small>
            </article>
            <article className={`finance-account-kpi finance-account-kpi--status ${overallStatus === 'reconciled' ? 'finance-account-kpi--positive' : overallStatus === 'divergent' ? 'finance-account-kpi--danger' : 'finance-account-kpi--warning'}`}>
              <span>Situação da conta</span>
              <strong>{overallStatus === 'reconciled' ? 'Conciliada' : overallStatus === 'divergent' ? 'Divergente' : 'Pendente'}</strong>
              <small>{overallStatus === 'reconciled' ? 'Saldo real e saldo esperado estão iguais.' : overallStatus === 'divergent' ? 'Existe diferença entre a conta e o sistema.' : 'Informe o saldo atual da Conta BB.'}</small>
            </article>
          </section>

          <div className="finance-account-actions">
            {canManage && (
              <>
                <button className="button" onClick={() => openBankForm()}>
                  <Landmark size={16} />
                  Registrar Conta BB
                </button>
                <button className="button button--secondary" onClick={() => openEntryForm('investment')}>
                  <Plus size={16} />
                  Novo investimento
                </button>
                <button className="button button--secondary" onClick={() => openEntryForm('adjustment')}>
                  <Scale size={16} />
                  Novo acerto
                </button>
              </>
            )}
          </div>

          <div className="finance-account-explanation">
            A diferença diária é calculada por <strong>Conta BB informado − pagamentos do sistema + acertos positivos − acertos negativos</strong>. O saldo esperado acumulado usa <strong>investimentos − pagamentos + acertos positivos − acertos negativos</strong>. Os acertos não alteram Compras, Obras ou pagamentos originais.
          </div>

          <section className="finance-account-filters" aria-label="Filtros da conciliação">
            <label>
              De
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label>
              Situação
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todas</option>
                <option value="reconciled">Conciliado</option>
                <option value="divergent">Divergente</option>
                <option value="pending">Pendente de conferência</option>
              </select>
            </label>
            <label>
              UF
              <select value={stateFilter} onChange={(event) => {
                setStateFilter(event.target.value);
                setStoreFilter('');
              }}>
                <option value="">Todas</option>
                {states.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
            <label>
              Loja
              <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="">Todas</option>
                {stores
                  .filter((store) => !stateFilter || store.state === stateFilter)
                  .map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
              </select>
            </label>
            <label className="finance-account-search">
              <span><Search size={13} /> Busca</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="CMP, OBR, fornecedor, motivo, loja, referência..."
              />
            </label>
            <div className="finance-account-modal-actions" style={{ alignSelf: 'end' }}>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setStatusFilter('');
                  setStoreFilter('');
                  setStateFilter('');
                  setQuery('');
                }}
              >
                <SlidersHorizontal size={15} />
                Limpar filtros
              </button>
            </div>
          </section>

          <section className="finance-account-panel">
            <header>
              <div>
                <h3>Conciliação por data</h3>
                <p>Cada data pode ser aberta para ver todos os lançamentos ou somente os acertos.</p>
              </div>
              <span>{filteredDays.length} data(s)</span>
            </header>

            {filteredDays.length ? (
              <div className="finance-account-table-scroll">
                <table className="finance-account-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Investimento</th>
                      <th>Pagamentos sistema</th>
                      <th>Conta BB informado</th>
                      <th>Acertos +</th>
                      <th>Acertos -</th>
                      <th>Diferença</th>
                      <th>Saldo esperado</th>
                      <th>Saldo BB</th>
                      <th>Situação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDays.map((day) => (
                      <tr key={day.date} className={`finance-account-table-row finance-account-table-row--${day.status}`}>
                        <td><strong>{dateLabel(day.date)}</strong></td>
                        <td className="finance-account-money">{formatBRL(day.investmentCents)}</td>
                        <td className="finance-account-money">{formatBRL(day.systemPaymentsCents)}</td>
                        <td className="finance-account-money">{day.bankPaymentsCents === null ? 'Não informado' : formatBRL(day.bankPaymentsCents)}</td>
                        <td className="finance-account-money finance-account-money--positive">{formatBRL(day.adjustmentCreditCents)}</td>
                        <td className="finance-account-money finance-account-money--negative">{formatBRL(day.adjustmentDebitCents)}</td>
                        <td className={moneyClass(day.differenceCents)}>{day.differenceCents === null ? '—' : formatBRL(day.differenceCents)}</td>
                        <td className="finance-account-money">{formatBRL(day.expectedBalanceCents)}</td>
                        <td className="finance-account-money">{day.bankBalanceCents === null ? '—' : formatBRL(day.bankBalanceCents)}</td>
                        <td>
                          <span className={`finance-account-status finance-account-status--${day.status}`}>
                            {day.status === 'reconciled' ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
                            {statusLabel(day.status)}
                          </span>
                        </td>
                        <td>
                          <div className="finance-account-row-actions">
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={() => {
                                setDetailDay(day);
                                setDetailAdjustmentsOnly(false);
                              }}
                            >
                              <Eye size={14} />
                              Todos os lançamentos
                            </button>
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={() => {
                                setDetailDay(day);
                                setDetailAdjustmentsOnly(true);
                              }}
                            >
                              <Scale size={14} />
                              Só acertos
                            </button>
                            {canManage && (
                              <button
                                type="button"
                                className="button button--secondary button--small"
                                onClick={() => openBankForm(day)}
                              >
                                <Landmark size={14} />
                                Conta BB
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nenhuma data encontrada" detail="Ajuste os filtros ou registre um movimento da Conta BB." />
            )}
          </section>
        </>
      )}

      {detailDay && (
        <Modal
          open
          title={`${detailAdjustmentsOnly ? 'Acertos' : 'Todos os lançamentos'} · ${dateLabel(detailDay.date)}`}
          description={detailAdjustmentsOnly ? 'Somente ajustes de conciliação desta data.' : 'Pagamentos, investimentos e acertos que compõem a data.'}
          onClose={() => setDetailDay(null)}
        >
          <div className="finance-account-detail">
            <div className="finance-account-detail__summary">
              <article className="finance-account-detail__summary--system"><span>Sistema</span><strong>{formatBRL(detailDay.systemPaymentsCents)}</strong></article>
              <article className="finance-account-detail__summary--bank"><span>Conta BB</span><strong>{detailDay.bankPaymentsCents === null ? 'Não informado' : formatBRL(detailDay.bankPaymentsCents)}</strong></article>
              <article className="finance-account-detail__summary--adjustments"><span>Acertos líquidos</span><strong>{formatBRL(detailDay.adjustmentCreditCents - detailDay.adjustmentDebitCents)}</strong></article>
              <article className={`finance-account-detail__summary--${detailDay.status}`}><span>Diferença</span><strong>{detailDay.differenceCents === null ? '—' : formatBRL(detailDay.differenceCents)}</strong></article>
            </div>

            <div className="finance-account-detail-list">
              {!detailAdjustmentsOnly && detailDay.payments.map((payment) => (
                <article key={payment.id} className="finance-account-detail-list__payment">
                  <div>
                    <strong>Pagamento do sistema</strong>
                    <small>{payment.paymentMethod ? PAYMENT_LABELS[payment.paymentMethod] || payment.paymentMethod : 'Forma não informada'}</small>
                  </div>
                  <div>
                    <strong>{payment.reference} · {payment.counterpart}</strong>
                    <small>{payment.description}</small>
                    <small>{payment.sourceLabel || 'Sem identificação adicional'} · {payment.storeCodes.join(', ') || 'Sem loja'}</small>
                  </div>
                  <div>
                    <strong>{formatBRL(payment.amountCents)}</strong>
                    <Link className="finance-payment-origin-link" to={payment.sourceHref}>Ver origem</Link>
                  </div>
                </article>
              ))}

              {detailDay.entries
                .filter((entry) => detailAdjustmentsOnly ? entry.type !== 'investment' : true)
                .map((entry) => (
                  <article
                    key={entry.id}
                    className={entry.type === 'investment' ? 'finance-account-detail-list__investment' : entry.type === 'adjustment_credit' ? 'finance-account-detail-list__adjustment finance-account-detail-list__adjustment--credit' : 'finance-account-detail-list__adjustment finance-account-detail-list__adjustment--debit'}
                  >
                    <div>
                      <strong>{entryLabel(entry)}</strong>
                      <small>{entry.attachments.length} arquivo(s)</small>
                    </div>
                    <div>
                      <strong>{entry.reason}</strong>
                      <small>{entry.notes || 'Sem observação adicional.'}</small>
                      {entry.attachments.length > 0 && (
                        <div className="finance-account-modal-actions" style={{ marginTop: 6 }}>
                          {entry.attachments.map((attachment) => (
                            <button
                              key={attachment.id}
                              type="button"
                              className="finance-payment-document-link"
                              disabled={openingAttachmentId === attachment.id}
                              onClick={() => void openAttachment(entry, attachment.id)}
                            >
                              <Paperclip size={13} />
                              {openingAttachmentId === attachment.id ? 'Abrindo...' : attachment.originalName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <strong>{formatBRL(entry.amountCents)}</strong>
                      {canManage && (
                        <button
                          type="button"
                          className="finance-payment-document-link"
                          onClick={() => void cancelEntry(entry)}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </article>
                ))}

              {detailAdjustmentsOnly && !detailDay.entries.some((entry) => entry.type !== 'investment') && (
                <EmptyState title="Sem acertos nesta data" detail="Nenhum ajuste de conciliação foi lançado para este dia." />
              )}
            </div>
          </div>
        </Modal>
      )}

      {formMode && (
        <Modal
          open
          title={formMode === 'bank' ? 'Registrar Conta BB' : formMode === 'investment' ? 'Novo investimento' : 'Novo acerto'}
          description={formMode === 'bank' ? 'Informe o total movimentado em pagamentos e, quando disponível, o saldo da conta nessa data.' : 'O lançamento fica separado dos pagamentos do sistema e mantém comprovação própria.'}
          onClose={resetForm}
        >
          <div className="finance-account-form">
            {modalError && <div className="form-error">{modalError}</div>}
            <div className="finance-account-form__grid">
              <label>
                Data
                <input type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
              </label>

              {formMode === 'bank' ? (
                <>
                  <label>
                    Movimento/Pagamentos da Conta BB
                    <input inputMode="decimal" value={bankPayments} onChange={(event) => setBankPayments(event.target.value)} placeholder="Use negativo quando o movimento líquido do dia for crédito" />
                  </label>
                  <label>
                    Saldo da Conta BB
                    <input inputMode="decimal" value={bankBalance} onChange={(event) => setBankBalance(event.target.value)} placeholder="Opcional" />
                  </label>
                </>
              ) : (
                <>
                  {formMode === 'adjustment' && (
                    <label>
                      Tipo de acerto
                      <select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as FinanceAccountEntryType)}>
                        <option value="adjustment_credit">Positivo · crédito/devolução</option>
                        <option value="adjustment_debit">Negativo · débito/tarifa/outro</option>
                      </select>
                    </label>
                  )}
                  <label>
                    Valor
                    <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Motivo / identificação
                    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: devolução de fornecedor, tarifa bancária, aporte da diretoria..." />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Comprovantes
                    <input
                      type="file"
                      multiple
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => setFiles(Array.from(event.target.files || []))}
                    />
                  </label>
                </>
              )}
            </div>
            <label>
              Observação
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {files.length > 0 && (
              <ul className="finance-account-file-list">
                {files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}
              </ul>
            )}
            <div className="finance-account-modal-actions">
              <button type="button" className="button button--secondary" onClick={resetForm} disabled={saving}>Cancelar</button>
              <button type="button" className="button" onClick={() => void (formMode === 'bank' ? saveBank() : saveEntry())} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
