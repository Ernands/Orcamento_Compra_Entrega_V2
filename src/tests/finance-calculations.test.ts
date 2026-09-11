import { describe, expect, it } from 'vitest';
import {
  addCalendarMonths,
  buildFinancePaymentEvents,
  buildFinanceStoreRows,
  reimbursementTotals,
} from '../domain/finance-calculations';
import type { FinanceReimbursement } from '../domain/finance-types';
import type { PurchaseV2 } from '../domain/purchase-v2-types';

function purchase(): PurchaseV2 {
  return {
    id: 'purchase-1',
    code: 'CMP-00001',
    quoteId: 'quote-1',
    quoteCode: 'COT-00001',
    supplierId: 'supplier-1',
    supplierName: 'Fornecedor Teste',
    quoteDate: '2026-01-01',
    approvedTotal: '401.00',
    hasPendingShipping: false,
    paymentMethodSnapshot: null,
    entryAmountSnapshot: null,
    installmentCountSnapshot: null,
    paymentNotesSnapshot: null,
    status: 'purchased',
    notes: null,
    approvedAt: '2026-01-01T12:00:00Z',
    returnedAt: null,
    supplierChannelId: null,
    channelType: 'ecommerce',
    originCity: null,
    originState: null,
    contact: null,
    quoteContextSnapshotSource: 'approval',
    stores: [
      {
        id: 'ps-1',
        storeId: 'store-1',
        code: 'L1',
        name: 'Loja 1',
        city: 'Fortaleza',
        state: 'CE',
        address: null,
        addressSnapshotSource: null,
      },
      {
        id: 'ps-2',
        storeId: 'store-2',
        code: 'L2',
        name: 'Loja 2',
        city: 'Natal',
        state: 'RN',
        address: null,
        addressSnapshotSource: null,
      },
    ],
    items: [],
    orders: [
      {
        id: 'order-1',
        purchaseId: 'purchase-1',
        purchasedOn: '2026-01-05',
        supplierOrderRef: 'PED-1',
        expectedDeliveryDate: null,
        status: 'active',
        source: 'manual',
        notes: null,
        createdBy: null,
        createdByName: 'Administrador',
        createdAt: '2026-01-05T12:00:00Z',
        cancelledBy: null,
        cancelledByName: null,
        cancelledAt: null,
        cancellationReason: null,
        lines: [
          {
            id: 'line-1',
            orderId: 'order-1',
            purchaseItemId: null,
            purchaseDestinationId: null,
            itemCode: 'ITM-1',
            itemName: 'Purificador',
            destinationLabel: null,
            destinationState: null,
            quantity: '4',
            unit: 'un',
            unitPrice: '100.25',
            discountAmount: '0',
            shippingType: 'free',
            actualShippingType: 'free',
            shippingAmount: '0',
            otherCosts: '0',
            lineTotal: '401.00',
            expectedDeliveryDate: null,
            notes: null,
            storeDistributionStatus: 'confirmed',
            stores: [
              {
                id: 'ls-1',
                orderLineId: 'line-1',
                purchaseDestinationStoreId: null,
                storeId: 'store-1',
                code: 'L1',
                name: 'Loja 1',
                city: 'Fortaleza',
                state: 'CE',
                quantity: '1',
                allocationSource: 'manual',
              },
              {
                id: 'ls-2',
                orderLineId: 'line-1',
                purchaseDestinationStoreId: null,
                storeId: 'store-2',
                code: 'L2',
                name: 'Loja 2',
                city: 'Natal',
                state: 'RN',
                quantity: '3',
                allocationSource: 'manual',
              },
            ],
          },
        ],
      },
    ],
    payments: [],
    attachments: [],
    quoteAttachments: [],
  };
}

function reimbursement(): FinanceReimbursement {
  return {
    id: 'reimbursement-1',
    code: 'RMB-00001',
    storeId: 'store-1',
    storeCode: 'L1',
    storeName: 'Loja 1',
    storeCity: 'Fortaleza',
    storeState: 'CE',
    status: 'requested',
    protocol: null,
    notes: null,
    requestedAt: '2026-01-10T12:00:00Z',
    decidedAt: null,
    receivedAt: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    items: [
      {
        id: 'ri-1',
        reimbursementId: 'reimbursement-1',
        storeId: 'store-1',
        purchaseId: 'purchase-1',
        purchaseOrderId: 'order-1',
        purchaseCode: 'CMP-00001',
        supplierName: 'Fornecedor Teste',
        eligibleAmount: '100.25',
        requestedAmount: '50.00',
        approvedAmount: '0',
        receivedAmount: '0',
        notes: null,
        createdAt: '2026-01-10T12:00:00Z',
      },
    ],
  };
}

describe('finance-calculations', () => {
  it('preserva o dia quando possivel e limita ao ultimo dia do mes', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('distribui entrada e parcelas futuras por competencia sem perder centavos', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-1',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'credit_card',
        sourceLabel: 'Corporativo',
        amount: '100.01',
        entryAmount: '10.01',
        installmentCount: 3,
        firstDueDate: '2026-01-31',
        status: 'planned',
        paidAt: null,
        notes: null,
        createdAt: '2026-01-02T12:00:00Z',
      },
    ];

    const events = buildFinancePaymentEvents([current]);
    expect(
      events.map((event) => ({
        date: event.date,
        amount: event.amountCents,
        label: event.installmentLabel,
      })),
    ).toEqual([
      { date: '2026-01-02', amount: 1001n, label: 'Entrada prevista' },
      { date: '2026-01-31', amount: 3000n, label: 'Parcela 1/3' },
      { date: '2026-02-28', amount: 3000n, label: 'Parcela 2/3' },
      { date: '2026-03-31', amount: 3000n, label: 'Parcela 3/3' },
    ]);
    expect(events.reduce((sum, event) => sum + event.amountCents, 0n)).toBe(10001n);
  });

  it('nao atribui pagamento geral as lojas da compra quando nao ha pedido vinculado', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-unlinked',
        purchaseId: current.id,
        purchaseOrderId: null,
        paymentMethod: 'pix',
        sourceLabel: null,
        amount: '50.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-02-10T15:00:00Z',
        notes: null,
        createdAt: '2026-02-10T15:00:00Z',
      },
    ];

    expect(buildFinancePaymentEvents([current])).toMatchObject([
      {
        allocationStatus: 'unlinked',
        storeIds: [],
        states: [],
      },
    ]);
  });

  it('marca como pendente o pagamento vinculado a pedido sem distribuicao confirmada', () => {
    const current = purchase();
    current.orders[0].lines[0].storeDistributionStatus = 'pending';
    current.orders[0].lines[0].stores = [];
    current.payments = [
      {
        id: 'payment-pending',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'pix',
        sourceLabel: null,
        amount: '50.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-02-10T15:00:00Z',
        notes: null,
        createdAt: '2026-02-10T15:00:00Z',
      },
    ];

    expect(buildFinancePaymentEvents([current])).toMatchObject([
      {
        allocationStatus: 'pending_distribution',
        storeIds: [],
        states: [],
      },
    ]);
  });

  it('mantem lojas e UFs apenas quando a distribuicao do pedido esta confirmada', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-assigned',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'pix',
        sourceLabel: null,
        amount: '401.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-02-10T15:00:00Z',
        notes: null,
        createdAt: '2026-02-10T15:00:00Z',
      },
    ];

    expect(buildFinancePaymentEvents([current])).toMatchObject([
      {
        allocationStatus: 'assigned',
        storeIds: ['store-1', 'store-2'],
        states: ['CE', 'RN'],
      },
    ]);
  });

  it('usa a data efetiva e um unico lancamento para pagamento realizado', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-1',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'credit_card',
        sourceLabel: null,
        amount: '401.00',
        entryAmount: '0',
        installmentCount: 3,
        firstDueDate: '2026-01-31',
        status: 'paid',
        paidAt: '2026-02-10T15:00:00Z',
        notes: null,
        createdAt: '2026-01-02T12:00:00Z',
      },
    ];
    expect(buildFinancePaymentEvents([current])).toMatchObject([
      { status: 'paid', date: '2026-02-10', month: '2026-02', amountCents: 40100n },
    ]);
  });

  it('reaproveita o rateio exato da compra para custo, pagamento e saldo reembolsavel por loja', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-1',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'pix',
        sourceLabel: null,
        amount: '401.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-01-06T12:00:00Z',
        notes: null,
        createdAt: '2026-01-06T12:00:00Z',
      },
    ];

    const rows = buildFinanceStoreRows([current], [reimbursement()]);
    expect(
      rows.map((row) => ({
        code: row.code,
        cost: row.realizedCents,
        paid: row.paidCents,
        available: row.availableCents,
      })),
    ).toEqual([
      { code: 'L1', cost: 10025n, paid: 10025n, available: 5025n },
      { code: 'L2', cost: 30075n, paid: 30075n, available: 30075n },
    ]);
  });

  it('reserva somente o valor aprovado quando o reembolso e parcial', () => {
    const current = purchase();
    current.payments = [
      {
        id: 'payment-1',
        purchaseId: current.id,
        purchaseOrderId: 'order-1',
        paymentMethod: 'pix',
        sourceLabel: null,
        amount: '401.00',
        entryAmount: null,
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-01-06T12:00:00Z',
        notes: null,
        createdAt: '2026-01-06T12:00:00Z',
      },
    ];
    const partial = reimbursement();
    partial.status = 'partial';
    partial.items[0].approvedAmount = '30.00';

    const store = buildFinanceStoreRows([current], [partial]).find(
      (row) => row.storeId === 'store-1',
    );
    expect(store).toMatchObject({
      eligibleCents: 10025n,
      requestedCents: 5000n,
      approvedCents: 3000n,
      availableCents: 7025n,
    });
  });

  it('soma os valores do reembolso sem arredondamento flutuante', () => {
    expect(reimbursementTotals(reimbursement())).toEqual({
      eligibleCents: 10025n,
      requestedCents: 5000n,
      approvedCents: 0n,
      receivedCents: 0n,
    });
  });
});
