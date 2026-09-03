import { describe, expect, it } from 'vitest';
import { selectLowestPriceQuotesByItem } from '../domain/supply-quote-lowest-price';
import type { SupplyQuote, SupplyQuoteItem } from '../domain/types';

function quoteItem(
  id: string,
  supplyItemId: string,
  unitPrice: string,
  shippingAmount = '0',
): SupplyQuoteItem {
  return {
    id,
    quoteId: '',
    supplyItemId,
    itemCode: supplyItemId,
    itemName: supplyItemId,
    storeNeedId: null,
    needTitle: null,
    storeId: null,
    storeCode: null,
    storeName: null,
    quantity: '1',
    unit: 'un',
    unitPrice,
    discountAmount: '0',
    shippingType: shippingAmount === '0' ? 'free' : 'informed',
    shippingAmount,
    otherCosts: '0',
    deliveryDays: null,
    minimumQuantity: null,
    offeredBrandModel: null,
    notes: null,
    productUrl: null,
    capturedAt: null,
  };
}

function quote(id: string, code: string, quoteDate: string, items: SupplyQuoteItem[]): SupplyQuote {
  return {
    id,
    code,
    supplierId: `supplier-${id}`,
    supplierName: `Fornecedor ${id}`,
    supplierChannelId: `channel-${id}`,
    channel: 'ecommerce',
    originCity: null,
    originState: null,
    quoteDate,
    validUntil: null,
    contact: null,
    contextType: 'consolidated',
    status: 'draft',
    notes: null,
    createdAt: `${quoteDate}T12:00:00Z`,
    stores: [],
    items: items.map((item) => ({ ...item, quoteId: id })),
  };
}

describe('selectLowestPriceQuotesByItem', () => {
  it('seleciona uma cotacao e o item vencedor para cada item distinto', () => {
    const quoteA = quote('quote-a', 'COT-00001', '2026-08-19', [
      quoteItem('a-1', 'item-1', '10.00'),
      quoteItem('a-2', 'item-2', '40.00'),
    ]);
    const quoteB = quote('quote-b', 'COT-00002', '2026-08-20', [
      quoteItem('b-1', 'item-1', '12.00'),
      quoteItem('b-2', 'item-2', '30.00'),
    ]);
    const quoteC = quote('quote-c', 'COT-00003', '2026-08-20', [
      quoteItem('c-1', 'item-3', '5.00'),
    ]);

    const selection = selectLowestPriceQuotesByItem([quoteA, quoteB, quoteC]);

    expect(selection.distinctItemCount).toBe(3);
    expect([...selection.quoteIds]).toEqual(['quote-a', 'quote-b', 'quote-c']);
    expect([...selection.winningItemIds]).toEqual(['a-1', 'b-2', 'c-1']);
    expect(selection.winningItemCountByQuote.get('quote-a')).toBe(1);
    expect(selection.winningItemCountByQuote.get('quote-b')).toBe(1);
    expect(selection.winningItemCountByQuote.get('quote-c')).toBe(1);
  });

  it('desempata pelo menor custo total e depois pela cotacao mais recente', () => {
    const higherFreight = quote('quote-a', 'COT-00001', '2026-08-21', [
      quoteItem('a-1', 'item-1', '10.00', '8.00'),
    ]);
    const lowerFreight = quote('quote-b', 'COT-00002', '2026-08-20', [
      quoteItem('b-1', 'item-1', '10.00', '5.00'),
    ]);
    const olderTie = quote('quote-c', 'COT-00003', '2026-08-19', [
      quoteItem('c-1', 'item-2', '20.00'),
    ]);
    const newerTie = quote('quote-d', 'COT-00004', '2026-08-20', [
      quoteItem('d-1', 'item-2', '20.00'),
    ]);

    const selection = selectLowestPriceQuotesByItem([
      higherFreight,
      lowerFreight,
      olderTie,
      newerTie,
    ]);

    expect([...selection.quoteIds]).toEqual(['quote-b', 'quote-d']);
    expect([...selection.winningItemIds]).toEqual(['b-1', 'd-1']);
  });

  it('nunca usa cotacao cancelada como menor preco', () => {
    const valid = quote('quote-valid', 'COT-00010', '2026-08-20', [
      quoteItem('valid-item', 'item-1', '10.00'),
    ]);
    const cancelled: SupplyQuote = {
      ...quote('quote-cancelled', 'COT-00011', '2026-08-21', [
        quoteItem('cancelled-item', 'item-1', '1.00'),
      ]),
      status: 'cancelled',
    };

    const selection = selectLowestPriceQuotesByItem([valid, cancelled]);

    expect([...selection.quoteIds]).toEqual(['quote-valid']);
    expect([...selection.winningItemIds]).toEqual(['valid-item']);
  });
});
