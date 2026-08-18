import { calculateQuoteLine, calculateQuoteTotals, moneyToCents } from './supply-calculations';
import type { SupplyQuote } from './types';

export interface QuoteStoreSummary {
  key: string;
  label: string;
  quoteCount: number;
  itemCount: number;
  totalCents: bigint;
}

export interface QuoteSummary {
  totalQuotes: number;
  totalItems: number;
  totalUnitPriceCents: bigint;
  totalValueCents: bigint;
  storeQuotes: number;
  consolidatedQuotes: number;
  totalsByStore: QuoteStoreSummary[];
}

interface MutableStoreSummary {
  key: string;
  label: string;
  quoteIds: Set<string>;
  itemCount: number;
  totalCents: bigint;
}

const CONSOLIDATED_KEY = 'consolidated-undistributed';

export function buildQuoteSummary(quotes: SupplyQuote[]): QuoteSummary {
  const totalsByStore = new Map<string, MutableStoreSummary>();

  quotes.forEach((quote) => {
    const stores = new Map(quote.stores.map((store) => [store.id, store]));
    quote.items.forEach((item) => {
      const store = item.storeId ? stores.get(item.storeId) : null;
      const key = store?.id || CONSOLIDATED_KEY;
      const label = store ? `${store.code} - ${store.name}` : 'Consolidado / Nao distribuido';
      const current = totalsByStore.get(key) || {
        key,
        label,
        quoteIds: new Set<string>(),
        itemCount: 0,
        totalCents: 0n,
      };
      current.quoteIds.add(quote.id);
      current.itemCount += 1;
      current.totalCents += calculateQuoteLine(item).totalCents;
      totalsByStore.set(key, current);
    });
  });

  return {
    totalQuotes: quotes.length,
    totalItems: quotes.reduce((sum, quote) => sum + quote.items.length, 0),
    totalUnitPriceCents: quotes.reduce(
      (sum, quote) =>
        sum + quote.items.reduce((itemSum, item) => itemSum + moneyToCents(item.unitPrice), 0n),
      0n,
    ),
    totalValueCents: quotes.reduce(
      (sum, quote) => sum + calculateQuoteTotals(quote.items).totalCents,
      0n,
    ),
    storeQuotes: quotes.filter((quote) => quote.contextType === 'store').length,
    consolidatedQuotes: quotes.filter((quote) => quote.contextType === 'consolidated').length,
    totalsByStore: [...totalsByStore.values()]
      .map((row) => ({
        key: row.key,
        label: row.label,
        quoteCount: row.quoteIds.size,
        itemCount: row.itemCount,
        totalCents: row.totalCents,
      }))
      .sort((a, b) =>
        a.totalCents === b.totalCents
          ? a.label.localeCompare(b.label, 'pt-BR')
          : a.totalCents > b.totalCents
            ? -1
            : 1,
      ),
  };
}
