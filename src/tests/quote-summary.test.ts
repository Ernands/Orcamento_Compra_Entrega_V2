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
const storeThree: Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'> = {
  id: 'store-3',
  code: 'LOJ-003',
  name: 'Loja Tres',
  city: 'Rio de Janeiro',
  state: 'RJ',
};

function quoteItem(
  id: string,
  quoteId: string,
  unitPrice: string,
  quantity: string,
  store: typeof storeOne | null,
  shippingAmount = '0.00',
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
    shippingType: shippingAmount === '0.00' ? 'free' : 'informed',
    shippingAmount,
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
  items: [quoteItem('1', 'quote-store', '10.00', '2', storeOne, '5.00')],
};

const consolidatedQuote: SupplyQuote = {
  ...storeQuote,
  id: 'quote-consolidated',
  code: 'COT-00002',
  contextType: 'consolidated',
  status: 'received',
  stores: [storeOne, storeTwo],
  items: [
    quoteItem('2', 'quote-consolidated', '30.00', '1', storeTwo, '7.00'),
    quoteItem('3', 'quote-consolidated', '40.00', '1', null),
  ],
};

const quotes = [storeQuote, consolidatedQuote];

function destinationQuote(): SupplyQuote {
  return {
    ...consolidatedQuote,
    id: 'quote-destinations',
    code: 'COT-00003',
    stores: [storeOne, storeTwo],
    items: [
      {
        ...quoteItem('4', 'quote-destinations', '100.00', '2', null),
        destinations: [
          {
            id: 'destination-1',
            quoteItemId: '4',
            destinationType: 'profile',
            profileId: 'profile-1',
            storeId: null,
            label: 'Prospector SP A - SP',
            state: 'SP',
            destinationCount: 1,
            quantity: '1',
            unit: 'un',
            shippingType: 'informed',
            shippingAmount: '10.00',
            deliveryDays: 5,
            notes: null,
            position: 1,
            stores: [
              {
                storeId: storeOne.id,
                code: storeOne.code,
                name: storeOne.name,
                city: storeOne.city,
                state: storeOne.state,
                snapshotSource: 'save',
              },
            ],
          },
          {
            id: 'destination-2',
            quoteItemId: '4',
            destinationType: 'profile',
            profileId: 'profile-2',
            storeId: null,
            label: 'Prospector SP B - SP',
            state: 'SP',
            destinationCount: 1,
            quantity: '1',
            unit: 'un',
            shippingType: 'informed',
            shippingAmount: '30.00',
            deliveryDays: 7,
            notes: null,
            position: 2,
            stores: [
              {
                storeId: storeTwo.id,
                code: storeTwo.code,
                name: storeTwo.name,
                city: storeTwo.city,
                state: storeTwo.state,
                snapshotSource: 'save',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('resumo e exportacao de cotacoes', () => {
  it('separa produtos, frete e valor nao distribuido sem perder centavos', () => {
    const summary = buildQuoteSummary(quotes);

    expect(summary).toMatchObject({
      totalQuotes: 2,
      totalItems: 3,
      totalProductsCents: 9000n,
      totalShippingCents: 1200n,
      totalValueCents: 10200n,
      storeQuotes: 1,
      consolidatedQuotes: 1,
    });
    expect(summary.totalsByStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: storeOne.id,
          state: 'SP',
          quoteCount: 1,
          itemCount: 1,
          shippingCents: 500n,
          totalCents: 2500n,
          sources: ['direct_store'],
        }),
        expect.objectContaining({
          key: storeTwo.id,
          state: 'SP',
          quoteCount: 1,
          itemCount: 1,
          shippingCents: 700n,
          totalCents: 3700n,
          sources: ['direct_store'],
        }),
        expect.objectContaining({
          key: 'consolidated-undistributed',
          quoteCount: 1,
          itemCount: 1,
          shippingCents: 0n,
          totalCents: 4000n,
          sources: ['unallocated'],
        }),
      ]),
    );
    expect(summary.coverage.unallocatedCents).toBe(4000n);
    expect(summary.totalsByStore.reduce((total, row) => total + row.totalCents, 0n)).toBe(
      summary.totalValueCents,
    );
    expect(summary.totalsByDestination.reduce((total, row) => total + row.totalCents, 0n)).toBe(
      summary.totalValueCents,
    );
  });

  it('distribui cotacao pelos destinos reais e mantem o frete no destino correto', () => {
    const summary = buildQuoteSummary([destinationQuote()]);
    const rowOne = summary.totalsByStore.find((row) => row.key === storeOne.id);
    const rowTwo = summary.totalsByStore.find((row) => row.key === storeTwo.id);

    expect(summary.totalProductsCents).toBe(20000n);
    expect(summary.totalShippingCents).toBe(4000n);
    expect(summary.totalValueCents).toBe(24000n);
    expect(rowOne).toMatchObject({ shippingCents: 1000n, totalCents: 11000n });
    expect(rowTwo).toMatchObject({ shippingCents: 3000n, totalCents: 13000n });
    expect(summary.totalsByDestination.map((row) => [row.label, row.shippingCents, row.totalCents])).toEqual([
      ['Prospector SP A - SP', 1000n, 11000n],
      ['Prospector SP B - SP', 3000n, 13000n],
    ]);
    expect(summary.coverage.destinationProfileCents).toBe(24000n);
    expect(summary.coverage.realCoverageBasisPoints).toBe(10000);
  });

  it('respeita destino direto de loja sem ratear para outras lojas', () => {
    const directQuote: SupplyQuote = {
      ...consolidatedQuote,
      id: 'quote-direct',
      code: 'COT-00004',
      items: [
        {
          ...quoteItem('5', 'quote-direct', '50.00', '2', null),
          destinations: [
            {
              id: 'destination-direct',
              quoteItemId: '5',
              destinationType: 'store',
              profileId: null,
              storeId: storeTwo.id,
              label: `${storeTwo.code} - ${storeTwo.name}`,
              state: storeTwo.state,
              destinationCount: 1,
              quantity: '2',
              unit: 'un',
              shippingType: 'informed',
              shippingAmount: '9.00',
              deliveryDays: 4,
              notes: null,
              position: 1,
              stores: [],
            },
          ],
        },
      ],
    };

    const summary = buildQuoteSummary([directQuote]);
    expect(summary.totalsByStore).toHaveLength(1);
    expect(summary.totalsByStore[0]).toMatchObject({
      key: storeTwo.id,
      totalCents: 10900n,
      shippingCents: 900n,
      sources: ['direct_store'],
    });
    expect(summary.coverage.directStoreCents).toBe(10900n);
  });

  it('rateia perfil com tres lojas preservando exatamente os centavos', () => {
    const centsQuote: SupplyQuote = {
      ...consolidatedQuote,
      id: 'quote-cents',
      code: 'COT-00005',
      stores: [storeOne, storeTwo, storeThree],
      items: [
        {
          ...quoteItem('6', 'quote-cents', '100.00', '1', null),
          destinations: [
            {
              id: 'destination-cents',
              quoteItemId: '6',
              destinationType: 'profile',
              profileId: 'profile-all',
              storeId: null,
              label: 'Prospector multi-UF',
              state: 'SP',
              destinationCount: 3,
              quantity: '1',
              unit: 'un',
              shippingType: 'free',
              shippingAmount: '0',
              deliveryDays: 5,
              notes: null,
              position: 1,
              stores: [storeOne, storeTwo, storeThree].map((store) => ({
                storeId: store.id,
                code: store.code,
                name: store.name,
                city: store.city,
                state: store.state,
                snapshotSource: 'save' as const,
              })),
            },
          ],
        },
      ],
    };

    const summary = buildQuoteSummary([centsQuote]);
    expect(summary.totalsByStore.map((row) => row.totalCents).sort((a, b) => Number(b - a))).toEqual([
      3334n,
      3333n,
      3333n,
    ]);
    expect(summary.totalsByStore.reduce((total, row) => total + row.totalCents, 0n)).toBe(10000n);
    expect(summary.totalsByStore.reduce((total, row) => total + row.quantityThousandths, 0n)).toBe(1000n);
  });

  it('usa fallback apenas quando solicitado e identifica sua origem', () => {
    const summary = buildQuoteSummary(quotes, { allocateConsolidated: true });

    expect(summary.totalsByStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: storeOne.id, totalCents: 4500n }),
        expect.objectContaining({ key: storeTwo.id, totalCents: 5700n }),
      ]),
    );
    expect(summary.totalsByStore.find((row) => row.key === 'consolidated-undistributed')).toBeUndefined();
    expect(summary.coverage.legacyFallbackCents).toBe(4000n);
    expect(summary.coverage.unallocatedCents).toBe(0n);
    expect(summary.totalsByStore.reduce((total, row) => total + row.totalCents, 0n)).toBe(
      summary.totalValueCents,
    );
  });

  it('recalcula todos os totais para loja ou UF selecionada', () => {
    const quote = destinationQuote();
    const storeSummary = buildQuoteSummary([quote], { storeIds: [storeOne.id] });
    const stateSummary = buildQuoteSummary([quote], { states: ['SP'] });
    const emptyStateSummary = buildQuoteSummary([quote], { states: ['RJ'] });

    expect(storeSummary.totalStores).toBe(1);
    expect(storeSummary.totalProductsCents).toBe(10000n);
    expect(storeSummary.totalShippingCents).toBe(1000n);
    expect(storeSummary.totalValueCents).toBe(11000n);
    expect(stateSummary.totalValueCents).toBe(24000n);
    expect(emptyStateSummary.totalValueCents).toBe(0n);
    expect(emptyStateSummary.totalQuotes).toBe(0);
  });

  it('exclui cotacoes canceladas dos calculos financeiros', () => {
    const cancelled: SupplyQuote = {
      ...storeQuote,
      id: 'quote-cancelled',
      code: 'COT-00999',
      status: 'cancelled',
      items: [quoteItem('cancelled-item', 'quote-cancelled', '1.00', '1000', storeOne, '0.00')],
    };

    const summary = buildQuoteSummary([storeQuote, cancelled]);
    expect(summary.inputQuoteCount).toBe(2);
    expect(summary.excludedCancelledQuotes).toBe(1);
    expect(summary.totalQuotes).toBe(1);
    expect(summary.totalValueCents).toBe(2500n);
  });

  it('gera XLSX real com abas operacionais, frete e valores numericos', async () => {
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
    expect(workbook.getWorksheet('Resumo')?.getCell('B9').value).toBe(12);
    expect(workbook.getWorksheet('Resumo')?.getCell('B10').value).toBe(102);
    expect(workbook.getWorksheet('Resumo')?.getCell('B3').value).toContain(
      'Pesquisa: Item | Status: Rascunho | Loja: LOJ-001',
    );
    expect(workbook.getWorksheet('Cotacoes')?.getCell('B2').value).toBe('Rascunho');
    expect(workbook.getWorksheet('Cotacoes')?.getCell('J2').value).toBe(25);
    expect(workbook.getWorksheet('Totais por loja')?.getCell('B1').value).toBe('UF');
    expect(workbook.getWorksheet('Totais por loja')?.getCell('E1').value).toBe('Frete');
  });

  it('gera um PDF valido sem API externa', async () => {
    const summary = buildQuoteSummary(quotes);
    const manyStoresSummary = {
      ...summary,
      totalsByStore: Array.from({ length: 80 }, (_, index) => ({
        key: `store-${index}`,
        label: `LOJ-${String(index + 1).padStart(3, '0')} - Loja ${index + 1}`,
        city: 'Campinas',
        state: 'SP',
        quoteCount: 1,
        itemCount: 1,
        quantityThousandths: 1000n,
        productCents: BigInt(index + 1) * 9000n,
        discountCents: 0n,
        otherCostsCents: 0n,
        shippingCents: BigInt(index + 1) * 100n,
        totalCents: BigInt(index + 1) * 9100n,
        shippingPending: false,
        sources: ['direct_store' as const],
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
