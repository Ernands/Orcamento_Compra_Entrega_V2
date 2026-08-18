import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  createQuoteSummaryPdf,
  createQuoteSummaryWorkbook,
} from '../data/exports/quote-summary-exports';
import { buildQuoteSummary } from '../domain/supply-quote-summary';
import type { Store, SupplyQuote, SupplyQuoteItem } from '../domain/types';

const storeOne: Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'> = {
  id: 'store-1',
  code: 'LOJ-001',
  name: 'Loja Um',
  city: 'Campinas',
  state: 'SP',
};
const storeTwo: Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'> = {
  id: 'store-2',
  code: 'LOJ-002',
  name: 'Loja Dois',
  city: 'Jundiai',
  state: 'SP',
};

function quoteItem(
  id: string,
  quoteId: string,
  unitPrice: string,
  quantity: string,
  store: typeof storeOne | null,
): SupplyQuoteItem {
  return {
    id,
    quoteId,
    supplyItemId: `catalog-${id}`,
    itemCode: `ITM-${id}`,
    itemName: `Item ${id}`,
    storeNeedId: null,
    needTitle: null,
    storeId: store?.id || null,
    storeCode: store?.code || null,
    storeName: store?.name || null,
    quantity,
    unit: 'un',
    unitPrice,
    discountAmount: '0.00',
    shippingType: 'free',
    shippingAmount: '0.00',
    otherCosts: '0.00',
    deliveryDays: 5,
    minimumQuantity: null,
    offeredBrandModel: null,
    notes: null,
    productUrl: null,
    capturedAt: null,
  };
}

const storeQuote: SupplyQuote = {
  id: 'quote-store',
  code: 'COT-00001',
  supplierId: 'supplier-1',
  supplierName: 'Fornecedor Um',
  supplierChannelId: 'channel-1',
  channel: 'local_city',
  originCity: 'Campinas',
  originState: 'SP',
  quoteDate: '2026-08-18',
  validUntil: '2026-09-18',
  contact: null,
  contextType: 'store',
  status: 'draft',
  notes: null,
  createdAt: '2026-08-18T12:00:00Z',
  stores: [storeOne],
  items: [quoteItem('1', 'quote-store', '10.00', '2', storeOne)],
};

const consolidatedQuote: SupplyQuote = {
  ...storeQuote,
  id: 'quote-consolidated',
  code: 'COT-00002',
  contextType: 'consolidated',
  status: 'received',
  stores: [storeOne, storeTwo],
  items: [
    quoteItem('2', 'quote-consolidated', '30.00', '1', storeTwo),
    quoteItem('3', 'quote-consolidated', '40.00', '1', null),
  ],
};

const quotes = [storeQuote, consolidatedQuote];

describe('resumo e exportacao de cotacoes', () => {
  it('calcula indicadores e separa itens consolidados sem duplicar valores', () => {
    const summary = buildQuoteSummary(quotes);

    expect(summary).toMatchObject({
      totalQuotes: 2,
      totalItems: 3,
      totalUnitPriceCents: 8000n,
      totalValueCents: 9000n,
      storeQuotes: 1,
      consolidatedQuotes: 1,
    });
    expect(summary.totalsByStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: storeOne.id, quoteCount: 1, totalCents: 2000n }),
        expect.objectContaining({ key: storeTwo.id, quoteCount: 1, totalCents: 3000n }),
        expect.objectContaining({
          key: 'consolidated-undistributed',
          quoteCount: 1,
          totalCents: 4000n,
        }),
      ]),
    );
    expect(summary.totalsByStore.reduce((total, row) => total + row.totalCents, 0n)).toBe(
      summary.totalValueCents,
    );
  });

  it('gera XLSX real com abas operacionais e valores numericos', async () => {
    const summary = buildQuoteSummary(quotes);
    const buffer = await createQuoteSummaryWorkbook({
      quotes,
      summary,
      filters: { search: 'Item', status: 'Rascunho', store: 'LOJ-001' },
      generatedAt: new Date('2026-08-18T12:00:00Z'),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Cotacoes',
      'Itens',
      'Totais por loja',
    ]);
    expect(workbook.getWorksheet('Resumo')?.getCell('B9').value).toBe(90);
    expect(workbook.getWorksheet('Resumo')?.getCell('B3').value).toContain(
      'Pesquisa: Item | Status: Rascunho | Loja: LOJ-001',
    );
    expect(workbook.getWorksheet('Cotacoes')?.getCell('B2').value).toBe('Rascunho');
    expect(workbook.getWorksheet('Cotacoes')?.getCell('J2').value).toBe(20);
  });

  it('gera um PDF valido sem API externa', async () => {
    const summary = buildQuoteSummary(quotes);
    const manyStoresSummary = {
      ...summary,
      totalsByStore: Array.from({ length: 80 }, (_, index) => ({
        key: `store-${index}`,
        label: `LOJ-${String(index + 1).padStart(3, '0')} - Loja ${index + 1}`,
        quoteCount: 1,
        itemCount: 1,
        totalCents: BigInt((index + 1) * 10000),
      })),
    };
    const buffer = await createQuoteSummaryPdf({
      quotes,
      summary: manyStoresSummary,
      filters: { search: 'Fornecedor', status: 'Todos', store: 'Todas' },
      generatedAt: new Date('2026-08-18T12:00:00Z'),
    });
    const signature = new TextDecoder().decode(buffer.slice(0, 5));
    const documentContent = new TextDecoder().decode(buffer);

    expect(signature).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(3000);
    expect(documentContent.match(/\/Type\s*\/Page\b/g)?.length || 0).toBeGreaterThan(1);
  });
});
