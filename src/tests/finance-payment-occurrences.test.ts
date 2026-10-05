import { describe, expect, it } from 'vitest';
import {
  decorateFinancePaymentsWithOccurrences,
  financePaymentHasOccurrenceDivergence,
  financePaymentMatchesDateRange,
  financePaymentOccurrenceDifference,
  financePaymentOccurrences,
  financePaymentOfficialAmount,
  scopeFinancePaymentToOccurrenceDateRange,
} from '../domain/finance-payment-occurrences';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { PurchasePaymentOccurrenceV2 } from '../domain/payment-occurrences';

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
  sourceLabel: '#2000015243421605 #2000015295828359 #2000018719455866',
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

const cmp43Occurrences: PurchasePaymentOccurrenceV2[] = [
  {
    id: 'occ-1',
    paymentId: 'payment-43',
    attachmentId: 'proof-1',
    occurredOn: '2026-09-30',
    amount: '642.90',
    paymentMethod: 'pix',
    referenceLabel: 'Extintor',
    source: 'proof_backfill',
    notes: null,
    position: 0,
  },
  {
    id: 'occ-2',
    paymentId: 'payment-43',
    attachmentId: 'proof-2',
    occurredOn: '2026-09-28',
    amount: '22133.07',
    paymentMethod: 'pix',
    referenceLabel: 'Mercado Livre',
    source: 'proof_backfill',
    notes: null,
    position: 1,
  },
  {
    id: 'occ-3',
    paymentId: 'payment-43',
    attachmentId: 'proof-3',
    occurredOn: '2026-10-01',
    amount: '1972.98',
    paymentMethod: 'pix',
    referenceLabel: 'Mercado Livre cancelados',
    source: 'proof_backfill',
    notes: null,
    position: 2,
  },
];

describe('finance payment occurrences', () => {
  it('mantém o valor oficial da CMP-00043 e sinaliza a diferença do detalhamento', () => {
    const [row] = decorateFinancePaymentsWithOccurrences([baseRow], cmp43Occurrences);

    expect(row.amountCents).toBe(2_360_039n);
    expect(row.officialAmountCents).toBe(2_360_039n);
    expect(row.occurrenceSumCents).toBe(2_474_895n);
    expect(financePaymentOccurrenceDifference(row)).toBe(114_856n);
    expect(row.paymentDates).toEqual(['2026-09-28', '2026-09-30', '2026-10-01']);
  });

  it('considera qualquer data detalhada no filtro por período', () => {
    const [row] = decorateFinancePaymentsWithOccurrences([baseRow], cmp43Occurrences);

    expect(financePaymentMatchesDateRange(row, '2026-09-28', '2026-09-28')).toBe(true);
    expect(financePaymentMatchesDateRange(row, '2026-09-30', '2026-09-30')).toBe(true);
    expect(financePaymentMatchesDateRange(row, '2026-10-01', '2026-10-01')).toBe(true);
    expect(financePaymentMatchesDateRange(row, '2026-10-02', '2026-10-02')).toBe(false);
  });

  it('quando solicitado, usa somente o valor das ocorrências dentro do período', () => {
    const [row] = decorateFinancePaymentsWithOccurrences([baseRow], cmp43Occurrences);
    const scoped = scopeFinancePaymentToOccurrenceDateRange(row, '2026-09-30', '2026-09-30');

    expect(scoped.amountCents).toBe(64_290n);
    expect(scoped.officialAmountCents).toBe(2_360_039n);
    expect(scoped.occurrenceDateScoped).toBe(true);
    expect(scoped.paymentDates).toEqual(['2026-09-30']);
    expect(scoped.paymentOccurrences).toHaveLength(1);
    expect(scoped.paymentOccurrences[0].referenceLabel).toBe('Extintor');
    expect(scoped.originAllocations.equipment).toBe(64_290n);
    expect(scoped.storeAllocations[0].amountCents).toBe(64_290n);
    expect(financePaymentOfficialAmount(scoped)).toBe(64_290n);
    expect(financePaymentOccurrenceDifference(scoped)).toBe(0n);
    expect(financePaymentHasOccurrenceDivergence(scoped)).toBe(false);
  });

  it('usa o pagamento cadastrado como fallback quando não há detalhamento estruturado', () => {
    const [row] = decorateFinancePaymentsWithOccurrences([baseRow], []);
    const occurrences = financePaymentOccurrences(row);

    expect(row.occurrenceDetailsSource).toBe('fallback');
    expect(row.paymentDates).toEqual(['2026-10-03']);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].amountCents).toBe(2_360_039n);
    expect(row.occurrenceDifferenceCents).toBe(0n);
  });
});
