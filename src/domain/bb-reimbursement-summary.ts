import type { FinanceOverviewStoreRow } from './finance-overview';
import type { ManagerialSettlement } from './managerial-reimbursements';
import { selectForecastStores, type ForecastFilters } from './budget-forecast';
import type { Store } from './types';

export interface BbReimbursementStoreRow {
  storeId: string;
  storeCode: string;
  storeName: string;
  state: string;
  totalCents: bigint;
  receivedCents: bigint;
  remainingCents: bigint;
}

export interface BbReimbursementSummary {
  totalCents: bigint;
  receivedCents: bigint;
  remainingCents: bigint;
  rows: BbReimbursementStoreRow[];
}

/**
 * Presentation-only BB breakdown. It never changes the existing forecast
 * calculations or the separate "Considerar reembolsos" behavior.
 *
 * Call with stores and Financeiro rows already scoped at the repository level
 * to the selected implantation waves. The same UI filters used by the
 * financial forecast are applied again here. Receipts are NET movements
 * (including reversals), never requested/approved amounts or absorbed losses.
 */
export function buildBbReimbursementSummary(
  stores: readonly Store[],
  overview: readonly FinanceOverviewStoreRow[],
  filters: ForecastFilters,
  settlements: ReadonlyMap<string, ManagerialSettlement>,
): BbReimbursementSummary {
  const selected = new Map(selectForecastStores([...stores], filters).map((s) => [s.id, s]));
  const rows: BbReimbursementStoreRow[] = [];

  for (const finance of overview) {
    const store = selected.get(finance.storeId);
    // Same eligible stores as the original BB card: active, with a positive allowance.
    if (!store || store.status !== 'active' || finance.budgetBbCents <= 0n) continue;
    const receivedCents = settlements.get(store.id)?.receivedCents ?? 0n;
    rows.push({
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name,
      state: store.state,
      totalCents: finance.budgetBbCents,
      receivedCents,
      // Absorbed losses are intentionally NOT treated as BB cash receipts.
      remainingCents: finance.budgetBbCents - receivedCents,
    });
  }

  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  rows.sort((a, b) => collator.compare(a.state, b.state)
    || collator.compare(a.storeCode, b.storeCode));

  return {
    totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0n),
    receivedCents: rows.reduce((sum, row) => sum + row.receivedCents, 0n),
    remainingCents: rows.reduce((sum, row) => sum + row.remainingCents, 0n),
    rows,
  };
}
