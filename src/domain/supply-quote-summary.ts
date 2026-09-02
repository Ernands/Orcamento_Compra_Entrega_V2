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

function allocateSignedCentsByWeights(
  totalCents: bigint,
  entries: Array<{ key: string; weight: bigint }>,
): Map<string, bigint> {
  const positive = entries.filter((entry) => entry.weight > 0n);
  if (!positive.length) return new Map();

  const sign = totalCents < 0n ? -1n : 1n;
  const absoluteTotal = totalCents < 0n ? -totalCents : totalCents;
  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const allocations = new Map<string, bigint>();
  const remainders: Array<{ key: string; remainder: bigint }> = [];
  let allocated = 0n;

  positive.forEach((entry) => {
    const numerator = absoluteTotal * entry.weight;
    const base = numerator / totalWeight;
    allocations.set(entry.key, base);
    allocated += base;
    remainders.push({ key: entry.key, remainder: numerator % totalWeight });
  });

  let remaining = absoluteTotal - allocated;
  remainders.sort((a, b) =>
    a.remainder === b.remainder
      ? a.key.localeCompare(b.key)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );

  let index = 0;
  while (remaining > 0n && remainders.length) {
    const key = remainders[index % remainders.length].key;
    allocations.set(key, (allocations.get(key) || 0n) + 1n);
    remaining -= 1n;
    index += 1;
  }

  return new Map([...allocations].map(([key, value]) => [key, value * sign]));
}

function addStoreAllocation(
  totalsByStore: Map<string, MutableStoreSummary>,
  quoteId: string,
  store: { id: string; code: string; name: string; state: string },
  itemCount: number,
  shippingCents: bigint,
  totalCents: bigint,
) {
  const row = ensureStoreSummary(
    totalsByStore,
    store.id,
    `${store.code} - ${store.name}`,
    store.state,
  );
  row.quoteIds.add(quoteId);
  row.itemCount += itemCount;
  row.shippingCents += shippingCents;
  row.totalCents += totalCents;
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
      const calculation = calculateQuoteLine(item);
      const destinations = item.destinations || [];

      if (destinations.length > 0) {
        const destinationWeights = destinations.map((destination) => ({
          key: destination.id,
          weight: BigInt(Math.round(Number(destination.quantity) * 1000)),
        }));
        const destinationShipping = new Map(
          destinations.map((destination) => [
            destination.id,
            destination.shippingType === 'informed'
              ? moneyToCents(destination.shippingAmount || '0')
              : 0n,
          ]),
        );
        const knownDestinationShipping = [...destinationShipping.values()].reduce(
          (sum, value) => sum + value,
          0n,
        );
        const commonCents = calculation.totalCents - knownDestinationShipping;
        const commonByDestination = allocateSignedCentsByWeights(
          commonCents,
          destinationWeights,
        );

        destinations.forEach((destination) => {
          const destinationTotal =
            (commonByDestination.get(destination.id) || 0n) +
            (destinationShipping.get(destination.id) || 0n);
          const destinationShippingCents = destinationShipping.get(destination.id) || 0n;
          const snapshotStores = (destination.stores || [])
            .map((snapshot) => ({
              id: snapshot.storeId,
              code: snapshot.code,
              name: snapshot.name,
              state: snapshot.state,
            }))
            .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));

          if (!snapshotStores.length) {
            const current = ensureStoreSummary(
              totalsByStore,
              CONSOLIDATED_STORE_SUMMARY_KEY,
              'Consolidado / Nao distribuido',
              destination.state || null,
            );
            current.quoteIds.add(quote.id);
            current.itemCount += 1;
            current.shippingCents += destinationShippingCents;
            current.totalCents += destinationTotal;
            return;
          }

          const totalShares = splitAmount(destinationTotal, snapshotStores.length);
          const shippingShares = splitAmount(
            destinationShippingCents,
            snapshotStores.length,
          );
          snapshotStores.forEach((snapshotStore, index) =>
            addStoreAllocation(
              totalsByStore,
              quote.id,
              snapshotStore,
              1,
              shippingShares[index],
              totalShares[index],
            ),
          );
        });
        return;
      }

      const directStore = item.storeId ? stores.get(item.storeId) : null;
      if (directStore) {
        addStoreAllocation(
          totalsByStore,
          quote.id,
          directStore,
          1,
          calculation.shippingCents || 0n,
          calculation.totalCents,
        );
        return;
      }

      const canUseLegacyFallback =
        options.allocateConsolidated &&
        quote.contextType === 'consolidated' &&
        linkedStores.length > 0;

      if (canUseLegacyFallback) {
        const totalShares = splitAmount(calculation.totalCents, linkedStores.length);
        const shippingShares = splitAmount(
          calculation.shippingCents || 0n,
          linkedStores.length,
        );
        linkedStores.forEach((linkedStore, index) =>
          addStoreAllocation(
            totalsByStore,
            quote.id,
            linkedStore,
            1,
            shippingShares[index],
            totalShares[index],
          ),
        );
        return;
      }

      const current = ensureStoreSummary(
        totalsByStore,
        CONSOLIDATED_STORE_SUMMARY_KEY,
        'Consolidado / Nao distribuido',
      );
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
