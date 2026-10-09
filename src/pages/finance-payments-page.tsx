import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  FileText,
  Paperclip,
  Pencil,
  RefreshCcw,
  Search,
  Scale,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import {
  FinancePaymentDatesAction,
  FinancePaymentDatesCell,
  FinancePaymentOccurrencesModal,
} from '../components/finance-payment-occurrences';
import { FinanceUnifiedPaymentsExportActions } from '../components/finance-unified-payments-export-actions';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import { listSupplyPurchasePaymentOccurrencesV2 } from '../data/purchases/payment-occurrences-repository';
import { updatePlannedFinancePayment } from '../data/finance/finance-repository';
import { createPurchaseAttachmentSignedUrlV2, listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import { createWorkDocumentSignedUrl, listWorkServices } from '../data/works/works-repository';
import {
  decorateFinancePaymentsWithOccurrences,
  financePaymentLatestDate,
  financePaymentMatchesDateRange,
  scopeFinancePaymentToOccurrenceDateRange,
  scopeFinancePaymentsWithOccurrencesByStores,
  type UnifiedFinancePaymentRowWithOccurrences,
} from '../domain/finance-payment-occurrences';
import {
  buildUnifiedFinancePayments,
  financePaymentOriginSummary,
  financePaymentPrimaryOrigin,
  financePaymentTotals,
  FINANCE_PAYMENT_ORIGIN_LABELS,
  type FinancePaymentOrigin,
  type FinancePaymentsView,
  type UnifiedFinancePaymentRow,
} from '../domain/finance-payments';
import type { PurchasePaymentOccurrenceV2 } from '../domain/payment-occurrences';
import { formatBRL } from '../domain/supply-calculations';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';
import './finance-payments-page.css';

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

const VIEW_LABELS: Record<FinancePaymentsView, string> = {
  paid: 'Pago',
  planned: 'A pagar programado',
  unscheduled: 'A pagar sem programação',
};

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function formatDate(value: string | null): string {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function validView(value: string | null): FinancePaymentsView {
  return value === 'planned' || value === 'unscheduled' || value === 'paid' ? value : 'paid';
}

function rowStoreLabel(row: UnifiedFinancePaymentRow): string {
  if (row.storeCodes.length === 1) return row.storeCodes[0];
  if (row.storeCodes.length > 1) return `${row.storeCodes.length} lojas`;
  if (row.storeIds.length === 1) return '1 loja';
  if (row.storeIds.length > 1) return `${row.storeIds.length} lojas`;
  return 'Sem loja definida';
}

function rowOriginLabel(row: UnifiedFinancePaymentRow): string {
  const origins = (Object.keys(row.originAllocations) as FinancePaymentOrigin[]).filter(
    (origin) => row.originAllocations[origin] > 0n,
  );
  if (origins.length === 1) return FINANCE_PAYMENT_ORIGIN_LABELS[origins[0]];
  if (origins.length > 1) return origins.map((origin) => FINANCE_PAYMENT_ORIGIN_LABELS[origin]).join(' + ');
  return FINANCE_PAYMENT_ORIGIN_LABELS[financePaymentPrimaryOrigin(row)];
}

function referenceLabel(row: UnifiedFinancePaymentRow): string {
  return row.referenceCodes.join(' + ') || 'Sem referência';
}

function dateSort(
  a: UnifiedFinancePaymentRowWithOccurrences,
  b: UnifiedFinancePaymentRowWithOccurrences,
  view: FinancePaymentsView,
) {
  if (view === 'paid') {
    return (
      (financePaymentLatestDate(b) || '').localeCompare(financePaymentLatestDate(a) || '') ||
      referenceLabel(a).localeCompare(referenceLabel(b))
    );
  }
  if (view === 'planned') {
    return (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31') ||
      referenceLabel(a).localeCompare(referenceLabel(b));
  }
  return referenceLabel(a).localeCompare(referenceLabel(b), 'pt-BR');
}

export function FinancePaymentsPage() {
  const { can } = useSession();
  const canPurchases = can('purchases.view');
  const canWorks = can('works.view');
  const canReconciliation = can('finance.account_reconciliation_view');
  const canManageFinance = can('finance.manage');
  const [searchParams] = useSearchParams();
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [occurrences, setOccurrences] = useState<PurchasePaymentOccurrenceV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originOpen, setOriginOpen] = useState(true);
  const [view, setView] = useState<FinancePaymentsView>(() => validView(searchParams.get('view')));
  const [originFilter, setOriginFilter] = useState(searchParams.get('origin') || '');
  const [storeFilter, setStoreFilter] = useState(searchParams.get('store') || '');
  const [stateFilter, setStateFilter] = useState(searchParams.get('uf') || '');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [occurrenceValuesOnly, setOccurrenceValuesOnly] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [focusItemId, setFocusItemId] = useState(searchParams.get('item') || '');
  const [focusServiceId, setFocusServiceId] = useState(searchParams.get('service') || '');
  const [documentsRow, setDocumentsRow] = useState<UnifiedFinancePaymentRowWithOccurrences | null>(null);
  const [datesRow, setDatesRow] = useState<UnifiedFinancePaymentRowWithOccurrences | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [plannedEditRow, setPlannedEditRow] = useState<UnifiedFinancePaymentRowWithOccurrences | null>(null);
  const [plannedDueDate, setPlannedDueDate] = useState('');
  const [plannedForwarding, setPlannedForwarding] = useState<'yes' | 'no' | 'keep'>('no');
  const [plannedSaving, setPlannedSaving] = useState(false);
  const [plannedEditError, setPlannedEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPurchases, nextWorks, nextStores, nextOccurrences] = await Promise.all([
        listSupplyPurchasesV2(),
        listWorkServices(),
        listStores(),
        listSupplyPurchasePaymentOccurrencesV2(),
      ]);
      setPurchases(nextPurchases);
      setWorks(nextWorks);
      setStores(nextStores);
      setOccurrences(nextOccurrences);
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : 'Não foi possível carregar os pagamentos.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => decorateFinancePaymentsWithOccurrences(buildUnifiedFinancePayments(purchases, works), occurrences),
    [occurrences, purchases, works],
  );
  const states = useMemo(() => [...new Set(stores.map((store) => store.state))].sort(), [stores]);
  const suppliers = useMemo(
    () => [...new Set(rows.map((row) => row.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  );
  const methods = useMemo(
    () => [...new Set(rows.flatMap((row) => [
      row.paymentMethod,
      ...row.paymentOccurrences.map((occurrence) => occurrence.paymentMethod),
    ]).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );
  const locationStoreIds = useMemo(() => {
    if (storeFilter) {
      const selectedStore = stores.find((store) => store.id === storeFilter);
      if (!selectedStore || (stateFilter && selectedStore.state !== stateFilter)) return [];
      return [selectedStore.id];
    }
    if (stateFilter) {
      return stores.filter((store) => store.state === stateFilter).map((store) => store.id);
    }
    return null;
  }, [stateFilter, storeFilter, stores]);
  const occurrenceValueScopeActive = occurrenceValuesOnly && Boolean(dateFrom || dateTo);

  const summaryRows = useMemo(() => {
    const search = normalized(query);
    const locationRows = locationStoreIds === null
      ? rows
      : scopeFinancePaymentsWithOccurrencesByStores(rows, locationStoreIds);
    const filtered = locationRows
      .filter(
        (row) =>
          !originFilter ||
          row.originAllocations[originFilter as FinancePaymentOrigin] > 0n,
      )
      .filter((row) => !supplierFilter || row.supplierName === supplierFilter)
      .filter(
        (row) =>
          !methodFilter ||
          row.paymentMethod === methodFilter ||
          row.paymentOccurrences.some((occurrence) => occurrence.paymentMethod === methodFilter),
      )
      .filter((row) => !focusItemId || row.supplyItemIds.includes(focusItemId))
      .filter((row) => !focusServiceId || row.workServiceId === focusServiceId)
      .filter((row) => financePaymentMatchesDateRange(row, dateFrom, dateTo))
      .filter(
        (row) =>
          !search ||
          normalized(
            [
              ...row.referenceCodes,
              row.supplierName,
              row.description,
              row.sourceLabel || '',
              row.installmentLabel,
              ...row.storeCodes,
              ...row.states,
              ...row.paymentOccurrences.flatMap((occurrence) => [
                occurrence.date,
                occurrence.referenceLabel || '',
                occurrence.paymentMethod || '',
              ]),
            ].join(' '),
          ).includes(search),
      );

    if (!occurrenceValueScopeActive) return filtered;
    return filtered.map((row) => scopeFinancePaymentToOccurrenceDateRange(row, dateFrom, dateTo));
  }, [
    dateFrom,
    dateTo,
    focusItemId,
    focusServiceId,
    locationStoreIds,
    methodFilter,
    occurrenceValueScopeActive,
    originFilter,
    query,
    rows,
    supplierFilter,
  ]);

  const totals = useMemo(() => financePaymentTotals(summaryRows), [summaryRows]);
  const originSummary = useMemo(() => financePaymentOriginSummary(summaryRows), [summaryRows]);
  const filteredRows = useMemo(
    () =>
      summaryRows
        .filter((row) => row.status === view)
        .sort((a, b) => dateSort(a, b, view)),
    [summaryRows, view],
  );
  const activeFilterCount = [
    originFilter,
    storeFilter,
    stateFilter,
    supplierFilter,
    methodFilter,
    dateFrom,
    dateTo,
    occurrenceValueScopeActive ? 'occurrence-values' : '',
    query.trim(),
    focusItemId,
    focusServiceId,
  ].filter(Boolean).length;

  const hasDeepFilter = Boolean(focusItemId || focusServiceId);
  const clearDeepFilter = () => {
    setFocusItemId('');
    setFocusServiceId('');
  };

  const originHref = (row: UnifiedFinancePaymentRow) => {
    const params = new URLSearchParams();
    params.set('refs', row.referenceCodes.join(','));
    if (row.storeIds.length === 1) params.set('store', row.storeIds[0]);
    return `${row.workServiceId ? '/obras' : '/suprimentos/compras'}?${params.toString()}`;
  };

  const rowDocuments = (row: UnifiedFinancePaymentRow) => {
    if (row.workServiceId) {
      const work = works.find((entry) => entry.id === row.workServiceId);
      if (!work) return [];
      const related = work.documents.filter(
        (document) =>
          !row.paymentIds.length ||
          !document.paymentId ||
          row.paymentIds.includes(document.paymentId),
      );
      return related
        .map((document) => ({
          id: document.id,
          label:
            document.documentType === 'payment_proof'
              ? 'Comprovante de pagamento'
              : document.documentType === 'invoice'
                ? 'Nota fiscal'
                : document.documentType === 'receipt'
                  ? 'Recibo'
                  : document.documentType === 'quote'
                    ? 'Orçamento'
                    : document.documentType.toUpperCase(),
          name: document.originalName || document.documentNumber || 'Documento',
          type: document.documentType,
          storagePath: document.storagePath,
          source: 'work' as const,
        }))
        .sort((a, b) => {
          const priority = (value: string) =>
            value === 'payment_proof' ? 0 : value === 'invoice' ? 1 : value === 'receipt' ? 2 : 3;
          return priority(a.type) - priority(b.type) || a.name.localeCompare(b.name, 'pt-BR');
        });
    }

    const documents = row.purchaseIds.flatMap((purchaseId) => {
      const purchase = purchases.find((entry) => entry.id === purchaseId);
      if (!purchase) return [];
      return purchase.attachments
        .filter(
          (attachment) =>
            !row.purchaseOrderIds.length ||
            attachment.purchaseOrderId === null ||
            (attachment.purchaseOrderId && row.purchaseOrderIds.includes(attachment.purchaseOrderId)),
        )
        .map((attachment) => ({
          id: attachment.id,
          label:
            attachment.documentType === 'payment_proof'
              ? 'Comprovante de pagamento'
              : attachment.documentType === 'invoice'
                ? 'Nota fiscal'
                : attachment.documentType === 'receipt'
                  ? 'Recibo'
                  : attachment.documentType === 'boleto'
                    ? 'Boleto'
                    : 'Documento',
          name: attachment.originalName || 'Documento',
          type: attachment.documentType,
          storagePath: attachment.storagePath,
          source: 'purchase' as const,
        }));
    });

    return documents.sort((a, b) => {
      const priority = (value: string) =>
        value === 'payment_proof' ? 0 : value === 'invoice' ? 1 : value === 'receipt' ? 2 : value === 'boleto' ? 3 : 4;
      return priority(a.type) - priority(b.type) || a.name.localeCompare(b.name, 'pt-BR');
    });
  };

  const openPlannedEdit = (row: UnifiedFinancePaymentRowWithOccurrences) => {
    setPlannedEditRow(row);
    setPlannedDueDate(row.date || '');
    setPlannedForwarding(
      row.forwardedToFinance === true ? 'yes' : row.forwardedToFinance === false ? 'no' : 'keep',
    );
    setPlannedEditError(null);
  };

  const savePlannedEdit = async () => {
    if (!plannedEditRow) return;
    if (!plannedDueDate) {
      setPlannedEditError('Informe a data de vencimento.');
      return;
    }
    if (!plannedEditRow.paymentIds.length) {
      setPlannedEditError('Pagamento sem identificação para edição.');
      return;
    }
    setPlannedSaving(true);
    setPlannedEditError(null);
    try {
      await updatePlannedFinancePayment({
        source: plannedEditRow.workServiceId ? 'work' : 'purchase',
        paymentIds: plannedEditRow.paymentIds,
        dueDate: plannedDueDate,
        forwardedToFinance: plannedForwarding === 'keep' ? null : plannedForwarding === 'yes',
      });
      setPlannedEditRow(null);
      await load();
    } catch (saveError) {
      setPlannedEditError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'Não foi possível atualizar a programação.',
      );
    } finally {
      setPlannedSaving(false);
    }
  };

  const openDocument = async (
    document: ReturnType<typeof rowDocuments>[number],
  ) => {
    if (!document.storagePath) return;
    setOpeningDocumentId(document.id);
    setDocumentError(null);
    try {
      const url =
        document.source === 'work'
          ? await createWorkDocumentSignedUrl(document.storagePath)
          : await createPurchaseAttachmentSignedUrlV2(document.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setDocumentError('Não foi possível abrir o documento.');
    } finally {
      setOpeningDocumentId(null);
    }
  };

  return (
    <div className="page-stack finance-payments-page">
      <header className="page-heading finance-payments-heading">
        <div>
          <span className="eyebrow">Financeiro</span>
          <h2>Pagamentos</h2>
          <p>Visão consolidada dos pagamentos realizados e dos compromissos a realizar.</p>
          {activeFilterCount > 0 && (
            <span className="finance-payments-filter-indicator" role="status">
              {activeFilterCount === 1 ? '1 filtro ativo' : `${activeFilterCount} filtros ativos`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FinanceUnifiedPaymentsExportActions
            rows={filteredRows}
            summaryRows={summaryRows}
            stores={stores}
            view={view}
            originFilter={originFilter}
            storeFilter={storeFilter}
            stateFilter={stateFilter}
            supplierFilter={supplierFilter}
            methodFilter={methodFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            query={query}
            hasDeepFilter={hasDeepFilter}
            onError={setError}
          />
          <button className="button button--secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={17} className={loading ? 'spin' : undefined} />
            Atualizar
          </button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? (
        <InlineLoading label="Carregando pagamentos" />
      ) : (
        <>
          <section className="finance-payments-kpis" aria-label="Resumo de pagamentos">
            <article className="finance-payments-kpi finance-payments-kpi--paid">
              <CheckCircle2 size={22} />
              <span>Pago</span>
              <strong>{formatBRL(totals.paidCents)}</strong>
              <small>{occurrenceValueScopeActive ? 'Ocorrências realizadas no período' : 'Pagamentos realizados'}</small>
            </article>
            <article className="finance-payments-kpi finance-payments-kpi--planned">
              <CalendarDays size={22} />
              <span>A pagar programado</span>
              <strong>{formatBRL(totals.plannedCents)}</strong>
              <small>Com data e forma definidas</small>
            </article>
            <article className="finance-payments-kpi finance-payments-kpi--unscheduled">
              <CircleAlert size={22} />
              <span>A pagar sem programação</span>
              <strong>{formatBRL(totals.unscheduledCents)}</strong>
              <small>Saldo ainda sem calendário financeiro</small>
            </article>
            <article className="finance-payments-kpi finance-payments-kpi--total">
              <WalletCards size={22} />
              <span>Compromissos totais</span>
              <strong>{formatBRL(totals.commitmentCents)}</strong>
              <small>Pago + programado + sem programação</small>
            </article>
          </section>

          <section className="finance-payment-origins">
            <button
              type="button"
              className="finance-payment-origins__toggle"
              aria-expanded={originOpen}
              onClick={() => setOriginOpen((current) => !current)}
            >
              <div>
                <strong>Origem dos valores</strong>
                <span>
                  {occurrenceValueScopeActive
                    ? 'Pago considera somente os valores das ocorrências dentro do período filtrado.'
                    : activeFilterCount > 0
                      ? 'Valores considerando os filtros ativos.'
                      : 'Equipamentos, mobiliário, itens gerais e obras e serviços.'}
                </span>
              </div>
              <span className="finance-payment-origins__action">
                {originOpen ? 'Recolher' : 'Expandir'}
                {originOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </span>
            </button>
            {originOpen && (
              <div className="finance-payment-origins__table-scroll">
                <table className="finance-payment-origins__table">
                  <thead>
                    <tr>
                      <th>Origem</th>
                      <th>Pago</th>
                      <th>A pagar programado</th>
                      <th>A pagar sem programação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {originSummary.map((row) => (
                      <tr key={row.origin}>
                        <td><strong>{row.label}</strong></td>
                        <td>{formatBRL(row.paidCents)}</td>
                        <td>{formatBRL(row.plannedCents)}</td>
                        <td>{formatBRL(row.unscheduledCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="finance-payments-filters" aria-label="Filtros de pagamentos">
            <label>
              Origem
              <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
                <option value="">Todas</option>
                {Object.entries(FINANCE_PAYMENT_ORIGIN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Loja
              <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="">Todas</option>
                {stores
                  .filter((store) => !stateFilter || store.state === stateFilter)
                  .map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.code} · {store.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              UF
              <select
                value={stateFilter}
                onChange={(event) => {
                  setStateFilter(event.target.value);
                  setStoreFilter('');
                }}
              >
                <option value="">Todas</option>
                {states.map((state) => <option key={state}>{state}</option>)}
              </select>
            </label>
            <label>
              Fornecedor / prestador
              <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
                <option value="">Todos</option>
                {suppliers.map((supplier) => <option key={supplier}>{supplier}</option>)}
              </select>
            </label>
            <label>
              Forma de pagamento
              <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                <option value="">Todas</option>
                {methods.map((method) => (
                  <option key={method} value={method}>{PAYMENT_LABELS[method] || method}</option>
                ))}
              </select>
            </label>
            <label>
              De
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '2px 4px',
                textTransform: 'none',
                fontSize: '0.72rem',
              }}
            >
              <input
                type="checkbox"
                checked={occurrenceValuesOnly}
                disabled={!dateFrom && !dateTo}
                onChange={(event) => setOccurrenceValuesOnly(event.target.checked)}
                style={{ width: 16, minWidth: 16, minHeight: 16, height: 16, padding: 0, margin: 0 }}
              />
              Considerar somente os valores das ocorrências dentro do período filtrado
            </label>
            <label className="finance-payments-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar referência, fornecedor, item ou serviço"
              />
            </label>
          </section>

          {hasDeepFilter && (
            <div className="finance-payments-focus" role="status">
              <span>Filtro vindo do Detalhe da Loja ativo.</span>
              <button type="button" onClick={clearDeepFilter}>Remover filtro do item/serviço</button>
            </div>
          )}

          <div className="finance-payments-tabs" role="tablist" aria-label="Situação dos pagamentos">
            {(Object.keys(VIEW_LABELS) as FinancePaymentsView[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                className={`finance-payments-tab finance-payments-tab--${key} ${view === key ? 'is-active' : ''}`}
                onClick={() => setView(key)}
              >
                {VIEW_LABELS[key]}
              </button>
            ))}
          </div>

          <section className="finance-payments-panel">
            <header>
              <div>
                <h3>{VIEW_LABELS[view]}</h3>
                <p>
                  {view === 'paid'
                    ? occurrenceValueScopeActive
                      ? 'Pagamentos já efetivados. Valores e datas consideram somente as ocorrências dentro do período filtrado.'
                      : 'Pagamentos já efetivados. A coluna de data considera todas as ocorrências financeiras registradas.'
                    : view === 'planned'
                      ? 'Pagamentos com vencimento e forma já definidos.'
                      : 'Saldos existentes que ainda precisam de programação financeira.'}
                </p>
              </div>
              <span>{filteredRows.length} registro(s)</span>
            </header>
            {filteredRows.length ? (
              <div className="finance-payments-table-scroll">
                <table className="finance-payments-table">
                  <thead>
                    <tr>
                      <th>{view === 'paid' ? 'Data pagamento' : view === 'planned' ? 'Vencimento' : 'Origem'}</th>
                      <th>{view === 'unscheduled' ? 'Referência' : 'Origem'}</th>
                      <th>{view === 'unscheduled' ? 'Fornecedor / prestador' : 'Referência'}</th>
                      <th>{view === 'unscheduled' ? 'Loja / UF' : 'Fornecedor / prestador'}</th>
                      <th>{view === 'unscheduled' ? 'Vencimento' : 'Forma'}</th>
                      <th>{view === 'unscheduled' ? 'Forma' : 'Identificação / parcela'}</th>
                      <th>Valor</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const origin = rowOriginLabel(row);
                      const store = `${rowStoreLabel(row)} · ${row.states.join(', ') || 'UF não informada'}`;
                      return (
                        <tr key={row.id}>
                          {view === 'unscheduled' ? (
                            <>
                              <td><strong>{origin}</strong></td>
                              <td>
                                <strong>{referenceLabel(row)}</strong>
                                <small>{row.description}</small>
                              </td>
                              <td><strong>{row.supplierName}</strong></td>
                              <td><strong>{store}</strong></td>
                              <td><span className="finance-payment-missing">Não informado</span></td>
                              <td><span className="finance-payment-missing">Não informada</span></td>
                            </>
                          ) : (
                            <>
                              <td>
                                {view === 'paid'
                                  ? <FinancePaymentDatesCell row={row} />
                                  : <strong>{formatDate(row.date)}</strong>}
                              </td>
                              <td><strong>{origin}</strong></td>
                              <td>
                                <strong>{referenceLabel(row)}</strong>
                                <small>{row.description}</small>
                              </td>
                              <td>
                                <strong>{row.supplierName}</strong>
                                <small>{store}</small>
                              </td>
                              <td>
                                <strong>{row.paymentMethod ? PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod : '—'}</strong>
                              </td>
                              <td>
                                <strong>{row.sourceLabel || row.installmentLabel}</strong>
                                {row.sourceLabel && row.installmentLabel !== row.sourceLabel && (
                                  <small>{row.installmentLabel}</small>
                                )}
                                {view === 'planned' && (
                                  <span className={`finance-payment-forwarded finance-payment-forwarded--${row.forwardedToFinance === true ? 'yes' : row.forwardedToFinance === false ? 'no' : 'partial'}`}>
                                    Financeiro: {row.forwardedToFinance === true ? 'Sim' : row.forwardedToFinance === false ? 'Não' : 'Parcial'}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="finance-payments-money"><strong>{formatBRL(row.amountCents)}</strong></td>
                          <td>
                            <div className="finance-payment-actions">
                              {view === 'planned' && canManageFinance && (
                                <button
                                  type="button"
                                  className="finance-payment-document-link finance-payment-edit-programming"
                                  onClick={() => openPlannedEdit(row)}
                                >
                                  <Pencil size={13} />
                                  Editar programação
                                </button>
                              )}
                              {view === 'paid' && (
                                <FinancePaymentDatesAction
                                  onClick={() => setDatesRow(rows.find((candidate) => candidate.id === row.id) || row)}
                                />
                              )}
                              {view === 'paid' && canReconciliation && (
                                <Link
                                  className="finance-payment-origin-link"
                                  to={financePaymentLatestDate(row)
                                    ? `/financeiro/conciliacao-conta?date=${financePaymentLatestDate(row)}`
                                    : '/financeiro/conciliacao-conta'}
                                  title="Abrir esta data na Conciliação Conta"
                                >
                                  <Scale size={13} />
                                  Conciliação
                                </Link>
                              )}
                              {(row.workServiceId ? canWorks : canPurchases) ? (
                                <Link className="finance-payment-origin-link" to={originHref(row)}>
                                  Ver origem
                                  <ExternalLink size={13} />
                                </Link>
                              ) : (
                                <span className="finance-payments-muted">Sem acesso</span>
                              )}
                              <button
                                type="button"
                                className="finance-payment-document-link"
                                onClick={() => setDocumentsRow(row)}
                              >
                                <Paperclip size={13} />
                                Ver anexos
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={`Nenhum pagamento em “${VIEW_LABELS[view]}”`}
                detail="Ajuste os filtros ou escolha outra situação."
              />
            )}
          </section>
        </>
      )}

      <FinancePaymentOccurrencesModal row={datesRow} onClose={() => setDatesRow(null)} />

      {plannedEditRow && (
        <Modal
          open
          title={`Editar programação · ${referenceLabel(plannedEditRow)}`}
          description="Altere o vencimento e informe se este pagamento já foi repassado ao Financeiro."
          onClose={() => {
            if (!plannedSaving) {
              setPlannedEditRow(null);
              setPlannedEditError(null);
            }
          }}
          className="finance-planned-edit-modal"
        >
          <div className="finance-planned-edit-form">
            {plannedEditError && <div className="form-error">{plannedEditError}</div>}
            <div className="finance-planned-edit-summary">
              <div><span>Fornecedor / prestador</span><strong>{plannedEditRow.supplierName}</strong></div>
              <div><span>Valor</span><strong>{formatBRL(plannedEditRow.amountCents)}</strong></div>
              <div><span>Identificação</span><strong>{plannedEditRow.installmentLabel}</strong></div>
            </div>
            <label>
              Data de vencimento
              <input type="date" value={plannedDueDate} onChange={(event) => setPlannedDueDate(event.target.value)} />
            </label>
            <label>
              Repassado ao Financeiro
              <select
                value={plannedForwarding}
                onChange={(event) => setPlannedForwarding(event.target.value as 'yes' | 'no' | 'keep')}
              >
                {plannedEditRow.forwardedToFinance === null && (
                  <option value="keep">Manter situação atual (parcial)</option>
                )}
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </select>
            </label>
            <small className="finance-planned-edit-help">
              Esta marcação é apenas de controle do repasse. Ela não altera a situação do pagamento para Pago.
            </small>
            <div className="finance-planned-edit-actions">
              <button type="button" className="button button--secondary" disabled={plannedSaving} onClick={() => {
                setPlannedEditRow(null);
                setPlannedEditError(null);
              }}>
                Cancelar
              </button>
              <button type="button" className="button" disabled={plannedSaving} onClick={() => void savePlannedEdit()}>
                {plannedSaving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {documentsRow && (
        <Modal
          open
          title={`Anexos · ${referenceLabel(documentsRow)}`}
          description="Comprovantes e notas aparecem primeiro."
          onClose={() => {
            setDocumentsRow(null);
            setDocumentError(null);
          }}
          className="finance-payments-documents-modal"
        >
          {documentError && <div className="form-error">{documentError}</div>}
          {rowDocuments(documentsRow).length ? (
            <div className="finance-payments-documents-list">
              {rowDocuments(documentsRow).map((document) => (
                <article key={document.id}>
                  <FileText size={18} />
                  <div>
                    <strong>{document.label}</strong>
                    <small>{document.name}</small>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={!document.storagePath || openingDocumentId === document.id}
                    onClick={() => void openDocument(document)}
                  >
                    {openingDocumentId === document.id ? 'Abrindo...' : 'Abrir'}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sem anexos vinculados"
              detail="Não encontramos comprovantes, notas ou outros documentos relacionados a este pagamento."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
