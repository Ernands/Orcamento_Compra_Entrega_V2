import { calculateQuoteLine, calculateQuoteTotals, moneyToCents } from './supply-calculations';
import type { SupplyQuote } from './types';

export interface QuoteStoreSummary {
  key: string;
  label: string;
  quoteCount: number;
  itemCount: number;
  shippingCents: bigint;
  totalCents: bigint;
}

export interface QuoteSummary {
  totalQuotes: number;
  totalItems: number;
  totalUnitPriceCents: bigint;
  totalShippingCents: bigint;
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
  shippingCents: bigint;
  totalCents: bigint;
}

const CONSOLIDATED_KEY = 'consolidated-undistributed';

function ensureStoreSummary(
  totalsByStore: Map<string, MutableStoreSummary>,
  key: string,
  label: string,
): MutableStoreSummary {
  const current = totalsByStore.get(key);
  if (current) return current;

  const created: MutableStoreSummary = {
    key,
    label,
    quoteIds: new Set<string>(),
    itemCount: 0,
    shippingCents: 0n,
    totalCents: 0n,
  };
  totalsByStore.set(key, created);
  return created;
}

export function buildQuoteSummary(quotes: SupplyQuote[]): QuoteSummary {
  const totalsByStore = new Map<string, MutableStoreSummary>();

  quotes.forEach((quote) => {
    const stores = new Map(quote.stores.map((store) => [store.id, store]));

    // Toda loja vinculada a uma cotacao deve aparecer no resumo, mesmo quando
    // a cotacao e consolidada e ainda nao houve distribuicao dos itens por loja.
    quote.stores.forEach((store) => {
      const row = ensureStoreSummary(
        totalsByStore,
        store.id,
        `${store.code} - ${store.name}`,
      );
      row.quoteIds.add(quote.id);
    });

    quote.items.forEach((item) => {
      const store = item.storeId ? stores.get(item.storeId) : null;
      const key = store?.id || item.storeId || CONSOLIDATED_KEY;
      const label = store
        ? `${store.code} - ${store.name}`
        : item.storeId && item.storeCode
          ? `${item.storeCode} - ${item.storeName || 'Loja'}`
          : 'Consolidado / Nao distribuido';
      const current = ensureStoreSummary(totalsByStore, key, label);
      const calculation = calculateQuoteLine(item);

      current.quoteIds.add(quote.id);
      current.itemCount += 1;
      current.shippingCents += calculation.shippingCents || 0n;
      current.totalCents += calculation.totalCents;
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
    totalShippingCents: quotes.reduce(
      (sum, quote) => sum + calculateQuoteTotals(quote.items).shippingCents,
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
        shippingCents: row.shippingCents,
        totalCents: row.totalCents,
      }))
      .sort((a, b) => {
        if (a.key === CONSOLIDATED_KEY && b.key !== CONSOLIDATED_KEY) return -1;
        if (b.key === CONSOLIDATED_KEY && a.key !== CONSOLIDATED_KEY) return 1;
        if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
        return a.totalCents > b.totalCents ? -1 : 1;
      }),
  };
}
