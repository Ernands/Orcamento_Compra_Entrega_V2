import { calculateQuoteLine, moneyToCents, quantityToThousandths } from './supply-calculations';
import { getEffectiveSupplyQuoteStatus } from './supply-quote-status';
import type { SupplyQuote } from './types';

export type QuoteAllocationSource =
  | 'destination_profile'
  | 'direct_store'
  | 'legacy_fallback'
  | 'unallocated';

export interface QuoteSummaryAllocation {
  key: string;
  quoteId: string;
  quoteCode: string;
  supplierName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  destinationKey: string;
  destinationLabel: string;
  destinationState: string | null;
  source: QuoteAllocationSource;
  storeId: string | null;
  storeCode: string | null;
  storeName: string | null;
  storeCity: string | null;
  storeState: string | null;
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
}

export interface QuoteStoreSummary {
  key: string;
  label: string;
  city: string | null;
  state: string | null;
  quoteCount: number;
  itemCount: number;
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
  sources: QuoteAllocationSource[];
}

export interface QuoteDestinationSummary {
  key: string;
  label: string;
  state: string | null;
  quoteCount: number;
  itemCount: number;
  storeCount: number;
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
  sources: QuoteAllocationSource[];
}

export interface QuoteCoverageSummary {
  destinationProfileCents: bigint;
  directStoreCents: bigint;
  legacyFallbackCents: bigint;
  unallocatedCents: bigint;
  realCoverageBasisPoints: number;
}

export interface QuoteSummary {
  inputQuoteCount: number;
  excludedCancelledQuotes: number;
  totalQuotes: number;
  totalItems: number;
  totalStores: number;
  totalDestinations: number;
  totalUnitPriceCents: bigint;
  totalProductsCents: bigint;
  totalDiscountCents: bigint;
  totalOtherCostsCents: bigint;
  totalShippingCents: bigint;
  totalValueCents: bigint;
  averagePerStoreCents: bigint;
  shippingPendingCount: number;
  storeQuotes: number;
  consolidatedQuotes: number;
  coverage: QuoteCoverageSummary;
  totalsByDestination: QuoteDestinationSummary[];
  totalsByStore: QuoteStoreSummary[];
  allocations: QuoteSummaryAllocation[];
}

export interface QuoteSummaryOptions {
  allocateConsolidated?: boolean;
  states?: string[];
  storeIds?: string[];
}

interface StoreRef {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
}

interface Components {
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  shippingPending: boolean;
}

interface MutableStoreSummary {
  key: string;
  label: string;
  city: string | null;
  state: string | null;
  quoteIds: Set<string>;
  itemIds: Set<string>;
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
  sources: Set<QuoteAllocationSource>;
}

interface MutableDestinationSummary {
  key: string;
  label: string;
  state: string | null;
  quoteIds: Set<string>;
  itemIds: Set<string>;
  storeIds: Set<string>;
  quantityThousandths: bigint;
  productCents: bigint;
  discountCents: bigint;
  otherCostsCents: bigint;
  shippingCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
  sources: Set<QuoteAllocationSource>;
}

export const CONSOLIDATED_STORE_SUMMARY_KEY = 'consolidated-undistributed';
export const LEGACY_FALLBACK_DESTINATION_PREFIX = 'legacy-fallback';
export const UNALLOCATED_DESTINATION_PREFIX = 'unallocated';

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

function allocateSignedByWeights(
  total: bigint,
  entries: Array<{ key: string; weight: bigint }>,
): Map<string, bigint> {
  if (!entries.length) return new Map();
  const hasPositiveWeight = entries.some((entry) => entry.weight > 0n);
  const weighted = entries.map((entry) => ({
    key: entry.key,
    weight: hasPositiveWeight ? (entry.weight > 0n ? entry.weight : 0n) : 1n,
  }));
  const positive = weighted.filter((entry) => entry.weight > 0n);
  if (!positive.length) return new Map();

  const sign = total < 0n ? -1n : 1n;
  const absoluteTotal = total < 0n ? -total : total;
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

function componentTotal(components: Components): bigint {
  return (
    components.productCents -
    components.discountCents +
    components.otherCostsCents +
    components.shippingCents
  );
}

function splitComponents(components: Components, parts: number): Components[] {
  const quantities = splitAmount(components.quantityThousandths, parts);
  const products = splitAmount(components.productCents, parts);
  const discounts = splitAmount(components.discountCents, parts);
  const otherCosts = splitAmount(components.otherCostsCents, parts);
  const shipping = splitAmount(components.shippingCents, parts);
  return Array.from({ length: parts }, (_, index) => ({
    quantityThousandths: quantities[index],
    productCents: products[index],
    discountCents: discounts[index],
    otherCostsCents: otherCosts[index],
    shippingCents: shipping[index],
    shippingPending: components.shippingPending,
  }));
}

function allocationMatchesFilters(
  allocation: QuoteSummaryAllocation,
  options: QuoteSummaryOptions,
): boolean {
  const states = options.states?.filter(Boolean) || [];
  const storeIds = options.storeIds?.filter(Boolean) || [];
  if (storeIds.length && (!allocation.storeId || !storeIds.includes(allocation.storeId))) return false;
  if (states.length) {
    const state = allocation.storeState || allocation.destinationState;
    if (!state || !states.includes(state)) return false;
  }
  return true;
}

function createAllocation(
  quote: SupplyQuote,
  item: SupplyQuote['items'][number],
  destinationKey: string,
  destinationLabel: string,
  destinationState: string | null,
  source: QuoteAllocationSource,
  store: StoreRef | null,
  components: Components,
): QuoteSummaryAllocation {
  return {
    key: `${quote.id}:${item.id}:${destinationKey}:${store?.id || 'unallocated'}`,
    quoteId: quote.id,
    quoteCode: quote.code,
    supplierName: quote.supplierName,
    itemId: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    destinationKey,
    destinationLabel,
    destinationState,
    source,
    storeId: store?.id || null,
    storeCode: store?.code || null,
    storeName: store?.name || null,
    storeCity: store?.city || null,
    storeState: store?.state || null,
    quantityThousandths: components.quantityThousandths,
    productCents: components.productCents,
    discountCents: components.discountCents,
    otherCostsCents: components.otherCostsCents,
    shippingCents: components.shippingCents,
    totalCents: componentTotal(components),
    shippingPending: components.shippingPending,
  };
}

function pushDistributedAllocations(
  allocations: QuoteSummaryAllocation[],
  quote: SupplyQuote,
  item: SupplyQuote['items'][number],
  destinationKey: string,
  destinationLabel: string,
  destinationState: string | null,
  source: QuoteAllocationSource,
  stores: StoreRef[],
  components: Components,
) {
  if (!stores.length) {
    allocations.push(
      createAllocation(
        quote,
        item,
        destinationKey,
        destinationLabel,
        destinationState,
        'unallocated',
        null,
        components,
      ),
    );
    return;
  }

  const shares = splitComponents(components, stores.length);
  stores.forEach((store, index) => {
    allocations.push(
      createAllocation(
        quote,
        item,
        destinationKey,
        destinationLabel,
        destinationState,
        source,
        store,
        shares[index],
      ),
    );
  });
}

function buildAllocationsForQuote(quote: SupplyQuote, options: QuoteSummaryOptions) {
  const allocations: QuoteSummaryAllocation[] = [];
  const storesById = new Map(quote.stores.map((store) => [store.id, store]));
  const linkedStores = [...quote.stores].sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));

  quote.items.forEach((item) => {
    const calculation = calculateQuoteLine(item);
    const lineComponents: Components = {
      quantityThousandths: quantityToThousandths(item.quantity),
      productCents: calculation.subtotalCents,
      discountCents: calculation.discountCents,
      otherCostsCents: calculation.otherCostsCents,
      shippingCents: calculation.shippingCents || 0n,
      shippingPending: calculation.shippingPending,
    };
    const destinations = item.destinations || [];

    if (destinations.length) {
      const weights = destinations.map((destination) => ({
        key: destination.id,
        weight: quantityToThousandths(destination.quantity),
      }));
      const products = allocateSignedByWeights(lineComponents.productCents, weights);
      const discounts = allocateSignedByWeights(lineComponents.discountCents, weights);
      const otherCosts = allocateSignedByWeights(lineComponents.otherCostsCents, weights);

      destinations.forEach((destination) => {
        const destinationShippingPending = destination.shippingType === 'pending';
        const destinationShipping =
          destination.shippingType === 'informed'
            ? moneyToCents(destination.shippingAmount || '0')
            : 0n;
        const components: Components = {
          quantityThousandths: quantityToThousandths(destination.quantity),
          productCents: products.get(destination.id) || 0n,
          discountCents: discounts.get(destination.id) || 0n,
          otherCostsCents: otherCosts.get(destination.id) || 0n,
          shippingCents: destinationShipping,
          shippingPending: destinationShippingPending,
        };
        const snapshotStores: StoreRef[] = (destination.stores || [])
          .map((snapshot) => ({
            id: snapshot.storeId,
            code: snapshot.code,
            name: snapshot.name,
            city: snapshot.city,
            state: snapshot.state,
          }))
          .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));

        if (destination.destinationType === 'store') {
          const directStoreId = destination.storeId || snapshotStores[0]?.id || null;
          const currentStore = directStoreId ? storesById.get(directStoreId) : null;
          const directStore = currentStore
            ? { ...currentStore }
            : snapshotStores.find((store) => store.id === directStoreId) || snapshotStores[0] || null;
          pushDistributedAllocations(
            allocations,
            quote,
            item,
            destination.id,
            destination.label,
            destination.state || directStore?.state || null,
            'direct_store',
            directStore ? [directStore] : [],
            components,
          );
          return;
        }

        pushDistributedAllocations(
          allocations,
          quote,
          item,
          destination.id,
          destination.label,
          destination.state || null,
          'destination_profile',
          snapshotStores,
          components,
        );
      });
      return;
    }

    const directStore = item.storeId ? storesById.get(item.storeId) : null;
    if (directStore) {
      pushDistributedAllocations(
        allocations,
        quote,
        item,
        `direct-item:${item.id}`,
        `Loja direta · ${directStore.code}`,
        directStore.state,
        'direct_store',
        [{ ...directStore }],
        lineComponents,
      );
      return;
    }

    if (options.allocateConsolidated && quote.contextType === 'consolidated' && linkedStores.length) {
      pushDistributedAllocations(
        allocations,
        quote,
        item,
        `${LEGACY_FALLBACK_DESTINATION_PREFIX}:${quote.id}:${item.id}`,
        'Fallback igualitario',
        null,
        'legacy_fallback',
        linkedStores.map((store) => ({ ...store })),
        lineComponents,
      );
      return;
    }

    allocations.push(
      createAllocation(
        quote,
        item,
        `${UNALLOCATED_DESTINATION_PREFIX}:${quote.id}:${item.id}`,
        'Consolidado / Nao distribuido',
        null,
        'unallocated',
        null,
        lineComponents,
      ),
    );
  });

  return allocations;
}

function aggregateStores(allocations: QuoteSummaryAllocation[]): QuoteStoreSummary[] {
  const rows = new Map<string, MutableStoreSummary>();
  allocations.forEach((allocation) => {
    const key = allocation.storeId || CONSOLIDATED_STORE_SUMMARY_KEY;
    const label = allocation.storeId
      ? `${allocation.storeCode || ''} - ${allocation.storeName || ''}`.replace(/^ - | - $/g, '')
      : 'Consolidado / Nao distribuido';
    const current = rows.get(key) || {
      key,
      label,
      city: allocation.storeCity,
      state: allocation.storeState || allocation.destinationState,
      quoteIds: new Set<string>(),
      itemIds: new Set<string>(),
      quantityThousandths: 0n,
      productCents: 0n,
      discountCents: 0n,
      otherCostsCents: 0n,
      shippingCents: 0n,
      totalCents: 0n,
      shippingPending: false,
      sources: new Set<QuoteAllocationSource>(),
    };
    current.quoteIds.add(allocation.quoteId);
    current.itemIds.add(allocation.itemId);
    current.quantityThousandths += allocation.quantityThousandths;
    current.productCents += allocation.productCents;
    current.discountCents += allocation.discountCents;
    current.otherCostsCents += allocation.otherCostsCents;
    current.shippingCents += allocation.shippingCents;
    current.totalCents += allocation.totalCents;
    current.shippingPending ||= allocation.shippingPending;
    current.sources.add(allocation.source);
    rows.set(key, current);
  });

  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      city: row.city,
      state: row.state,
      quoteCount: row.quoteIds.size,
      itemCount: row.itemIds.size,
      quantityThousandths: row.quantityThousandths,
      productCents: row.productCents,
      discountCents: row.discountCents,
      otherCostsCents: row.otherCostsCents,
      shippingCents: row.shippingCents,
      totalCents: row.totalCents,
      shippingPending: row.shippingPending,
      sources: [...row.sources].sort(),
    }))
    .sort((a, b) => {
      if (a.key === CONSOLIDATED_STORE_SUMMARY_KEY && b.key !== CONSOLIDATED_STORE_SUMMARY_KEY) return 1;
      if (b.key === CONSOLIDATED_STORE_SUMMARY_KEY && a.key !== CONSOLIDATED_STORE_SUMMARY_KEY) return -1;
      if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
      return a.totalCents > b.totalCents ? -1 : 1;
    });
}

function aggregateDestinations(allocations: QuoteSummaryAllocation[]): QuoteDestinationSummary[] {
  const rows = new Map<string, MutableDestinationSummary>();
  allocations.forEach((allocation) => {
    const current = rows.get(allocation.destinationKey) || {
      key: allocation.destinationKey,
      label: allocation.destinationLabel,
      state: allocation.destinationState || allocation.storeState,
      quoteIds: new Set<string>(),
      itemIds: new Set<string>(),
      storeIds: new Set<string>(),
      quantityThousandths: 0n,
      productCents: 0n,
      discountCents: 0n,
      otherCostsCents: 0n,
      shippingCents: 0n,
      totalCents: 0n,
      shippingPending: false,
      sources: new Set<QuoteAllocationSource>(),
    };
    current.quoteIds.add(allocation.quoteId);
    current.itemIds.add(allocation.itemId);
    if (allocation.storeId) current.storeIds.add(allocation.storeId);
    current.quantityThousandths += allocation.quantityThousandths;
    current.productCents += allocation.productCents;
    current.discountCents += allocation.discountCents;
    current.otherCostsCents += allocation.otherCostsCents;
    current.shippingCents += allocation.shippingCents;
    current.totalCents += allocation.totalCents;
    current.shippingPending ||= allocation.shippingPending;
    current.sources.add(allocation.source);
    rows.set(allocation.destinationKey, current);
  });

  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      state: row.state,
      quoteCount: row.quoteIds.size,
      itemCount: row.itemIds.size,
      storeCount: row.storeIds.size,
      quantityThousandths: row.quantityThousandths,
      productCents: row.productCents,
      discountCents: row.discountCents,
      otherCostsCents: row.otherCostsCents,
      shippingCents: row.shippingCents,
      totalCents: row.totalCents,
      shippingPending: row.shippingPending,
      sources: [...row.sources].sort(),
    }))
    .sort((a, b) => {
      if (a.state !== b.state) return (a.state || 'ZZ').localeCompare(b.state || 'ZZ', 'pt-BR');
      if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
      return a.totalCents > b.totalCents ? -1 : 1;
    });
}

function coverageFor(allocations: QuoteSummaryAllocation[], totalValueCents: bigint): QuoteCoverageSummary {
  const totals: Record<QuoteAllocationSource, bigint> = {
    destination_profile: 0n,
    direct_store: 0n,
    legacy_fallback: 0n,
    unallocated: 0n,
  };
  allocations.forEach((allocation) => {
    totals[allocation.source] += allocation.totalCents;
  });
  const real = totals.destination_profile + totals.direct_store;
  const absoluteTotal = totalValueCents < 0n ? -totalValueCents : totalValueCents;
  const absoluteReal = real < 0n ? -real : real;
  const basisPoints = absoluteTotal > 0n ? Number((absoluteReal * 10000n) / absoluteTotal) : 0;
  return {
    destinationProfileCents: totals.destination_profile,
    directStoreCents: totals.direct_store,
    legacyFallbackCents: totals.legacy_fallback,
    unallocatedCents: totals.unallocated,
    realCoverageBasisPoints: Math.min(10000, basisPoints),
  };
}

export function formatSummaryQuantity(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000n;
  const fraction = String(absolute % 1000n).padStart(3, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `,${fraction}` : ''}`;
}

export function buildQuoteSummary(
  quotes: SupplyQuote[],
  options: QuoteSummaryOptions = {},
): QuoteSummary {
  const activeQuotes = quotes.filter((quote) => getEffectiveSupplyQuoteStatus(quote) !== 'cancelled');
  const allAllocations = activeQuotes.flatMap((quote) => buildAllocationsForQuote(quote, options));
  const allocations = allAllocations.filter((allocation) => allocationMatchesFilters(allocation, options));
  const totalsByStore = aggregateStores(allocations);
  const totalsByDestination = aggregateDestinations(allocations);
  const visibleQuoteIds = new Set(allocations.map((allocation) => allocation.quoteId));
  const visibleItemIds = new Set(allocations.map((allocation) => allocation.itemId));
  const quoteById = new Map(activeQuotes.map((quote) => [quote.id, quote]));
  const itemById = new Map(activeQuotes.flatMap((quote) => quote.items.map((item) => [item.id, item] as const)));
  const totalProductsCents = allocations.reduce((sum, allocation) => sum + allocation.productCents, 0n);
  const totalDiscountCents = allocations.reduce((sum, allocation) => sum + allocation.discountCents, 0n);
  const totalOtherCostsCents = allocations.reduce((sum, allocation) => sum + allocation.otherCostsCents, 0n);
  const totalShippingCents = allocations.reduce((sum, allocation) => sum + allocation.shippingCents, 0n);
  const totalValueCents = allocations.reduce((sum, allocation) => sum + allocation.totalCents, 0n);
  const actualStoreRows = totalsByStore.filter((row) => row.key !== CONSOLIDATED_STORE_SUMMARY_KEY);
  const allocatedStoreTotal = actualStoreRows.reduce((sum, row) => sum + row.totalCents, 0n);
  const pendingKeys = new Set(
    allocations
      .filter((allocation) => allocation.shippingPending)
      .map((allocation) => `${allocation.quoteId}:${allocation.itemId}:${allocation.destinationKey}`),
  );

  return {
    inputQuoteCount: quotes.length,
    excludedCancelledQuotes: quotes.length - activeQuotes.length,
    totalQuotes: visibleQuoteIds.size,
    totalItems: visibleItemIds.size,
    totalStores: actualStoreRows.length,
    totalDestinations: totalsByDestination.length,
    totalUnitPriceCents: [...visibleItemIds].reduce(
      (sum, itemId) => sum + moneyToCents(itemById.get(itemId)?.unitPrice || '0'),
      0n,
    ),
    totalProductsCents,
    totalDiscountCents,
    totalOtherCostsCents,
    totalShippingCents,
    totalValueCents,
    averagePerStoreCents: actualStoreRows.length ? allocatedStoreTotal / BigInt(actualStoreRows.length) : 0n,
    shippingPendingCount: pendingKeys.size,
    storeQuotes: [...visibleQuoteIds].filter((id) => quoteById.get(id)?.contextType === 'store').length,
    consolidatedQuotes: [...visibleQuoteIds].filter((id) => quoteById.get(id)?.contextType === 'consolidated').length,
    coverage: coverageFor(allocations, totalValueCents),
    totalsByDestination,
    totalsByStore,
    allocations,
  };
}
