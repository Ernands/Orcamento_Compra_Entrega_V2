import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  createFinanceOverviewPdf,
  createFinanceOverviewWorkbook,
  createFinanceStoreDetailPdf,
  createFinanceStoreDetailWorkbook,
} from '../data/exports/finance-exports';
import type {
  FinanceOverviewStoreRow,
  FinanceStoreItemDetailRow,
} from '../domain/finance-overview';
import type { WorkService } from '../domain/works-types';

const overviewRow: FinanceOverviewStoreRow = {
  storeId: 'store-1',
  code: 'LOJ-001',
  name: 'Loja Teste',
  city: 'Brasília',
  state: 'DF',
  budgetBbCents: 5_000_000n,
  equipmentBudgetCents: 300_000n,
  furnitureBudgetCents: 198_788n,
  itemsBudgetCents: 498_788n,
  worksBudgetCents: 1_080_000n,
  budgetTotalCents: 1_578_788n,
  budgetVarianceToBbCents: 3_421_212n,
  equipmentRealizedCents: 295_000n,
  furnitureRealizedCents: 193_500n,
  itemsRealizedCents: 488_500n,
  worksContractedCents: 1_090_000n,
  realizedTotalCents: 1_578_500n,
  realizedVarianceToBbCents: 3_421_500n,
  differenceCents: 288n,
  paidCents: 560_600n,
  payableCents: 1_017_900n,
  worksDocumentedCents: 920_000n,
  worksMissingDocumentsCents: 170_000n,
  documentationStatus: 'partial',
};

const itemRow: FinanceStoreItemDetailRow = {
  id: 'item-1:store-1',
  supplyItemId: 'item-1',
  purchaseId: 'purchase-1',
  purchaseItemId: 'purchase-item-1',
  purchaseCode: 'CMP-00001',
  quoteCode: 'COT-00001',
  supplierName: 'Fornecedor Teste',
  purchaseRefs: [
    {
      purchaseId: 'purchase-1',
      purchaseItemId: 'purchase-item-1',
      purchaseCode: 'CMP-00001',
      quoteCode: 'COT-00001',
      supplierName: 'Fornecedor Teste',
    },
  ],
  segmentNames: ['Segmento Teste'],
  itemCode: 'ITM-0001',
  itemName: 'Notebook',
  itemCategory: 'Equipamentos',
  unit: 'un',
  approvedQuantity: 1000n,
  budgetCents: 300_000n,
  purchasedQuantity: 1000n,
  realizedCents: 295_000n,
  differenceCents: 5_000n,
  purchaseStatus: 'purchased',
};

const work = {
  id: 'work-1',
  code: 'OBR-0001',
  storeId: 'store-1',
  storeCode: 'LOJ-001',
  storeName: 'Loja Teste',
  storeCity: 'Brasília',
  storeState: 'DF',
  category: 'Elétrica',
  description: 'Adequação elétrica',
  providerName: 'Prestador Teste',
  budgetAmount: '10800.00',
  contractedAmount: '10900.00',
  progressPercent: 60,
  status: 'in_progress',
  payments: [{ status: 'paid', amount: '5000.00' }],
  documents: [{ documentAmount: '9200.00' }],
} as unknown as WorkService;

describe('exportações financeiras', () => {
  it('gera Excel da Visão Geral com resumo e lojas no novo agrupamento', async () => {
    const bytes = await createFinanceOverviewWorkbook({
      rows: [overviewRow],
      generatedAt: new Date('2026-09-18T12:00:00-03:00'),
      filtersText: 'UF: DF',
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Visão Geral', 'Lojas']);
    const stores = workbook.getWorksheet('Lojas');
    expect(stores?.getCell('A2').value).toBe('LOJ-001');
    expect(stores?.getCell('F1').value).toBe('Orçado Equipamentos');
    expect(stores?.getCell('G1').value).toBe('Orçado Mobiliário');
    expect(stores?.getCell('K1').value).toBe('Realizado Equipamentos');
    expect(stores?.getCell('L1').value).toBe('Realizado Mobiliário');
    expect(stores?.getCell('O1').value).toBe('Dif. Em Relação a Verba');
    expect(stores?.getCell('O2').value).toBe(34_215);
    expect(stores?.getCell('P1').value).toBe('Pago');
    expect(stores?.getCell('Q1').value).toBe('Saldo a pagar');
    expect(stores?.getCell('R1').value).toBe('Documentação');
    expect(stores?.getCell('R2').value).toBe('Parcial');
    expect(stores?.getCell('E1').fill).toMatchObject({ fgColor: { argb: 'FFDDEBFA' } });
    expect(stores?.getCell('K1').fill).toMatchObject({ fgColor: { argb: 'FFDDF3E7' } });
    expect(stores?.getCell('P1').fill).toMatchObject({ fgColor: { argb: 'FFFDEACF' } });
    expect(stores?.getCell('R1').fill).toMatchObject({ fgColor: { argb: 'FFEFF2F0' } });
  });

  it('gera PDF válido da Visão Geral', async () => {
    const bytes = await createFinanceOverviewPdf({
      rows: [overviewRow],
      generatedAt: new Date('2026-09-18T12:00:00-03:00'),
      filtersText: 'Todas as lojas',
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('gera Excel do detalhe com resumo, itens e obras', async () => {
    const bytes = await createFinanceStoreDetailWorkbook({
      store: { code: 'LOJ-001', name: 'Loja Teste', city: 'Brasília', state: 'DF' },
      overview: overviewRow,
      items: [itemRow],
      works: [work],
      generatedAt: new Date('2026-09-18T12:00:00-03:00'),
      filtersText: 'Sem filtros',
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo Loja',
      'Itens',
      'Obras e Serviços',
    ]);
    expect(workbook.getWorksheet('Itens')?.getCell('A2').value).toContain('ITM-0001');
    expect(workbook.getWorksheet('Obras e Serviços')?.getCell('A2').value).toContain('OBR-0001');
  });

  it('gera PDF válido do detalhe da loja', async () => {
    const bytes = await createFinanceStoreDetailPdf({
      store: { code: 'LOJ-001', name: 'Loja Teste', city: 'Brasília', state: 'DF' },
      overview: overviewRow,
      items: [itemRow],
      works: [work],
      generatedAt: new Date('2026-09-18T12:00:00-03:00'),
      filtersText: 'Situação dos itens: Comprado',
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
