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
  itemsBudgetCents: 498_788n,
  worksBudgetCents: 1_080_000n,
  budgetTotalCents: 1_578_788n,
  itemsRealizedCents: 488_500n,
  worksContractedCents: 1_090_000n,
  realizedTotalCents: 1_578_500n,
  differenceCents: 288n,
  paidCents: 560_600n,
  payableCents: 1_017_900n,
  worksDocumentedCents: 920_000n,
  worksMissingDocumentsCents: 170_000n,
  documentationStatus: 'partial',
};

const itemRow: FinanceStoreItemDetailRow = {
  id: 'purchase:item:store',
  purchaseId: 'purchase-1',
  purchaseCode: 'CMP-00001',
  quoteCode: 'COT-00001',
  supplierName: 'Fornecedor Teste',
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
  it('gera Excel da Visão Geral com resumo e lojas', async () => {
    const bytes = await createFinanceOverviewWorkbook({
      rows: [overviewRow],
      generatedAt: new Date('2026-09-18T12:00:00-03:00'),
      filtersText: 'UF: DF',
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Visão Geral', 'Lojas']);
    expect(workbook.getWorksheet('Lojas')?.getCell('A2').value).toBe('LOJ-001');
    expect(workbook.getWorksheet('Lojas')?.getCell('O2').value).toBe('Parcial');
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
