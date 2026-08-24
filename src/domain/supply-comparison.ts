import { calculateQuoteLine, moneyToCents } from './supply-calculations';
import type { SupplyQuoteItem } from './types';

export interface ComparisonHighlights {
  lowestUnitPriceIds: Set<string>;
  lowestTotalIds: Set<string>;
  shortestLeadTimeIds: Set<string>;
}

function lowestIds<T>(values: T[], value: (entry: T) => bigint | null, id: (entry: T) => string) {
  const comparable = values
    .map((entry) => ({ entry, value: value(entry) }))
    .filter((entry): entry is { entry: T; value: bigint } => entry.value !== null);
  if (!comparable.length) return new Set<string>();
  const minimum = comparable.reduce(
    (lowest, entry) => (entry.value < lowest ? entry.value : lowest),
    comparable[0].value,
  );
  return new Set(
    comparable.filter((entry) => entry.value === minimum).map((entry) => id(entry.entry)),
  );
}

export function getComparisonHighlights(items: SupplyQuoteItem[]): ComparisonHighlights {
  return {
    lowestUnitPriceIds: lowestIds(
      items,
      (item) => moneyToCents(item.unitPrice),
      (item) => item.id,
    ),
    lowestTotalIds: lowestIds(
      items,
      (item) => (item.shippingType === 'pending' ? null : calculateQuoteLine(item).totalCents),
      (item) => item.id,
    ),
    shortestLeadTimeIds: lowestIds(
      items,
      (item) => (item.deliveryDays === null ? null : BigInt(item.deliveryDays)),
      (item) => item.id,
    ),
  };
}

export function getGroupedComparisonHighlights(items: SupplyQuoteItem[]): ComparisonHighlights {
  const groups = new Map<string, SupplyQuoteItem[]>();
  items.forEach((item) => {
    const key = [item.supplyItemId, item.quantity, item.unit].join('|');
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  const merged: ComparisonHighlights = {
    lowestUnitPriceIds: new Set<string>(),
    lowestTotalIds: new Set<string>(),
    shortestLeadTimeIds: new Set<string>(),
  };

  groups.forEach((groupItems) => {
    const current = getComparisonHighlights(groupItems);
    current.lowestUnitPriceIds.forEach((id) => merged.lowestUnitPriceIds.add(id));
    current.lowestTotalIds.forEach((id) => merged.lowestTotalIds.add(id));
    current.shortestLeadTimeIds.forEach((id) => merged.shortestLeadTimeIds.add(id));
  });

  return merged;
}
