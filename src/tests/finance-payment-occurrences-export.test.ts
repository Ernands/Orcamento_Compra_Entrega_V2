import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createFinanceUnifiedPaymentsWorkbook } from '../data/exports/finance-unified-payments-exports';
import { decorateFinancePaymentsWithOccurrences } from '../domain/finance-payment-occurrences';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { PurchasePaymentOccurrenceV2 } from '../domain/payment-occurrences';
import type { Store } from '../domain/types';

const baseRow: UnifiedFinancePaymentRow = {
  id: 'purchase:cmp-43-payment',
  status: 'paid',
  date: '2026-10-03',
  originAllocations: { equipment: 2_360_039n, furniture: 0n, works: 0n },
  referenceCodes: ['CMP-00043'],
  purchaseIds: ['cmp-43'],
  purchaseOrderIds: ['order-43'],
  paymentIds: ['payment-43'],
  workServiceId: null,
  supplyItemIds: ['item-1'],
  supplierName: 'Mercado Livre',
  description: 'Compra de equipamentos',
  paymentMethod: 'pix',
  sourceLabel: 'Mercado Livre',
  installmentLabel: 'Pagamento realizado',
  amountCents: 2_360_039n,
  storeIds: ['store-1'],
  storeCodes: ['LOJ-001'],
  states: ['CE'],
  storeAllocations: [{
    storeId: 'store-1',
    storeCode: 'LOJ-001',
    state: 'CE',
    amountCents: 2_360_039n,
    originAllocations: { equipment: 2_360_039n, furniture: 0n, works: 0n },
  }],
  unallocatedCents: 0n,
  notes: null,
};

const occurrences: PurchasePaymentOccurrenceV2[] = [
  { id: 'o1', paymentId: 'payment-43', attachmentId: null, occurredOn: '2026-09-28', amount: '22133.07', paymentMethod: 'pix', referenceLabel: 'Compra principal', source: 'proof_backfill', notes: null, position: 0 },
  { id: 'o2', paymentId: 'payment-43', attachmentId: null, occurredOn: '2026-09-30', amount: '642.90', paymentMethod: 'pix', referenceLabel: 'Extintor', source: 'proof_backfill', notes: null, position: 1 },
  { id: 'o3', paymentId: 'payment-43', attachmentId: null, occurredOn: '2026-10-01', amount: '1972.98', paymentMethod: 'pix', referenceLabel: 'Cancelados', source: 'proof_backfill', notes: null, position: 2 },
];

const store: Store = {
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
};

function normalizeMoneyText(value: unknown): string {
  return String(value).replace(/\u00a0/g, ' ');
}

describe('payment occurrence Excel export', () => {
  it('inclui datas, valores, formas e diferença sem substituir o valor oficial', async () => {
    const [row] = decorateFinancePaymentsWithOccurrences([baseRow], occurrences);
    const bytes = await createFinanceUnifiedPaymentsWorkbook({
      rows: [row],
      summaryRows: [row],
      stores: [store],
      view: 'paid',
      generatedAt: new Date('2026-10-04T15:00:00-03:00'),
      filtersText: 'Sem filtros',
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);

    const payments = workbook.getWorksheet('Pagamentos');
    expect(payments?.getCell('K2').value).toBe(23600.39);
    expect(String(payments?.getCell('L2').value)).toContain('28/09/2026');
    expect(String(payments?.getCell('L2').value)).toContain('01/10/2026');
    expect(normalizeMoneyText(payments?.getCell('M2').value)).toContain('22.133,07');
    expect(String(payments?.getCell('M2').value)).toContain('PIX');
    expect(String(payments?.getCell('N2').value)).toContain('DIVERGENTE');
    expect(normalizeMoneyText(payments?.getCell('N2').value)).toContain('1.148,56');
    expect(payments?.getCell('N2').fill).toMatchObject({ fgColor: { argb: 'FFFFE8E6' } });

    const byStore = workbook.getWorksheet('Pagamentos por loja');
    expect(String(byStore?.getCell('M2').value)).toContain('28/09/2026');
    expect(String(byStore?.getCell('O2').value)).toContain('DIVERGENTE');
  });
});
