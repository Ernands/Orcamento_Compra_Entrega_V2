import { describe, expect, it } from 'vitest';
import {
  buildFinanceOverviewRows,
  buildFinanceStoreItemRows,
  purchaseApprovedBudgetByStore,
} from '../domain/finance-overview';
import type { FinanceStoreRow } from '../domain/finance-types';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { FinanceStoreBudget, WorkService } from '../domain/works-types';

function approvedPurchase(): PurchaseV2 {
  return {
    id: 'purchase-1',
    code: 'CMP-00001',
    status: 'purchased',
    stores: [
      { storeId: 'store-1', code: 'L1', name: 'Loja 1', city: 'Natal', state: 'RN' },
      { storeId: 'store-2', code: 'L2', name: 'Loja 2', city: 'Natal', state: 'RN' },
    ],
    items: [
      {
        id: 'item-1',
        purchaseId: 'purchase-1',
        sourceQuoteItemId: 'quote-item-1',
        supplyItemId: 'supply-item-1',
        itemCode: 'ITM-001',
        itemName: 'Notebook',
        itemDescription: null,
        itemCategory: 'Equipamentos',
        itemArea: null,
        brandReference: null,
        technicalSpecification: null,
        offeredBrandModel: null,
        productUrl: null,
        storeId: null,
        storeCode: null,
        quantityApproved: '2',
        purchasedQuantity: '0',
        unit: 'un',
        quotedUnitPrice: '50.005',
        quotedDiscountAmount: '0',
        quotedShippingType: 'free',
        quotedShippingAmount: '0',
        quotedOtherCosts: '0',
        quotedDeliveryDays: null,
        approvedLineTotal: '100.01',
        actualTotal: '0',
        itemContextSnapshotSource: 'approval',
        quoteItemNotes: null,
        destinations: [
          {
            id: 'dest-1',
            purchaseItemId: 'item-1',
            sourceQuoteDestinationId: 'quote-dest-1',
            destinationType: 'profile',
            profileId: 'profile-1',
            storeId: null,
            label: 'RN',
            state: 'RN',
            destinationCount: 2,
            quantity: '2',
            unit: 'un',
            quotedShippingType: 'free',
            quotedShippingAmount: '0',
            quotedDeliveryDays: null,
            notes: null,
            position: 0,
            distributionStatus: 'confirmed',
            snapshotSource: 'approval',
            stores: [
              {
                id: 'ds-1',
                purchaseDestinationId: 'dest-1',
                storeId: 'store-1',
                code: 'L1',
                name: 'Loja 1',
                city: 'Natal',
                state: 'RN',
                allocatedQuantity: '1',
                allocationSource: 'snapshot',
              },
              {
                id: 'ds-2',
                purchaseDestinationId: 'dest-1',
                storeId: 'store-2',
                code: 'L2',
                name: 'Loja 2',
                city: 'Natal',
                state: 'RN',
                allocatedQuantity: '1',
                allocationSource: 'snapshot',
              },
            ],
          },
        ],
      },
    ],
    orders: [],
    payments: [],
    attachments: [],
    quoteAttachments: [],
    quoteId: 'quote-1',
    quoteCode: 'COT-00001',
    supplierId: 'supplier-1',
    supplierName: 'Fornecedor A',
    quoteDate: '2026-09-01',
    approvedTotal: '100.01',
    hasPendingShipping: false,
    paymentMethodSnapshot: null,
    entryAmountSnapshot: null,
    installmentCountSnapshot: null,
    paymentNotesSnapshot: null,
    notes: null,
    approvedAt: '2026-09-02T12:00:00Z',
    returnedAt: null,
    supplierChannelId: null,
    channelType: 'ecommerce',
    originCity: null,
    originState: null,
    contact: null,
    quoteContextSnapshotSource: 'approval',
  } as unknown as PurchaseV2;
}

function work(): WorkService {
  return {
    id: 'work-1',
    code: 'OBR-00001',
    storeId: 'store-1',
    storeCode: 'L1',
    storeName: 'Loja 1',
    storeCity: 'Natal',
    storeState: 'RN',
    category: 'Elétrica',
    description: 'Adequação elétrica',
    providerName: 'Fornecedor',
    providerTaxId: null,
    providerPhone: null,
    budgetAmount: '6500.00',
    contractedAmount: '6200.00',
    status: 'in_progress',
    progressPercent: 50,
    plannedStartDate: null,
    plannedEndDate: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    payments: [
      {
        id: 'payment-1',
        serviceId: 'work-1',
        storeId: 'store-1',
        label: 'Entrada',
        paymentMethod: 'pix',
        sourceLabel: null,
        dueDate: '2026-09-10',
        amount: '3100.00',
        status: 'paid',
        paidAt: '2026-09-10T12:00:00Z',
        notes: null,
        createdAt: '2026-09-10T12:00:00Z',
        updatedAt: '2026-09-10T12:00:00Z',
      },
      {
        id: 'payment-2',
        serviceId: 'work-1',
        storeId: 'store-1',
        label: 'Saldo',
        paymentMethod: 'bank_transfer',
        sourceLabel: null,
        dueDate: '2026-09-30',
        amount: '3100.00',
        status: 'planned',
        paidAt: null,
        notes: null,
        createdAt: '2026-09-10T12:00:00Z',
        updatedAt: '2026-09-10T12:00:00Z',
      },
    ],
    documents: [
      {
        id: 'doc-1',
        serviceId: 'work-1',
        storeId: 'store-1',
        paymentId: 'payment-1',
        documentType: 'invoice',
        documentNumber: 'NF-1',
        documentDate: '2026-09-10',
        documentAmount: '3000.00',
        originalName: null,
        storagePath: null,
        mimeType: null,
        sizeBytes: null,
        status: 'verified',
        notes: null,
        createdAt: '2026-09-10T12:00:00Z',
      },
      {
        id: 'doc-2',
        serviceId: 'work-1',
        storeId: 'store-1',
        paymentId: 'payment-2',
        documentType: 'receipt',
        documentNumber: 'REC-2',
        documentDate: '2026-09-30',
        documentAmount: '3200.00',
        originalName: null,
        storagePath: null,
        mimeType: null,
        sizeBytes: null,
        status: 'pending',
        notes: null,
        createdAt: '2026-09-30T12:00:00Z',
      },
    ],
  };
}

describe('finance overview', () => {
  it('distribui o orçamento aprovado dos itens por loja conservando os centavos', () => {
    const result = purchaseApprovedBudgetByStore([approvedPurchase()]);
    expect(result.get('store-1')).toBe(5001n);
    expect(result.get('store-2')).toBe(5000n);
    expect([...result.values()].reduce((sum, value) => sum + value, 0n)).toBe(10001n);
  });

  it('mostra o orçamento aprovado antes de existir compra física', () => {
    const rows = buildFinanceStoreItemRows([approvedPurchase()], 'store-1');

    expect(rows).toHaveLength(1);
    expect(rows[0].purchaseCode).toBe('CMP-00001');
    expect(rows[0].quoteCode).toBe('COT-00001');
    expect(rows[0].approvedQuantity).toBe(1000n);
    expect(rows[0].budgetCents).toBe(5001n);
    expect(rows[0].purchasedQuantity).toBe(0n);
    expect(rows[0].realizedCents).toBe(0n);
    expect(rows[0].purchaseStatus).toBe('not_purchased');
  });

  it('consolida itens, obra, pagamentos, verba e documentação por loja', () => {
    const stores = [
      {
        id: 'store-1',
        code: 'L1',
        name: 'Loja 1',
        city: 'Natal',
        state: 'RN',
      },
    ] as Store[];

    const purchaseStoreRows = [
      {
        storeId: 'store-1',
        code: 'L1',
        name: 'Loja 1',
        city: 'Natal',
        state: 'RN',
        realizedCents: 9000n,
        paidCents: 4000n,
        plannedCents: 5000n,
        requestedCents: 0n,
        approvedCents: 0n,
        receivedCents: 0n,
        eligibleCents: 4000n,
        availableCents: 4000n,
        purchases: [],
      },
    ] as FinanceStoreRow[];

    const budgets: FinanceStoreBudget[] = [
      {
        storeId: 'store-1',
        budgetAmount: '50000.00',
        notes: null,
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const row = buildFinanceOverviewRows({
      stores,
      purchases: [approvedPurchase()],
      purchaseStoreRows,
      works: [work()],
      budgets,
    }).find((entry) => entry.storeId === 'store-1');

    expect(row).toBeDefined();
    expect(row?.budgetBbCents).toBe(5000000n);
    expect(row?.itemsBudgetCents).toBe(5001n);
    expect(row?.worksBudgetCents).toBe(650000n);
    expect(row?.budgetTotalCents).toBe(655001n);
    expect(row?.itemsRealizedCents).toBe(9000n);
    expect(row?.worksContractedCents).toBe(620000n);
    expect(row?.realizedTotalCents).toBe(629000n);
    expect(row?.differenceCents).toBe(26001n);
    expect(row?.paidCents).toBe(314000n);
    expect(row?.payableCents).toBe(315000n);
    expect(row?.worksDocumentedCents).toBe(620000n);
    expect(row?.worksMissingDocumentsCents).toBe(0n);
    expect(row?.documentationStatus).toBe('complete');
  });
});
