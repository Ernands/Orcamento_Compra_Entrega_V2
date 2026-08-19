import { calculateQuoteLine, calculateQuoteTotals, moneyToCents } from './supply-calculations';
import type { SupplyQuote } from './types';

export interface QuoteStoreSummary {
  key: string;
  label: string;
  state: string | null;
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

export interface QuoteSummaryOptions {
  allocateConsolidated?: boolean;
}

interface MutableStoreSummary {
  key: string;
  label: string;
  state: string | null;
  quoteIds: Set<string>;
  itemCount: number;
  shippingCents: bigint;
  totalCents: bigint;
}

export const CONSOLIDATED_STORE_SUMMARY_KEY = 'consolidated-undistributed';

function ensureStoreSummary(
  totalsByStore: Map<string, MutableStoreSummary>,
  key: string,
  label: string,
  state: string | null = null,
): MutableStoreSummary {
  const current = totalsByStore.get(key);
  if (current) {
    if (!current.state && state) current.state = state;
    return current;
  }

  const created: MutableStoreSummary = {
    key,
    label,
    state,
    quoteIds: new Set<string>(),
    itemCount: 0,
    shippingCents: 0n,
    totalCents: 0n,
  };
  totalsByStore.set(key, created);
  return created;
}

function splitAmount(value: bigint, parts: number): bigint[] {
  if (parts <= 0) return [];

  const divisor = BigInt(parts);
  const base = value / divisor;
  const signedRemainder = value % divisor;
  const remainder = signedRemainder < 0n ? -signedRemainder : signedRemainder;
  const direction = signedRemainder < 0n ? -1n : 1n;

  return Array.from({ length: parts }, (_, index) =>
    base + (BigInt(index) < remainder ? direction : 0n),
  );
}

export function buildQuoteSummary(
  quotes: SupplyQuote[],
  options: QuoteSummaryOptions = {},
): QuoteSummary {
  const totalsByStore = new Map<string, MutableStoreSummary>();

  quotes.forEach((quote) => {
    const stores = new Map(quote.stores.map((store) => [store.id, store]));
    const linkedStores = [...quote.stores].sort((a, b) =>
      a.code.localeCompare(b.code, 'pt-BR'),
    );

    // Toda loja vinculada a uma cotacao deve aparecer no resumo, mesmo quando
    // a cotacao e consolidada e ainda nao houve distribuicao dos itens por loja.
    linkedStores.forEach((store) => {
      const row = ensureStoreSummary(
        totalsByStore,
        store.id,
        `${store.code} - ${store.name}`,
        store.state,
      );
      row.quoteIds.add(quote.id);
    });

    quote.items.forEach((item) => {
      const store = item.storeId ? stores.get(item.storeId) : null;
      const calculation = calculateQuoteLine(item);

      const canAllocate =
        options.allocateConsolidated &&
        quote.contextType === 'consolidated' &&
        !item.storeId &&
        linkedStores.length > 0;

      if (canAllocate) {
        // Mantem a referencia visual do consolidado, mas zera seus valores quando
        // o usuario opta pela visao rateada. O rateio e apenas de visualizacao.
        ensureStoreSummary(
          totalsByStore,
          CONSOLIDATED_STORE_SUMMARY_KEY,
          'Consolidado / Nao distribuido',
        );

        const totalShares = splitAmount(calculation.totalCents, linkedStores.length);
        const shippingShares = splitAmount(calculation.shippingCents || 0n, linkedStores.length);

        linkedStores.forEach((linkedStore, index) => {
          const current = ensureStoreSummary(
            totalsByStore,
            linkedStore.id,
            `${linkedStore.code} - ${linkedStore.name}`,
            linkedStore.state,
          );
          current.shippingCents += shippingShares[index];
          current.totalCents += totalShares[index];
        });
        return;
      }

      const key = store?.id || item.storeId || CONSOLIDATED_STORE_SUMMARY_KEY;
      const label = store
        ? `${store.code} - ${store.name}`
        : item.storeId && item.storeCode
          ? `${item.storeCode} - ${item.storeName || 'Loja'}`
          : 'Consolidado / Nao distribuido';
      const current = ensureStoreSummary(totalsByStore, key, label, store?.state || null);

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
        state: row.state,
        quoteCount: row.quoteIds.size,
        itemCount: row.itemCount,
        shippingCents: row.shippingCents,
        totalCents: row.totalCents,
      }))
      .sort((a, b) => {
        if (a.key === CONSOLIDATED_STORE_SUMMARY_KEY && b.key !== CONSOLIDATED_STORE_SUMMARY_KEY)
          return -1;
        if (b.key === CONSOLIDATED_STORE_SUMMARY_KEY && a.key !== CONSOLIDATED_STORE_SUMMARY_KEY)
          return 1;
        if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
        return a.totalCents > b.totalCents ? -1 : 1;
      }),
  };
}
