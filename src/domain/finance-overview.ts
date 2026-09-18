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
  itemCategory: string | null;
  itemSubcategory?: string | null;
  itemGroupName?: string | null;
  itemFinancialGroup?: 'equipment' | 'furniture' | 'general' | null;
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
          itemCategory: item.itemCategory,
          itemSubcategory: item.catalogSubcategory || null,
          itemGroupName: item.catalogGroupName || null,
          itemFinancialGroup: item.catalogFinancialGroup || null,
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


export type FinanceStoreCompositionKey = 'equipment' | 'furniture' | 'general' | 'works';

export interface FinanceStoreCompositionRow {
  key: FinanceStoreCompositionKey;
  label: string;
  budgetCents: bigint;
  realizedCents: bigint;
  differenceCents: bigint;
  paidCents: bigint;
  payableCents: bigint;
}

function normalizeCategory(value: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function financeItemCompositionGroup(
  category: string | null,
  subcategory: string | null = null,
  groupName: string | null = null,
  itemName: string | null = null,
  financialGroup: 'equipment' | 'furniture' | 'general' | null = null,
): Exclude<FinanceStoreCompositionKey, 'works'> {
  if (financialGroup) return financialGroup;
  const normalized = normalizeCategory([subcategory, groupName, category, itemName].filter(Boolean).join(' '));
  if (
    normalized.includes('mobili') ||
    normalized.includes('moveis') ||
    normalized.includes('movel')
  ) {
    return 'furniture';
  }
  if (
    normalized.includes('equip') ||
    normalized.includes('informat') ||
    normalized.includes('tecnolog') ||
    normalized.includes('climat') ||
    normalized.includes('eletron') ||
    normalized.includes('seguranca') ||
    normalized.includes('impress') ||
    normalized.includes('notebook') ||
    normalized.includes('computador') ||
    normalized.includes('monitor') ||
    normalized.includes('webcam') ||
    normalized.includes('headset') ||
    normalized.includes('nobreak')
  ) {
    return 'equipment';
  }
  return 'general';
}

function allocateCompositionCents(
  totalCents: bigint,
  weights: Array<{ key: Exclude<FinanceStoreCompositionKey, 'works'>; weight: bigint }>,
) {
  const positive = weights.filter((entry) => entry.weight > 0n);
  const result = new Map<Exclude<FinanceStoreCompositionKey, 'works'>, bigint>();
  if (!positive.length || totalCents <= 0n) return result;

  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const remainders: Array<{
    key: Exclude<FinanceStoreCompositionKey, 'works'>;
    remainder: bigint;
  }> = [];
  let allocated = 0n;

  positive.forEach((entry) => {
    const numerator = totalCents * entry.weight;
    const base = numerator / totalWeight;
    result.set(entry.key, base);
    allocated += base;
    remainders.push({ key: entry.key, remainder: numerator % totalWeight });
  });

  remainders.sort((a, b) =>
    a.remainder === b.remainder
      ? a.key.localeCompare(b.key)
      : a.remainder > b.remainder
        ? -1
        : 1,
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

export function buildFinanceStoreCompositionRows(values: {
  storeId: string;
  purchases: PurchaseV2[];
  purchaseStoreRows: FinanceStoreRow[];
  works: WorkService[];
}): FinanceStoreCompositionRow[] {
  const rows = new Map<FinanceStoreCompositionKey, Omit<FinanceStoreCompositionRow, 'differenceCents' | 'payableCents'>>([
    ['equipment', { key: 'equipment', label: 'Equipamentos', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],
    ['furniture', { key: 'furniture', label: 'Mobiliário', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],
    ['general', { key: 'general', label: 'Itens gerais', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],
    ['works', { key: 'works', label: 'Obras e Serviços', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],
  ]);

  buildFinanceStoreItemRows(values.purchases, values.storeId).forEach((item) => {
    const group = financeItemCompositionGroup(
      item.itemCategory,
      item.itemSubcategory,
      item.itemGroupName,
      item.itemName,
      item.itemFinancialGroup || null,
    );
    const row = rows.get(group)!;
    row.budgetCents += item.budgetCents;
    row.realizedCents += item.realizedCents;
  });

  const financeStore = values.purchaseStoreRows.find((row) => row.storeId === values.storeId);
  financeStore?.purchases.forEach((purchaseRow) => {
    const order = purchaseRow.purchase.orders.find((entry) => entry.id === purchaseRow.purchaseOrderId);
    if (!order || purchaseRow.paidCents <= 0n) return;
    const storeCost = purchaseOrderStoreCosts(order).rows.find((entry) => entry.storeId === values.storeId);
    if (!storeCost || storeCost.costCents <= 0n) return;

    const groupWeights = new Map<Exclude<FinanceStoreCompositionKey, 'works'>, bigint>();
    storeCost.lines.forEach((costLine) => {
      const line = order.lines.find((entry) => entry.id === costLine.lineId);
      const item = line?.purchaseItemId
        ? purchaseRow.purchase.items.find((entry) => entry.id === line.purchaseItemId)
        : null;
      const group = financeItemCompositionGroup(
        item?.itemCategory || null,
        item?.catalogSubcategory || null,
        item?.catalogGroupName || null,
        item?.itemName || line?.itemName || null,
        item?.catalogFinancialGroup || null,
      );
      groupWeights.set(group, (groupWeights.get(group) || 0n) + costLine.costCents);
    });

    const allocations = allocateCompositionCents(
      purchaseRow.paidCents,
      [...groupWeights.entries()].map(([key, weight]) => ({ key, weight })),
    );
    allocations.forEach((amount, key) => {
      rows.get(key)!.paidCents += amount;
    });
  });

  values.works
    .filter((work) => work.storeId === values.storeId && work.status !== 'cancelled')
    .forEach((work) => {
      const row = rows.get('works')!;
      row.budgetCents += moneyToCents(work.budgetAmount);
      row.realizedCents += moneyToCents(work.contractedAmount);
      row.paidCents += work.payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
    });

  return (['equipment', 'furniture', 'general', 'works'] as FinanceStoreCompositionKey[]).map(
    (key) => {
      const row = rows.get(key)!;
      return {
        ...row,
        differenceCents: row.budgetCents - row.realizedCents,
        payableCents: row.realizedCents > row.paidCents ? row.realizedCents - row.paidCents : 0n,
      };
    },
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
