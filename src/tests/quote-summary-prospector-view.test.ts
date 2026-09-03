import { describe, expect, it } from 'vitest';
import { buildProspectorDisplayRows } from '../domain/quote-summary-prospector-view';
import type {
  QuoteDestinationSummary,
  QuoteSummary,
  QuoteSummaryAllocation,
} from '../domain/supply-quote-summary';

function profileAllocation(
  overrides: Partial<QuoteSummaryAllocation>,
): QuoteSummaryAllocation {
  return {
    key: 'allocation',
    quoteId: 'quote-1',
    quoteCode: 'COT-00001',
    supplierName: 'Fornecedor',
    itemId: 'item-1',
    itemCode: 'ITM-0001',
    itemName: 'Item',
    destinationKey: 'destination-1',
    destinationLabel: 'Joao Henrique - CE',
    destinationState: 'CE',
    source: 'destination_profile',
    storeId: 'store-1',
    storeCode: 'LOJ-001',
    storeName: 'Loja 1',
    storeCity: 'Acarau',
    storeState: 'CE',
    quantityThousandths: 2000n,
    productCents: 10000n,
    discountCents: 0n,
    otherCostsCents: 0n,
    shippingCents: 1000n,
    totalCents: 11000n,
    shippingPending: false,
    ...overrides,
  };
}

describe('visualizacao do resumo por Prospector / UF', () => {
  it('consolida destinos de itens diferentes em uma unica linha por Prospector e UF', () => {
    const allocations = [
      profileAllocation({}),
      profileAllocation({
        key: 'allocation-2',
        itemId: 'item-2',
        itemCode: 'ITM-0002',
        destinationKey: 'destination-2',
        storeId: 'store-2',
        storeCode: 'LOJ-002',
        storeName: 'Loja 2',
        storeCity: 'Acopiara',
        quantityThousandths: 3000n,
        productCents: 20000n,
        shippingCents: 2000n,
        totalCents: 22000n,
      }),
    ];

    const unallocated: QuoteDestinationSummary = {
      key: 'unallocated:quote-1:item-3',
      label: 'Consolidado / Nao distribuido',
      state: null,
      quoteCount: 1,
      itemCount: 1,
      storeCount: 0,
      quantityThousandths: 1000n,
      productCents: 5000n,
      discountCents: 0n,
      otherCostsCents: 0n,
      shippingCents: 0n,
      totalCents: 5000n,
      shippingPending: false,
      sources: ['unallocated'],
    };

    const summary = {
      allocations,
      totalsByDestination: [unallocated],
    } as QuoteSummary;

    const rows = buildProspectorDisplayRows(summary);
    const prospector = rows.find((row) => row.sources.includes('destination_profile'));

    expect(prospector).toMatchObject({
      label: 'Joao Henrique - CE',
      state: 'CE',
      quoteCount: 1,
      itemCount: 2,
      storeCount: 2,
      quantityThousandths: 5000n,
      productCents: 30000n,
      shippingCents: 3000n,
      totalCents: 33000n,
      sources: ['destination_profile'],
    });
    expect(rows.filter((row) => row.label === 'Joao Henrique - CE')).toHaveLength(1);
    expect(rows.find((row) => row.key === unallocated.key)).toEqual(unallocated);
  });
});
