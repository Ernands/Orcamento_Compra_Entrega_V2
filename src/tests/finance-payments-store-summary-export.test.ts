import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createFinanceUnifiedPaymentsWorkbookWithStoreSummary } from '../data/exports/finance-unified-payments-store-summary-export';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { Store } from '../domain/types';

const stores: Store[] = [
  {
    id: 'store-1',
    code: 'LOJ-001',
    name: 'Acaraú',
    city: 'Acaraú',
    state: 'CE',
    address: null,
    responsibleUserId: null,
    responsibleName: null,
    status: 'active',
    plannedOpeningDate: null,
    notes: null,
  },
  {
    id: 'store-2',
    code: 'LOJ-002',
    name: 'Acopiara',
    city: 'Acopiara',
    state: 'CE',
    address: null,
    responsibleUserId: null,
    responsibleName: null,
    status: 'active',
    plannedOpeningDate: null,
    notes: null,
  },
];

const payment: UnifiedFinancePaymentRow = {
  id: 'payment-1',
  status: 'paid',
  date: '2026-10-01',
  originAllocations: { equipment: 4_000n, furniture: 2_000n, works: 6_000n },
  referenceCodes: ['CMP-00001'],
  purchaseIds: ['purchase-1'],
  purchaseOrderIds: ['order-1'],
  paymentIds: ['payment-1'],
  workServiceId: null,
  supplyItemIds: ['item-1'],
  supplierName: 'Fornecedor Teste',
  description: 'Pagamento misto',
  paymentMethod: 'pix',
  sourceLabel: 'PIX',
  installmentLabel: 'Pagamento realizado',
  amountCents: 12_000n,
  storeIds: ['store-1', 'store-2'],
  storeCodes: ['LOJ-001', 'LOJ-002'],
  states: ['CE'],
  storeAllocations: [
    {
      storeId: 'store-1',
      storeCode: 'LOJ-001',
      state: 'CE',
      amountCents: 8_000n,
      originAllocations: { equipment: 3_000n, furniture: 1_000n, works: 4_000n },
    },
    {
      storeId: 'store-2',
      storeCode: 'LOJ-002',
      state: 'CE',
      amountCents: 4_000n,
      originAllocations: { equipment: 1_000n, furniture: 1_000n, works: 2_000n },
    },
  ],
  unallocatedCents: 0n,
  notes: null,
};

describe('Excel de pagamentos com resumo por loja', () => {
  it('inclui na aba Resumo o detalhamento por loja e por origem', async () => {
    const bytes = await createFinanceUnifiedPaymentsWorkbookWithStoreSummary({
      rows: [payment],
      summaryRows: [payment],
      stores,
      view: 'paid',
      generatedAt: new Date('2026-10-04T18:25:00-03:00'),
      filtersText: 'Situação: Pago',
    });

    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);
    const summary = workbook.getWorksheet('Resumo');

    expect(summary?.getCell('A14').value).toBe('PAGO');
    expect(summary?.getCell('A15').value).toBe('LOJA');
    expect(summary?.getCell('B15').value).toBe('Obras e Serviços');
    expect(summary?.getCell('C15').value).toBe('Equipamentos');
    expect(summary?.getCell('D15').value).toBe('Mobiliário');
    expect(summary?.getCell('E15').value).toBe('Valor Total');

    expect(summary?.getCell('A16').value).toBe('LOJ-001 · ACARAÚ - CE');
    expect(summary?.getCell('B16').value).toBe(40);
    expect(summary?.getCell('C16').value).toBe(30);
    expect(summary?.getCell('D16').value).toBe(10);
    expect(summary?.getCell('E16').value).toBe(80);

    expect(summary?.getCell('A17').value).toBe('LOJ-002 · ACOPIARA - CE');
    expect(summary?.getCell('B17').value).toBe(20);
    expect(summary?.getCell('C17').value).toBe(10);
    expect(summary?.getCell('D17').value).toBe(10);
    expect(summary?.getCell('E17').value).toBe(40);
  });
});
