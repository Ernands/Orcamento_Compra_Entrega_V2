import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  RefreshCcw,
  Search,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading } from '../components/ui';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import { listWorkServices } from '../data/works/works-repository';
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

function dateSort(a: UnifiedFinancePaymentRow, b: UnifiedFinancePaymentRow, view: FinancePaymentsView) {
  if (view === 'paid') {
    return (b.date || '').localeCompare(a.date || '') || referenceLabel(a).localeCompare(referenceLabel(b));
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
  const [searchParams] = useSearchParams();
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
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
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [focusItemId, setFocusItemId] = useState(searchParams.get('item') || '');
  const [focusServiceId, setFocusServiceId] = useState(searchParams.get('service') || '');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPurchases, nextWorks, nextStores] = await Promise.all([
        listSupplyPurchasesV2(),
        listWorkServices(),
        listStores(),
      ]);
      setPurchases(nextPurchases);
      setWorks(nextWorks);
      setStores(nextStores);
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

  const rows = useMemo(() => buildUnifiedFinancePayments(purchases, works), [purchases, works]);
  const totals = useMemo(() => financePaymentTotals(rows), [rows]);
  const originSummary = useMemo(() => financePaymentOriginSummary(rows), [rows]);
  const states = useMemo(() => [...new Set(stores.map((store) => store.state))].sort(), [stores]);
  const suppliers = useMemo(
    () => [...new Set(rows.map((row) => row.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  );
  const methods = useMemo(
    () => [...new Set(rows.map((row) => row.paymentMethod).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const search = normalized(query);
    return rows
      .filter((row) => row.status === view)
      .filter(
        (row) =>
          !originFilter ||
          row.originAllocations[originFilter as FinancePaymentOrigin] > 0n,
      )
      .filter((row) => !storeFilter || row.storeIds.includes(storeFilter))
      .filter((row) => !stateFilter || row.states.includes(stateFilter))
      .filter((row) => !supplierFilter || row.supplierName === supplierFilter)
      .filter((row) => !methodFilter || row.paymentMethod === methodFilter)
      .filter((row) => !focusItemId || row.supplyItemIds.includes(focusItemId))
      .filter((row) => !focusServiceId || row.workServiceId === focusServiceId)
      .filter((row) => !dateFrom || (row.date !== null && row.date >= dateFrom))
      .filter((row) => !dateTo || (row.date !== null && row.date <= dateTo))
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
            ].join(' '),
          ).includes(search),
      )
      .sort((a, b) => dateSort(a, b, view));
  }, [
    dateFrom,
    dateTo,
    focusItemId,
    focusServiceId,
    methodFilter,
    originFilter,
    query,
    rows,
    stateFilter,
    storeFilter,
    supplierFilter,
    view,
  ]);

  const hasDeepFilter = Boolean(focusItemId || focusServiceId);
  const clearDeepFilter = () => {
    setFocusItemId('');
    setFocusServiceId('');
  };

  return (
    <div className="page-stack finance-payments-page">
      <header className="page-heading finance-payments-heading">
        <div>
          <span className="eyebrow">Financeiro</span>
          <h2>Pagamentos</h2>
          <p>Visão consolidada dos pagamentos realizados e dos compromissos a realizar.</p>
        </div>
        <button className="button button--secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={17} className={loading ? 'spin' : undefined} />
          Atualizar
        </button>
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
              <small>Pagamentos realizados</small>
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
                <span>Equipamentos, mobiliário, itens gerais e obras e serviços.</span>
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
                className={view === key ? 'is-active' : ''}
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
                    ? 'Pagamentos já efetivados.'
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
                      const originLink = row.workServiceId ? '/obras' : '/suprimentos/compras';
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
                              <td><strong>{formatDate(row.date)}</strong></td>
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
                              </td>
                            </>
                          )}
                          <td className="finance-payments-money"><strong>{formatBRL(row.amountCents)}</strong></td>
                          <td>
                            {(row.workServiceId ? canWorks : canPurchases) ? (
                              <Link className="finance-payment-origin-link" to={originLink}>
                                Ver origem
                                <ExternalLink size={13} />
                              </Link>
                            ) : (
                              <span className="finance-payments-muted">Sem acesso</span>
                            )}
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
    </div>
  );
}
