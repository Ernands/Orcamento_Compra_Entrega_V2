import {
  calculateQuoteLine,
  calculateQuoteTotals,
  getQuoteLineDeliveryDays,
  moneyToCents,
} from './supply-calculations';
import type { SupplyQuote, SupplyQuoteItem } from './types';

export interface ComparisonHighlights {
  lowestUnitPriceIds: Set<string>;
  lowestTotalIds: Set<string>;
  shortestLeadTimeIds: Set<string>;
}

export interface QuoteComparisonHighlights {
  lowestTotalQuoteIds: Set<string>;
  shortestLeadTimeQuoteIds: Set<string>;
  comparableQuoteIds: Set<string>;
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
      (item) => {
        const calculation = calculateQuoteLine(item);
        return calculation.shippingPending ? null : calculation.totalCents;
      },
      (item) => item.id,
    ),
    shortestLeadTimeIds: lowestIds(
      items,
      (item) => {
        const days = getQuoteLineDeliveryDays(item);
        return days === null ? null : BigInt(days);
      },
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

function destinationScope(item: SupplyQuoteItem, quote: SupplyQuote): string {
  if ((item.destinations || []).length) {
    return (item.destinations || [])
      .map((destination) =>
        [
          destination.destinationType,
          destination.profileId || destination.storeId || '',
          destination.quantity,
          destination.unit,
        ].join(':'),
      )
      .sort()
      .join(',');
  }
  if (item.storeId) return `store:${item.storeId}`;
  return `stores:${quote.stores.map((store) => store.id).sort().join(',')}`;
}

export function getQuoteComparisonScopeKey(quote: SupplyQuote): string {
  return quote.items
    .map((item) =>
      [
        item.supplyItemId,
        item.quantity,
        item.unit,
        destinationScope(item, quote),
      ].join('|'),
    )
    .sort()
    .join('||');
}

export function getQuoteDeliveryDays(quote: SupplyQuote): number | null {
  if (!quote.items.length) return null;
  const days = quote.items.map(getQuoteLineDeliveryDays);
  if (days.some((value) => value === null)) return null;
  return Math.max(...(days as number[]));
}

export function getGroupedQuoteComparisonHighlights(quotes: SupplyQuote[]): QuoteComparisonHighlights {
  const groups = new Map<string, SupplyQuote[]>();
  quotes.forEach((quote) => {
    const key = getQuoteComparisonScopeKey(quote);
    groups.set(key, [...(groups.get(key) || []), quote]);
  });

  const result: QuoteComparisonHighlights = {
    lowestTotalQuoteIds: new Set<string>(),
    shortestLeadTimeQuoteIds: new Set<string>(),
    comparableQuoteIds: new Set<string>(),
  };

  groups.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((quote) => result.comparableQuoteIds.add(quote.id));
    lowestIds(
      group,
      (quote) => {
        const totals = calculateQuoteTotals(quote.items);
        return totals.shippingPending ? null : totals.totalCents;
      },
      (quote) => quote.id,
    ).forEach((id) => result.lowestTotalQuoteIds.add(id));
    lowestIds(
      group,
      (quote) => {
        const days = getQuoteDeliveryDays(quote);
        return days === null ? null : BigInt(days);
      },
      (quote) => quote.id,
    ).forEach((id) => result.shortestLeadTimeQuoteIds.add(id));
  });

  return result;
}
