import type { FinanceOverviewStoreRow } from './finance-overview';
import type { FinanceStoreRow } from './finance-types';
import type { UnifiedFinancePaymentRow } from './finance-payments';
import type { Store } from './types';

/**
 * Hide inactive stores only when they have no financial value. Never remove
 * financial records or change payment totals: this is a presentation filter.
 */
export function filterInactiveStoresWithoutFinancialValues(
  stores: Store[],
  storeIdsWithValues: ReadonlySet<string>,
): Store[] {
  return stores.filter((store) => store.status !== 'inactive' || storeIdsWithValues.has(store.id));
}

/** Financial overview includes the BB budget, planned/realized purchases and works. */
export function financeOverviewActivityStoreIds(
  overviewRows: FinanceOverviewStoreRow[],
  purchaseStoreRows: FinanceStoreRow[],
): Set<string> {
  const withValue = new Set<string>();

  overviewRows.forEach((row) => {
    if ([
      row.budgetBbCents,
      row.equipmentBudgetCents,
      row.furnitureBudgetCents,
      row.worksBudgetCents,
      row.equipmentRealizedCents,
      row.furnitureRealizedCents,
      row.worksContractedCents,
      row.paidCents,
      row.payableCents,
      row.worksDocumentedCents,
    ].some((amount) => amount !== 0n)) {
      withValue.add(row.storeId);
    }
  });

  // A store can have a recorded reimbursement even when its overview is zero.
  purchaseStoreRows.forEach((row) => {
    if ([
      row.realizedCents,
      row.paidCents,
      row.plannedCents,
      row.requestedCents,
      row.approvedCents,
      row.receivedCents,
    ].some((amount) => amount !== 0n)) {
      withValue.add(row.storeId);
    }
  });

  return withValue;
}

/** Payment filters list only inactive stores with a real allocation or unallocated expense. */
export function financePaymentActivityStoreIds(rows: UnifiedFinancePaymentRow[]): Set<string> {
  const withValue = new Set<string>();

  rows.forEach((row) => {
    row.storeAllocations.forEach((allocation) => {
      if (allocation.amountCents !== 0n) withValue.add(allocation.storeId);
    });
    // When a payment is not distributed yet, retain its associated stores.
    if (row.unallocatedCents !== 0n) {
      row.storeIds.forEach((storeId) => withValue.add(storeId));
    }
  });

  return withValue;
}
