import type {
  PlannedBudgetItem,
  PlannedBudgetStoreAllocation,
} from './planned-budget-types';
import { moneyToCents, quantityToThousandths } from './supply-calculations';

function roundedDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

export function plannedBudgetAllocations(
  items: PlannedBudgetItem[],
): PlannedBudgetStoreAllocation[] {
  return items.flatMap((budgetItem) => {
    if (!budgetItem.active || !budgetItem.segment.active) return [];
    const unitPriceCents = moneyToCents(budgetItem.unitPrice);

    return budgetItem.segment.stores.map((store) => {
      const quantity = quantityToThousandths(store.quantity);
      return {
        budgetItemId: budgetItem.id,
        segmentId: budgetItem.segmentId,
        segmentName: budgetItem.segment.name,
        supplyItemId: budgetItem.supplyItemId,
        itemCode: budgetItem.item.code,
        itemName: budgetItem.item.name,
        itemCategory: budgetItem.item.category,
        itemSubcategory: budgetItem.item.subcategory,
        itemGroupName: budgetItem.item.groupName,
        itemFinancialGroup: budgetItem.item.financialGroup || null,
        unit: budgetItem.item.defaultUnit,
        storeId: store.storeId,
        quantity: store.quantity,
        unitPrice: budgetItem.unitPrice,
        totalCents: roundedDivide(unitPriceCents * quantity, 1000n),
      };
    });
  });
}

export function plannedBudgetByStore(items: PlannedBudgetItem[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  plannedBudgetAllocations(items).forEach((allocation) => {
    totals.set(
      allocation.storeId,
      (totals.get(allocation.storeId) || 0n) + allocation.totalCents,
    );
  });
  return totals;
}
