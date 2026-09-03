import { calculateQuoteLine, moneyToCents } from './supply-calculations';
import { getEffectiveSupplyQuoteStatus } from './supply-quote-status';
import type { SupplyQuote, SupplyQuoteItem } from './types';

interface LowestPriceCandidate {
  quote: SupplyQuote;
  item: SupplyQuoteItem;
  unitPriceCents: bigint;
  totalCents: bigint;
}

export interface LowestPriceQuoteSelection {
  quoteIds: Set<string>;
  winningItemIds: Set<string>;
  winningItemCountByQuote: Map<string, number>;
  distinctItemCount: number;
}

function isBetterCandidate(next: LowestPriceCandidate, current: LowestPriceCandidate) {
  if (next.unitPriceCents !== current.unitPriceCents)
    return next.unitPriceCents < current.unitPriceCents;

  if (next.totalCents !== current.totalCents) return next.totalCents < current.totalCents;

  if (next.quote.quoteDate !== current.quote.quoteDate)
    return next.quote.quoteDate > current.quote.quoteDate;

  if (next.quote.createdAt !== current.quote.createdAt)
    return next.quote.createdAt > current.quote.createdAt;

  return next.quote.code.localeCompare(current.quote.code, 'pt-BR') < 0;
}

export function selectLowestPriceQuotesByItem(
  quotes: SupplyQuote[],
): LowestPriceQuoteSelection {
  const winnerByItem = new Map<string, LowestPriceCandidate>();

  quotes
    .filter((quote) => getEffectiveSupplyQuoteStatus(quote) !== 'cancelled')
    .forEach((quote) => {
      quote.items.forEach((item) => {
        const candidate: LowestPriceCandidate = {
          quote,
          item,
          unitPriceCents: moneyToCents(item.unitPrice),
          totalCents: calculateQuoteLine(item).totalCents,
        };
        const current = winnerByItem.get(item.supplyItemId);
        if (!current || isBetterCandidate(candidate, current)) {
          winnerByItem.set(item.supplyItemId, candidate);
        }
      });
    });

  const quoteIds = new Set<string>();
  const winningItemIds = new Set<string>();
  const winningItemCountByQuote = new Map<string, number>();
  winnerByItem.forEach(({ quote, item }) => {
    quoteIds.add(quote.id);
    winningItemIds.add(item.id);
    winningItemCountByQuote.set(quote.id, (winningItemCountByQuote.get(quote.id) || 0) + 1);
  });

  return {
    quoteIds,
    winningItemIds,
    winningItemCountByQuote,
    distinctItemCount: winnerByItem.size,
  };
}
