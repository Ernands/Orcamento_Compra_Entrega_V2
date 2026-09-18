import type { FinanceStoreRow } from './finance-types';
import {
  activeOrders,
  purchaseDestinationStoreCosts,
  purchaseOrderStoreCosts,
  purchaseStoreCosts,
} from './purchase-v2-calculations';
import type { PurchaseV2 } from './purchase-v2-types';
import type { Store } from './types';
import type { FinanceStoreBudget, WorkService } from './works-types';
import { moneyToCents, quantityToThousandths } from './supply-calculations';

export interface FinanceStoreItemDetailRow {
  id: string;
  purchaseId: string;
  purchaseCode: string;
  quoteCode: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  unit: string;
  approvedQuantity: bigint;
  budgetCents: bigint;
  purchasedQuantity: bigint;
  realizedCents: bigint;
  differenceCents: bigint;
  purchaseStatus: 'not_purchased' | 'partial' | 'purchased';
}

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

export function purchaseApprovedBudgetByStore(purchases: PurchaseV2[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();

  purchases
    .filter((purchase) => !['returned', 'cancelled'].includes(purchase.status))
    .forEach((purchase) => {
      purchaseStoreCosts(purchase).rows.forEach((row) => {
        totals.set(row.storeId, (totals.get(row.storeId) || 0n) + row.approvedCents);
      });
    });

  return totals;
}

function equalQuantityShare(total: bigint, count: number, index: number): bigint {
  if (count <= 0) return 0n;
  const divisor = BigInt(count);
  const base = total / divisor;
  const remainder = total % divisor;
  return base + (BigInt(index) < remainder ? 1n : 0n);
}

export function buildFinanceStoreItemRows(
  purchases: PurchaseV2[],
  storeId: string,
): FinanceStoreItemDetailRow[] {
  const rows: FinanceStoreItemDetailRow[] = [];

  purchases
    .filter((purchase) => !['returned', 'cancelled'].includes(purchase.status))
    .forEach((purchase) => {
      purchase.items.forEach((item) => {
        let approvedQuantity = 0n;
        let budgetCents = 0n;

        if (item.destinations.length) {
          item.destinations.forEach((destination) => {
            const allocation = purchaseDestinationStoreCosts(purchase, destination).rows.find(
              (entry) => entry.storeId === storeId,
            );
            if (!allocation) return;
            approvedQuantity += allocation.approvedQuantity
              ? quantityToThousandths(allocation.approvedQuantity)
              : 0n;
            budgetCents += allocation.approvedCents;
          });
        } else if (item.storeId === storeId) {
          approvedQuantity = quantityToThousandths(item.quantityApproved);
          budgetCents = moneyToCents(item.approvedLineTotal);
        } else if (item.sourceQuoteItemId === null) {
          const storeIndex = purchase.stores.findIndex((store) => store.storeId === storeId);
          if (storeIndex >= 0) {
            approvedQuantity = equalQuantityShare(
              quantityToThousandths(item.quantityApproved),
              purchase.stores.length,
              storeIndex,
            );
            const purchaseCosts = purchaseStoreCosts({
              ...purchase,
              items: [item],
            }).rows.find((entry) => entry.storeId === storeId);
            budgetCents = purchaseCosts?.approvedCents || 0n;
          }
        }

        let purchasedQuantity = 0n;
        let realizedCents = 0n;

        activeOrders(purchase).forEach((order) => {
          order.lines
            .filter((line) => line.purchaseItemId === item.id)
            .forEach((line) => {
              const lineStore = line.stores.find((entry) => entry.storeId === storeId);
              if (!lineStore) return;
              purchasedQuantity += quantityToThousandths(lineStore.quantity);
              const storeCost = purchaseOrderStoreCosts({
                ...order,
                lines: [line],
              }).rows.find((entry) => entry.storeId === storeId);
              realizedCents += storeCost?.costCents || 0n;
            });
        });

        if (
          approvedQuantity <= 0n &&
          budgetCents <= 0n &&
          purchasedQuantity <= 0n &&
          realizedCents <= 0n
        ) {
          return;
        }

        const purchaseStatus: FinanceStoreItemDetailRow['purchaseStatus'] =
          purchasedQuantity <= 0n
            ? 'not_purchased'
            : purchasedQuantity < approvedQuantity
              ? 'partial'
              : 'purchased';

        rows.push({
          id: `${purchase.id}:${item.id}:${storeId}`,
          purchaseId: purchase.id,
          purchaseCode: purchase.code,
          quoteCode: purchase.quoteCode,
          supplierName: purchase.supplierName,
          itemCode: item.itemCode,
          itemName: item.itemName,
          unit: item.unit,
          approvedQuantity,
          budgetCents,
          purchasedQuantity,
          realizedCents,
          differenceCents: budgetCents - realizedCents,
          purchaseStatus,
        });
      });
    });

  return rows.sort(
    (a, b) =>
      a.itemName.localeCompare(b.itemName, 'pt-BR') ||
      a.purchaseCode.localeCompare(b.purchaseCode, 'pt-BR'),
  );
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
