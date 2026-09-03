import type {
  QuoteAllocationSource,
  QuoteDestinationSummary,
  QuoteSummary,
} from './supply-quote-summary';

interface MutableProspectorRow {
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

export function buildProspectorDisplayRows(summary: QuoteSummary): QuoteDestinationSummary[] {
  const grouped = new Map<string, MutableProspectorRow>();

  summary.allocations
    .filter((allocation) => allocation.source === 'destination_profile')
    .forEach((allocation) => {
      const state = allocation.destinationState || allocation.storeState;
      const key = `prospector:${state || ''}:${allocation.destinationLabel}`;
      const current = grouped.get(key) || {
        key,
        label: allocation.destinationLabel,
        state,
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
      grouped.set(key, current);
    });

  const profileRows: QuoteDestinationSummary[] = [...grouped.values()].map((row) => ({
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
  }));

  const otherRows = summary.totalsByDestination.filter(
    (row) => !row.sources.includes('destination_profile'),
  );

  return [...profileRows, ...otherRows].sort((a, b) => {
    if (a.state !== b.state) return (a.state || 'ZZ').localeCompare(b.state || 'ZZ', 'pt-BR');
    if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
    return a.totalCents > b.totalCents ? -1 : 1;
  });
}
