import type { FinanceOverviewStoreRow } from './finance-overview';
import {
  financePaymentTotals, scopeFinancePaymentsByStores,
  type UnifiedFinancePaymentRow,
} from './finance-payments';
import type { Store } from './types';

export type ForecastIndicator =
  | 'bb' | 'activeStores' | 'planned' | 'forecastBalance'
  | 'contracted' | 'contractBalance' | 'paid' | 'payable' | 'bbBalance';

export interface ForecastFilters {
  state: string;
  storeId: string;
  operation: 'all' | 'active' | 'inactive';
  implantation: 'all' | 'open' | 'closed';
}
export interface ForecastDetail {
  id: string;
  storeCode: string;
  storeName: string;
  state: string;
  reference: string;
  category: string;
  status: string;
  amountCents: bigint;
}
export interface ForecastSnapshot {
  bbCents: bigint;
  activeStores: number;
  plannedCents: bigint;
  forecastBalanceCents: bigint;
  contractedCents: bigint;
  contractBalanceCents: bigint;
  paidCents: bigint;
  payableCents: bigint;
  bbBalanceCents: bigint;
  executionPercent: number | null;
  details: Record<ForecastIndicator, ForecastDetail[]>;
}
const emptyDetails = (): Record<ForecastIndicator, ForecastDetail[]> => ({
  bb: [], activeStores: [], planned: [], forecastBalance: [], contracted: [],
  contractBalance: [], paid: [], payable: [], bbBalance: [],
});
const sum = (rows: ForecastDetail[]): bigint => rows.reduce((total, item) => total + item.amountCents, 0n);
const storeInfo = (store: Store) => ({
  storeCode: store.code, storeName: store.name, state: store.state,
});
const perStore = (
  row: FinanceOverviewStoreRow,
  store: Store,
  metric: ForecastIndicator,
  amountCents: bigint,
  category: string,
  reference: string,
): ForecastDetail => ({
  id: `${metric}:${row.storeId}`, ...storeInfo(store), reference,
  category, status: store.financialClosure?.state === 'closed' ? 'Finalizada' : 'Em andamento',
  amountCents,
});

export function selectForecastStores(stores: Store[], filter: ForecastFilters): Store[] {
  return stores.filter((store) =>
    (!filter.state || store.state === filter.state)
    && (!filter.storeId || store.id === filter.storeId)
    && (filter.operation === 'all' ||
      (filter.operation === 'active' ? store.status === 'active' : store.status === 'inactive'))
    && (filter.implantation === 'all' ||
      store.financialClosure?.state === (filter.implantation === 'closed' ? 'closed' : 'open')));
}

/**
 * All monetary totals are derived from the same Finance Overview store rows and
 * the same unified payment ledger as Financeiro > Pagamentos. No monetary parsing,
 * fictional totals, or independent formula for stores/purchases are introduced.
 */
export function buildBudgetForecast(
  stores: Store[],
  overview: FinanceOverviewStoreRow[],
  payments: UnifiedFinancePaymentRow[],
  filters: ForecastFilters,
): ForecastSnapshot {
  const chosenStores = selectForecastStores(stores, filters);
  const byStoreId = new Map(chosenStores.map((store) => [store.id, store]));
  const selectedIds = new Set(byStoreId.keys());
  const chosenRows = overview.filter((row) => selectedIds.has(row.storeId));
  const details = emptyDetails();

  chosenRows.forEach((row) => {
    const store = byStoreId.get(row.storeId)!;
    const basis = `Financeiro · ${row.code}`;
    details.bb.push(perStore(row, store, 'bb', row.budgetBbCents, 'Verba BB', basis));
    if (store.status === 'active' && row.budgetBbCents > 0n) {
      details.activeStores.push(perStore(row, store, 'activeStores', 1n, 'Loja ativa com verba', basis));
    }
    details.planned.push(perStore(row, store, 'planned', row.budgetTotalCents, 'Orçamento previsto', basis));
    details.forecastBalance.push(perStore(row, store, 'forecastBalance',
      row.budgetBbCents - row.budgetTotalCents, 'Verba − orçamento previsto', basis));
    details.contracted.push(perStore(row, store, 'contracted', row.realizedTotalCents,
      'Compras, obras e serviços', basis));
    details.contractBalance.push(perStore(row, store, 'contractBalance',
      row.budgetTotalCents - row.realizedTotalCents, 'Previsto − contratado', basis));
    details.bbBalance.push(perStore(row, store, 'bbBalance',
      row.budgetBbCents - row.realizedTotalCents, 'Verba − contratado', basis));
  });

  const anyFilter = Boolean(filters.state || filters.storeId) ||
    filters.operation !== 'all' || filters.implantation !== 'all';
  const ledger = anyFilter
    ? scopeFinancePaymentsByStores(payments, [...selectedIds])
    : payments;
  const paymentAmounts = financePaymentTotals(ledger);

  ledger.forEach((entry) => {
    const linked = entry.storeAllocations.filter((allocation) => !anyFilter || selectedIds.has(allocation.storeId));
    let accounted = 0n;
    linked.forEach((allocation) => {
      accounted += allocation.amountCents;
      const store = byStoreId.get(allocation.storeId);
      const item: ForecastDetail = {
        id: `${entry.id}:${allocation.storeId}`,
        storeCode: store?.code || allocation.storeCode,
        storeName: store?.name || 'Loja não identificada',
        state: store?.state || allocation.state,
        reference: entry.referenceCodes.join(' + ') || entry.installmentLabel,
        category: entry.workServiceId ? 'Obras e Serviços' : 'Compras',
        status: entry.status === 'paid' ? 'Pago' : entry.status === 'planned' ? 'Programado' : 'Sem programação',
        amountCents: allocation.amountCents,
      };
      details[entry.status === 'paid' ? 'paid' : 'payable'].push(item);
    });
    // Financeiro > Pagamentos includes payments not yet distributed to stores
    // in the all-stores view; retain these amounts explicitly, never hide them.
    const undistributed = entry.amountCents - accounted;
    if (!anyFilter && undistributed !== 0n) {
      details[entry.status === 'paid' ? 'paid' : 'payable'].push({
        id: `${entry.id}:unallocated`, storeCode: '—', storeName: 'Não alocado',
        state: '—', reference: entry.referenceCodes.join(' + ') || entry.installmentLabel,
        category: entry.workServiceId ? 'Obras e Serviços' : 'Compras',
        status: entry.status === 'paid' ? 'Pago' : entry.status === 'planned' ? 'Programado' : 'Sem programação',
        amountCents: undistributed,
      });
    }
  });

  const bbCents = sum(details.bb);
  const plannedCents = sum(details.planned);
  const contractedCents = sum(details.contracted);
  const paidCents = paymentAmounts.paidCents;
  const payableCents = paymentAmounts.plannedCents + paymentAmounts.unscheduledCents;

  return {
    bbCents, activeStores: details.activeStores.length, plannedCents,
    forecastBalanceCents: bbCents - plannedCents,
    contractedCents, contractBalanceCents: plannedCents - contractedCents,
    paidCents, payableCents, bbBalanceCents: bbCents - contractedCents,
    executionPercent: plannedCents > 0n ? Number(contractedCents * 10000n / plannedCents) / 100 : null,
    details,
  };
}
