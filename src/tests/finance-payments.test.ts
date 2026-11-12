import { describe, expect, it } from 'vitest';
import { assertPurchaseEventParity } from '../domain/finance-purchase-event-parity';
import type { FinancePurchaseEvent } from '../data/finance/finance-purchase-events-repository';
import {
  buildUnifiedFinancePayments,
  financePaymentOriginSummary,
  financePaymentTotals,
} from '../domain/finance-payments';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { WorkService } from '../domain/works-types';

function purchase(values: {
  id: string;
  code: string;
  total: string;
  paid: string;
  planned: string;
}): PurchaseV2 {
  const itemId = `${values.id}-item`;
  const orderId = `${values.id}-order`;
  return {
    id: values.id,
    code: values.code,
    quoteId: `${values.id}-quote`,
    quoteCode: 'COT-TESTE',
    supplierId: 'supplier-miranda',
    supplierName: 'Miranda',
    quoteDate: '2026-09-01',
    approvedTotal: values.total,
    hasPendingShipping: false,
    paymentMethodSnapshot: 'invoiced',
    entryAmountSnapshot: null,
    installmentCountSnapshot: null,
    paymentNotesSnapshot: null,
    status: 'purchased',
    notes: null,
    approvedAt: '2026-09-01T00:00:00Z',
    returnedAt: null,
    supplierChannelId: null,
    channelType: null,
    originCity: null,
    originState: null,
    contact: null,
    quoteContextSnapshotSource: null,
    stores: [
      {
        id: `${values.id}-store-link`,
        storeId: 'store-1',
        code: 'LOJ-001',
        name: 'ACARAU - CE',
        city: 'Acarau',
        state: 'CE',
        address: null,
        addressSnapshotSource: null,
      },
    ],
    items: [
      {
        id: itemId,
        purchaseId: values.id,
        sourceQuoteItemId: null,
        supplyItemId: `${values.id}-supply`,
        itemCode: 'ITM-TESTE',
        itemName: 'Computador',
        itemDescription: null,
        itemCategory: 'Equipamentos',
        catalogSubcategory: null,
        catalogGroupName: null,
        catalogFinancialGroup: 'equipment',
        itemArea: null,
        brandReference: null,
        technicalSpecification: null,
        offeredBrandModel: null,
        productUrl: null,
        storeId: null,
        storeCode: null,
        quantityApproved: '1',
        purchasedQuantity: '1',
        unit: 'un',
        quotedUnitPrice: values.total,
        quotedDiscountAmount: '0',
        quotedShippingType: 'free',
        quotedShippingAmount: null,
        quotedOtherCosts: '0',
        quotedDeliveryDays: null,
        approvedLineTotal: values.total,
        actualTotal: values.total,
        itemContextSnapshotSource: null,
        quoteItemNotes: null,
        destinations: [],
      },
    ],
    orders: [
      {
        id: orderId,
        purchaseId: values.id,
        purchasedOn: '2026-09-11',
        supplierOrderRef: null,
        expectedDeliveryDate: null,
        status: 'active',
        source: 'manual',
        notes: null,
        createdBy: null,
        createdByName: null,
        createdAt: '2026-09-11T00:00:00Z',
        cancelledBy: null,
        cancelledByName: null,
        cancelledAt: null,
        cancellationReason: null,
        lines: [
          {
            id: `${orderId}-line`,
            orderId,
            purchaseItemId: itemId,
            purchaseDestinationId: null,
            itemCode: 'ITM-TESTE',
            itemName: 'Computador',
            destinationLabel: null,
            destinationState: null,
            quantity: '1',
            unit: 'un',
            unitPrice: values.total,
            discountAmount: '0',
            shippingType: 'free',
            actualShippingType: 'free',
            shippingAmount: null,
            otherCosts: '0',
            lineTotal: values.total,
            expectedDeliveryDate: null,
            notes: null,
            storeDistributionStatus: 'confirmed',
            stores: [
              {
                id: `${orderId}-store`,
                orderLineId: `${orderId}-line`,
                purchaseDestinationStoreId: null,
                storeId: 'store-1',
                code: 'LOJ-001',
                name: 'ACARAU - CE',
                city: 'Acarau',
                state: 'CE',
                quantity: '1',
                allocationSource: 'direct',
              },
            ],
          },
        ],
      },
    ],
    payments: [
      {
        id: `${values.id}-paid`,
        purchaseId: values.id,
        purchaseOrderId: orderId,
        paymentMethod: 'invoiced',
        sourceLabel: 'Entrada Miranda',
        amount: values.paid,
        entryAmount: '0',
        installmentCount: null,
        firstDueDate: null,
        status: 'paid',
        paidAt: '2026-09-11T12:00:00Z',
        notes:
          'Rateio interno da entrada da compra única Miranda de R$ 145.264,00. Entrada total paga: R$ 43.579,20.',
        createdAt: '2026-09-11T12:00:00Z',
      },
      {
        id: `${values.id}-planned`,
        purchaseId: values.id,
        purchaseOrderId: orderId,
        paymentMethod: 'boleto',
        sourceLabel: 'Boleto Miranda 1/5',
        amount: values.planned,
        entryAmount: '0',
        installmentCount: null,
        firstDueDate: '2026-10-10',
        status: 'planned',
        paidAt: null,
        notes: 'Parcela 1/5. Parcela combinada Miranda no vencimento: R$ 20.336,96.',
        createdAt: '2026-09-21T12:00:00Z',
      },
    ],
    attachments: [],
    quoteAttachments: [],
  };
}

const work: WorkService = {
  id: 'work-1',
  code: 'OBR-00001',
  storeId: 'store-1',
  storeCode: 'LOJ-001',
  storeName: 'ACARAU - CE',
  storeCity: 'Acarau',
  storeState: 'CE',
  category: 'Elétrica',
  description: 'Serviço elétrico',
  providerName: 'Prestador',
  providerTaxId: null,
  providerPhone: null,
  budgetAmount: '30000.00',
  contractedAmount: '30000.00',
  status: 'contracted',
  progressPercent: 50,
  plannedStartDate: null,
  plannedEndDate: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  payments: [
    {
      id: 'work-paid',
      serviceId: 'work-1',
      storeId: 'store-1',
      label: 'Entrada',
      paymentMethod: 'bank_transfer',
      sourceLabel: 'CONTA BB',
      dueDate: '2026-09-10',
      amount: '10000.00',
      status: 'paid',
      paidAt: '2026-09-10T12:00:00Z',
      notes: null,
      createdAt: '2026-09-10T12:00:00Z',
      updatedAt: '2026-09-10T12:00:00Z',
    },
    {
      id: 'work-planned',
      serviceId: 'work-1',
      storeId: 'store-1',
      label: 'Parcela 2',
      paymentMethod: 'bank_transfer',
      sourceLabel: 'CONTA BB',
      dueDate: '2026-10-10',
      amount: '5000.00',
      status: 'planned',
      paidAt: null,
      notes: null,
      createdAt: '2026-09-10T12:00:00Z',
      updatedAt: '2026-09-10T12:00:00Z',
    },
  ],
  documents: [],
  components: [],
};

describe('unified finance payments', () => {
  it('consolida a operacao Miranda e separa o saldo de obra sem programacao', () => {
    const rows = buildUnifiedFinancePayments(
      [
        purchase({
          id: 'cmp2',
          code: 'CMP-00002',
          total: '46052.16',
          paid: '31399.20',
          planned: '14652.96',
        }),
        purchase({
          id: 'cmp3',
          code: 'CMP-00003',
          total: '17864.00',
          paid: '12180.00',
          planned: '5684.00',
        }),
      ],
      [work],
    );

    const mirandaPaid = rows.filter(
      (row) => row.status === 'paid' && row.supplierName === 'Miranda',
    );
    const mirandaPlanned = rows.filter(
      (row) => row.status === 'planned' && row.supplierName === 'Miranda',
    );
    const workUnscheduled = rows.find((row) => row.status === 'unscheduled');

    expect(mirandaPaid).toHaveLength(1);
    expect(mirandaPaid[0].amountCents).toBe(4357920n);
    expect(mirandaPaid[0].referenceCodes).toEqual(['CMP-00002', 'CMP-00003']);

    expect(mirandaPlanned).toHaveLength(1);
    expect(mirandaPlanned[0].amountCents).toBe(2033696n);
    expect(mirandaPlanned[0].date).toBe('2026-10-10');

    expect(workUnscheduled?.referenceCodes).toEqual(['OBR-00001']);
    expect(workUnscheduled?.amountCents).toBe(1500000n);

    expect(financePaymentTotals(rows)).toEqual({
      paidCents: 5357920n,
      plannedCents: 2533696n,
      unscheduledCents: 1500000n,
      commitmentCents: 9391616n,
    });
  });

  it('resume valores nas três origens financeiras', () => {
    const rows = buildUnifiedFinancePayments(
      [
        purchase({
          id: 'cmp2',
          code: 'CMP-00002',
          total: '46052.16',
          paid: '31399.20',
          planned: '14652.96',
        }),
        purchase({
          id: 'cmp3',
          code: 'CMP-00003',
          total: '17864.00',
          paid: '12180.00',
          planned: '5684.00',
        }),
      ],
      [work],
    );

    const summary = financePaymentOriginSummary(rows);
    const equipment = summary.find((row) => row.origin === 'equipment');
    const works = summary.find((row) => row.origin === 'works');

    expect(equipment).toMatchObject({
      paidCents: 4357920n,
      plannedCents: 2033696n,
      unscheduledCents: 0n,
    });
    expect(works).toMatchObject({
      paidCents: 1000000n,
      plannedCents: 500000n,
      unscheduledCents: 1500000n,
    });
  });
});


describe('paridade dos eventos de Compras entre SQL e cálculo legado', () => {
  it('reconcilia parcela em janeiro 31, entrada, arredondamento e pagamento quitado', () => {
    const pilot = purchase({
      id: 'cmp-pilot', code: 'CMP-PILOTO', total: '100.01',
      paid: '12.34', planned: '100.01',
    });
    const paid = pilot.payments[0];
    const planned = pilot.payments[1];
    paid.paidAt = '2027-01-07T12:00:00Z';
    planned.entryAmount = '10.00';
    planned.installmentCount = 3;
    planned.createdAt = '2027-01-05T12:00:00Z';
    planned.firstDueDate = '2027-01-31';
    planned.sourceLabel = 'Plano piloto';

    const common = {
      purchaseId: pilot.id, orderId: pilot.orders[0].id,
      referenceCode: pilot.code, counterpart: 'Miranda',
    };
    const expectedRows: FinancePurchaseEvent[] = [
      {
        ...common, id: 'purchase:cmp-pilot-paid:paid', paymentId: paid.id,
        status: 'paid', date: '2027-01-07', amountCents: 1234n,
        paymentMethod: 'invoiced', sourceLabel: 'Entrada Miranda',
        installmentLabel: 'Pagamento realizado',
      },
      {
        ...common, id: 'purchase:cmp-pilot-planned:entry', paymentId: planned.id,
        status: 'planned', date: '2027-01-05', amountCents: 1000n,
        paymentMethod: 'boleto', sourceLabel: 'Plano piloto',
        installmentLabel: 'Entrada prevista',
      },
      ...([
        ['2027-01-31', 3001n],
        ['2027-02-28', 3000n],
        ['2027-03-31', 3000n],
      ] as const).map(([date, amountCents], index): FinancePurchaseEvent => ({
        ...common, id: 'purchase:cmp-pilot-planned:installment:' + (index + 1),
        paymentId: planned.id, status: 'planned',
        date, amountCents,
        paymentMethod: 'boleto', sourceLabel: 'Plano piloto',
        installmentLabel: 'Parcela ' + (index + 1) + '/3',
      })),
    ];
    const summary = {
      isComplete: true, totalCount: 5, paidCents: 1234n, plannedCents: 10001n,
    };
    expect(() => assertPurchaseEventParity([pilot], summary, expectedRows)).not.toThrow();
    expect(() => assertPurchaseEventParity(
      [pilot], summary,
      expectedRows.map((row) => row.id.endsWith(':entry')
        ? { ...row, amountCents: row.amountCents + 1n } : row),
    )).toThrow('Divergência de paridade no evento financeiro');
    expect(() => assertPurchaseEventParity(
      [pilot], summary, expectedRows.slice(0, 3),
    )).toThrow('nem todas as páginas');
  });

  it('mantém pagamento quitado de valor zero e omite pagamentos cancelados', () => {
    const pilot = purchase({
      id: 'cmp-zero', code: 'CMP-ZERO', total: '0.00',
      paid: '0.00', planned: '10.00',
    });
    pilot.payments[1].status = 'cancelled';
    const zeroPaid: FinancePurchaseEvent = {
      id: 'purchase:cmp-zero-paid:paid',
      paymentId: pilot.payments[0].id,
      purchaseId: pilot.id, orderId: pilot.orders[0].id,
      referenceCode: pilot.code, counterpart: 'Miranda',
      status: 'paid', date: '2026-09-11', amountCents: 0n,
      paymentMethod: 'invoiced', sourceLabel: 'Entrada Miranda',
      installmentLabel: 'Pagamento realizado',
    };
    expect(() => assertPurchaseEventParity(
      [pilot],
      { isComplete: true, totalCount: 1, paidCents: 0n, plannedCents: 0n },
      [zeroPaid],
    )).not.toThrow();
    expect(() => assertPurchaseEventParity(
      [pilot],
      { isComplete: false, totalCount: 1, paidCents: 0n, plannedCents: 0n },
      [zeroPaid],
    )).toThrow('incompleta');
  });
});
