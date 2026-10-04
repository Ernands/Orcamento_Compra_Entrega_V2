import { describe, expect, it } from 'vitest';
import {
  buildUnifiedFinancePayments,
  scopeFinancePaymentsByStores,
} from '../domain/finance-payments';
import type { PurchaseV2 } from '../domain/purchase-v2-types';

function purchase(distributionStatus: 'confirmed' | 'pending' = 'confirmed'): PurchaseV2 {
  return {
    id: 'purchase-1',
    code: 'CMP-00001',
    quoteCode: 'COT-00001',
    supplierName: 'Fornecedor Teste',
    status: 'purchased',
    stores: [
      { storeId: 'store-1', code: 'LOJ-001', name: 'Loja 1', city: 'Cidade 1', state: 'CE' },
      { storeId: 'store-2', code: 'LOJ-002', name: 'Loja 2', city: 'Cidade 2', state: 'RN' },
    ],
    items: [
      {
        id: 'item-1',
        supplyItemId: 'supply-1',
        itemName: 'Monitor',
        itemCategory: 'Monitor',
        catalogSubcategory: null,
        catalogGroupName: null,
        catalogFinancialGroup: 'equipment',
      },
    ],
    orders: [
      {
        id: 'order-1',
        status: 'active',
        lines: [
          {
            id: 'line-1',
            purchaseItemId: 'item-1',
            itemName: 'Monitor',
            quantity: '3',
            unitPrice: '100.00',
            discountAmount: '0',
            shippingAmount: '0',
            otherCosts: '0',
            lineTotal: '300.00',
            storeDistributionStatus: distributionStatus,
            stores: [
              {
                storeId: 'store-1',
                code: 'LOJ-001',
                name: 'Loja 1',
                city: 'Cidade 1',
                state: 'CE',
                quantity: '1',
              },
              {
                storeId: 'store-2',
                code: 'LOJ-002',
                name: 'Loja 2',
                city: 'Cidade 2',
                state: 'RN',
                quantity: '2',
              },
            ],
          },
        ],
      },
    ],
    payments: [
      {
        id: 'payment-1',
        purchaseOrderId: 'order-1',
        paymentMethod: 'pix',
        sourceLabel: 'Pagamento teste',
        amount: '150.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-10-01',
        notes: null,
        createdAt: '2026-10-01T12:00:00Z',
      },
    ],
    attachments: [],
  } as unknown as PurchaseV2;
}

describe('finance payments store allocation', () => {
  it('uses the real store cost when filtering a payment', () => {
    const rows = buildUnifiedFinancePayments([purchase()], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(15000n);
    expect(rows[0].unallocatedCents).toBe(0n);
    expect(rows[0].storeAllocations).toEqual([
      expect.objectContaining({ storeId: 'store-1', amountCents: 5000n }),
      expect.objectContaining({ storeId: 'store-2', amountCents: 10000n }),
    ]);

    const storeOne = scopeFinancePaymentsByStores(rows, ['store-1']);
    expect(storeOne).toHaveLength(1);
    expect(storeOne[0].amountCents).toBe(5000n);
    expect(storeOne[0].storeIds).toEqual(['store-1']);
    expect(storeOne[0].originAllocations.equipment).toBe(5000n);

    const storeTwo = scopeFinancePaymentsByStores(rows, ['store-2']);
    expect(storeTwo).toHaveLength(1);
    expect(storeTwo[0].amountCents).toBe(10000n);
    expect(storeTwo[0].originAllocations.equipment).toBe(10000n);
  });

  it('does not invent a store value while distribution is pending', () => {
    const rows = buildUnifiedFinancePayments([purchase('pending')], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(15000n);
    expect(rows[0].storeAllocations).toHaveLength(0);
    expect(rows[0].unallocatedCents).toBe(15000n);
    expect(scopeFinancePaymentsByStores(rows, ['store-1'])).toHaveLength(0);
  });
});
