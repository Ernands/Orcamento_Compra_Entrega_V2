import type { FinanceOverviewStoreRow } from './finance-overview';
import {
  financePaymentTotals, scopeFinancePaymentsByStores,
  type UnifiedFinancePaymentRow,
} from './finance-payments';
import type { Store } from './types';
import type { FinanceStoreRow } from './finance-types';
import type { WorkService } from './works-types';
import type { PlannedBudgetItem } from './planned-budget-types';
import { plannedBudgetAllocations } from './planned-budget-calculations';
import { moneyToCents } from './supply-calculations';

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
  storesWithBudget: number;
  inactiveStoresWithBudget: number;
  inactiveBudgetCents: bigint;
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
export interface ForecastEvidence {
  storePurchases: FinanceStoreRow[];
  works: WorkService[];
  plannedBudgetItems: PlannedBudgetItem[];
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
  evidence?: ForecastEvidence,
  eligibleStoreIds?: ReadonlySet<string>,
): ForecastSnapshot {
  const chosenStores = selectForecastStores(stores, filters)
    .filter((store)=>!eligibleStoreIds||eligibleStoreIds.has(store.id));
  const byStoreId = new Map(chosenStores.map((store) => [store.id, store]));
  const selectedIds = new Set(byStoreId.keys());
  const chosenRows = overview.filter((row) => selectedIds.has(row.storeId));
  const details = emptyDetails();

  chosenRows.forEach((row) => {
    const store = byStoreId.get(row.storeId)!;
    const basis = `Financeiro · ${row.code}`;
    details.bb.push({
      ...perStore(row, store, 'bb', row.budgetBbCents, 'Verba BB', basis),
      status: store.status === 'active' ? 'Ativa' : 'Inativa',
    });
    if (store.status === 'active' && row.budgetBbCents > 0n) {
      details.activeStores.push({
        ...perStore(row, store, 'activeStores', 1n, 'Loja ativa com verba', basis),
        status: 'Ativa',
      });
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

  // Expand the contracted and planned store summaries into their real records
  // when (and only when) the source-level cents reconcile with Financeiro.
  // If source records cannot account for the exact store total, preserve the
  // original consolidated store row rather than creating artificial entries.
  if (evidence) {
    const purchasesByStore = new Map(evidence.storePurchases.map((row) => [row.storeId, row]));
    const allocationsByStore = new Map<string, ReturnType<typeof plannedBudgetAllocations>>();
    plannedBudgetAllocations(evidence.plannedBudgetItems).forEach((allocation) => {
      const current = allocationsByStore.get(allocation.storeId) || [];
      current.push(allocation);
      allocationsByStore.set(allocation.storeId, current);
    });
    chosenRows.forEach((row) => {
      const store = byStoreId.get(row.storeId)!;
      const make = (id: string, reference: string, category: string,
        amountCents: bigint, status: string): ForecastDetail => ({
        id, ...storeInfo(store), reference, category, amountCents, status,
      });
      const contracted = [
        ...(purchasesByStore.get(row.storeId)?.purchases || []).map((purchase) =>
          make(`contracted:${row.storeId}:${purchase.id}`, purchase.purchaseCode,
            'Compra · ' + purchase.supplierName, purchase.realizedCents, 'Realizado')),
        ...evidence.works.filter((work) => work.storeId === row.storeId && work.status !== 'cancelled')
          .map((work) => make(`contracted:${row.storeId}:${work.id}`,work.code,
            'Obras e Serviços · ' + work.category, moneyToCents(work.contractedAmount),work.status)),
      ];
      if (contracted.length && sum(contracted) === row.realizedTotalCents) {
        details.contracted = details.contracted.filter((detail) => detail.id !== `contracted:${row.storeId}`)
          .concat(contracted);
      }
      const planned = [
        ...(allocationsByStore.get(row.storeId) || []).map((allocation) => make(
          `planned:${row.storeId}:${allocation.budgetItemId}:${allocation.segmentId}`,
          allocation.itemCode, 'Orçamento previsto · ' + allocation.segmentName,
          allocation.totalCents, 'Orçado')),
        ...evidence.works.filter((work) => work.storeId === row.storeId && work.status !== 'cancelled')
          .map((work) => make(`planned:${row.storeId}:${work.id}`, work.code,
            'Obras e Serviços · orçamento', moneyToCents(work.budgetAmount), work.status)),
      ];
      if (planned.length && sum(planned) === row.budgetTotalCents) {
        details.planned = details.planned.filter((detail) => detail.id !== `planned:${row.storeId}`)
          .concat(planned);
      }
    });
  }

  const anyFilter = Boolean(filters.state || filters.storeId) ||
    filters.operation !== 'all' || filters.implantation !== 'all' || Boolean(eligibleStoreIds);
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
  const withBudget = chosenRows.filter((row) => row.budgetBbCents > 0n);
  const inactiveWithBudget = withBudget.filter((row) =>
    byStoreId.get(row.storeId)?.status === 'inactive');
  const storesWithBudget = withBudget.length;
  const inactiveStoresWithBudget = inactiveWithBudget.length;
  const inactiveBudgetCents = inactiveWithBudget.reduce((total, row) =>
    total + row.budgetBbCents, 0n);
  const plannedCents = sum(details.planned);
  const contractedCents = sum(details.contracted);
  const paidCents = paymentAmounts.paidCents;
  const payableCents = paymentAmounts.plannedCents + paymentAmounts.unscheduledCents;

  return {
    bbCents, activeStores: details.activeStores.length, storesWithBudget,
    inactiveStoresWithBudget, inactiveBudgetCents, plannedCents,
    forecastBalanceCents: bbCents - plannedCents,
    contractedCents, contractBalanceCents: plannedCents - contractedCents,
    paidCents, payableCents, bbBalanceCents: bbCents - contractedCents,
    executionPercent: plannedCents > 0n ? Number(contractedCents * 10000n / plannedCents) / 100 : null,
    details,
  };
}
