import type { FinanceStoreRow } from './finance-types';
import type { PurchaseV2 } from './purchase-v2-types';
import type { Store } from './types';
import type { FinanceStoreBudget, WorkService } from './works-types';
import { moneyToCents, quantityToThousandths } from './supply-calculations';

export interface FinanceOverviewStoreRow {
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  budgetBbCents: bigint;
  itemsBudgetCents: bigint;
  worksBudgetCents: bigint;
  budgetTotalCents: bigint;
  itemsRealizedCents: bigint;
  worksContractedCents: bigint;
  realizedTotalCents: bigint;
  differenceCents: bigint;
  paidCents: bigint;
  payableCents: bigint;
  worksDocumentedCents: bigint;
  worksMissingDocumentsCents: bigint;
  documentationStatus: 'complete' | 'partial' | 'pending' | 'none';
}

function allocateCents(
  totalCents: bigint,
  entries: Array<{ key: string; weight: bigint }>,
): Map<string, bigint> {
  const positive = entries.filter((entry) => entry.weight > 0n);
  const result = new Map<string, bigint>();
  if (!positive.length || totalCents === 0n) return result;

  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const remainders: Array<{ key: string; value: bigint }> = [];
  let allocated = 0n;

  positive.forEach((entry) => {
    const numerator = totalCents * entry.weight;
    const base = numerator / totalWeight;
    result.set(entry.key, base);
    allocated += base;
    remainders.push({ key: entry.key, value: numerator % totalWeight });
  });

  remainders.sort((a, b) =>
    a.value === b.value ? a.key.localeCompare(b.key) : a.value > b.value ? -1 : 1,
  );

  let remaining = totalCents - allocated;
  let index = 0;
  while (remaining > 0n && remainders.length) {
    const key = remainders[index % remainders.length].key;
    result.set(key, (result.get(key) || 0n) + 1n);
    remaining -= 1n;
    index += 1;
  }

  return result;
}

export function purchaseApprovedBudgetByStore(purchases: PurchaseV2[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();

  purchases
    .filter((purchase) => !['returned', 'cancelled'].includes(purchase.status))
    .forEach((purchase) => {
      purchase.items.forEach((item) => {
        const lineCents = moneyToCents(item.approvedLineTotal);
        if (lineCents <= 0n) return;

        const weights = new Map<string, bigint>();
        item.destinations.forEach((destination) => {
          const destinationQuantity = quantityToThousandths(destination.quantity);
          const storeAllocations = destination.stores
            .map((store) => ({
              storeId: store.storeId,
              weight: store.allocatedQuantity
                ? quantityToThousandths(store.allocatedQuantity)
                : 0n,
            }))
            .filter((entry) => entry.weight > 0n);

          if (storeAllocations.length) {
            storeAllocations.forEach((entry) =>
              weights.set(entry.storeId, (weights.get(entry.storeId) || 0n) + entry.weight),
            );
          } else if (destination.storeId && destinationQuantity > 0n) {
            weights.set(
              destination.storeId,
              (weights.get(destination.storeId) || 0n) + destinationQuantity,
            );
          }
        });

        if (!weights.size && item.storeId) {
          weights.set(item.storeId, quantityToThousandths(item.quantityApproved) || 1n);
        }

        if (!weights.size && purchase.stores.length) {
          purchase.stores.forEach((store) => weights.set(store.storeId, 1n));
        }

        allocateCents(
          lineCents,
          [...weights.entries()].map(([key, weight]) => ({ key, weight })),
        ).forEach((amount, storeId) =>
          totals.set(storeId, (totals.get(storeId) || 0n) + amount),
        );
      });
    });

  return totals;
}

function worksByStore(works: WorkService[]) {
  const rows = new Map<
    string,
    {
      budgetCents: bigint;
      contractedCents: bigint;
      paidCents: bigint;
      documentedCents: bigint;
    }
  >();

  works
    .filter((work) => work.status !== 'cancelled')
    .forEach((work) => {
      const current = rows.get(work.storeId) || {
        budgetCents: 0n,
        contractedCents: 0n,
        paidCents: 0n,
        documentedCents: 0n,
      };
      current.budgetCents += moneyToCents(work.budgetAmount);
      current.contractedCents += moneyToCents(work.contractedAmount);
      current.paidCents += work.payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
      current.documentedCents += work.documents.reduce(
        (sum, document) =>
          sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
        0n,
      );
      rows.set(work.storeId, current);
    });

  return rows;
}

export function buildFinanceOverviewRows(values: {
  stores: Store[];
  purchases: PurchaseV2[];
  purchaseStoreRows: FinanceStoreRow[];
  works: WorkService[];
  budgets: FinanceStoreBudget[];
}): FinanceOverviewStoreRow[] {
  const approved = purchaseApprovedBudgetByStore(values.purchases);
  const works = worksByStore(values.works);
  const budgetByStore = new Map(
    values.budgets.map((budget) => [budget.storeId, moneyToCents(budget.budgetAmount)]),
  );
  const purchaseRows = new Map(values.purchaseStoreRows.map((row) => [row.storeId, row]));

  return values.stores
    .map((store) => {
      const purchase = purchaseRows.get(store.id);
      const work = works.get(store.id) || {
        budgetCents: 0n,
        contractedCents: 0n,
        paidCents: 0n,
        documentedCents: 0n,
      };
      const itemsBudgetCents = approved.get(store.id) || 0n;
      const itemsRealizedCents = purchase?.realizedCents || 0n;
      const purchasePaidCents = purchase?.paidCents || 0n;
      const budgetTotalCents = itemsBudgetCents + work.budgetCents;
      const realizedTotalCents = itemsRealizedCents + work.contractedCents;
      const paidCents = purchasePaidCents + work.paidCents;
      const payableCents = realizedTotalCents > paidCents ? realizedTotalCents - paidCents : 0n;
      const worksMissingDocumentsCents =
        work.contractedCents > work.documentedCents
          ? work.contractedCents - work.documentedCents
          : 0n;
      const documentationStatus: FinanceOverviewStoreRow['documentationStatus'] =
        work.contractedCents <= 0n
          ? 'none'
          : work.documentedCents <= 0n
            ? 'pending'
            : worksMissingDocumentsCents > 0n
              ? 'partial'
              : 'complete';

      return {
        storeId: store.id,
        code: store.code,
        name: store.name,
        city: store.city,
        state: store.state,
        budgetBbCents: budgetByStore.get(store.id) || 0n,
        itemsBudgetCents,
        worksBudgetCents: work.budgetCents,
        budgetTotalCents,
        itemsRealizedCents,
        worksContractedCents: work.contractedCents,
        realizedTotalCents,
        differenceCents: budgetTotalCents - realizedTotalCents,
        paidCents,
        payableCents,
        worksDocumentedCents: work.documentedCents,
        worksMissingDocumentsCents,
        documentationStatus,
      };
    })
    .sort(
      (a, b) =>
        a.state.localeCompare(b.state, 'pt-BR') || a.code.localeCompare(b.code, 'pt-BR'),
    );
}
