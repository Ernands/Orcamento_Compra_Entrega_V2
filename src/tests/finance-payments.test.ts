import { describe, expect, it } from 'vitest';
import { assertPurchaseEventParity } from '../domain/finance-purchase-event-parity';
import { assertPurchaseAdjustmentParity } from '../domain/finance-purchase-adjustment-parity';
import type { FinancePurchaseAdjustmentSnapshot } from '../data/finance/finance-purchase-adjustment-repository';
import { auditUnifiedFinanceProjection } from '../domain/finance-projection-audit';
import { applyPurchasePartialAdjustments, type PartialAdjustmentRecord } from '../domain/purchase-partial-adjustments';
import { decorateFinancePaymentsWithOccurrences } from '../domain/finance-payment-occurrences';
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

describe('distribuição de 11 centavos em 12 parcelas', () => {
  it('replica o desempate lexicográfico usado no domínio, inclusive parcela zerada', () => {
    const pilot = purchase({
      id: 'cmp-centavos', code: 'CMP-CENTAVOS', total: '0.11',
      paid: '0.00', planned: '0.11',
    });
    pilot.payments[0].status = 'cancelled';
    pilot.payments[1].entryAmount = '0';
    pilot.payments[1].installmentCount = 12;
    pilot.payments[1].firstDueDate = '2027-01-31';
    pilot.payments[1].sourceLabel = 'Teste de 12 parcelas';

    const dates = [
      '2027-01-31', '2027-02-28', '2027-03-31',
      '2027-04-30', '2027-05-31', '2027-06-30',
      '2027-07-31', '2027-08-31', '2027-09-30',
      '2027-10-31', '2027-11-30', '2027-12-31',
    ];
    // JS allocateCents desempata índices como strings ("10" antes de "2");
    // por isso a décima parcela é zero, e não a última parcela.
    const rows: FinancePurchaseEvent[] = dates.flatMap((date, index) =>
      index === 9 ? [] : [{
        id: 'purchase:cmp-centavos-planned:installment:' + (index + 1),
        paymentId: pilot.payments[1].id,
        purchaseId: pilot.id, orderId: pilot.orders[0].id,
        referenceCode: pilot.code, counterpart: 'Miranda',
        status: 'planned' as const, date, amountCents: 1n,
        paymentMethod: 'boleto', sourceLabel: 'Teste de 12 parcelas',
        installmentLabel: 'Parcela ' + (index + 1) + '/12',
      }],
    );
    expect(rows).toHaveLength(11);
    expect(() => assertPurchaseEventParity(
      [pilot],
      { isComplete: true, totalCount: 11, paidCents: 0n, plannedCents: 11n },
      rows,
    )).not.toThrow();
  });
});


describe('auditoria conservativa das quatro etapas financeiras', () => {
  it('compara e reconcilia duas CMPs com pagamento e parcela combinados', () => {
    const purchases = [
      purchase({ id: 'cmp2', code: 'CMP-00002', total: '46052.16', paid: '31399.20', planned: '14652.96' }),
      purchase({ id: 'cmp3', code: 'CMP-00003', total: '17864.00', paid: '12180.00', planned: '5684.00' }),
    ];
    const rows = buildUnifiedFinancePayments(purchases, [work]);
    const report = auditUnifiedFinanceProjection(purchases, [work], rows, '2026-11-12T00:00:00Z');
    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.issues)).toEqual([[], [], [], []]);
    expect(rows.filter((row) => row.id.startsWith('combined:'))).toHaveLength(2);
    expect(report.paidCents).toBe(5357920n);
    expect(report.plannedCents).toBe(2533696n);
    expect(report.unscheduledCents).toBe(1500000n);

    const faulty = rows.map((row) => row.id.startsWith('combined:') && row.status === 'paid'
      ? { ...row, amountCents: row.amountCents - 1n } : row);
    const rejected = auditUnifiedFinanceProjection(purchases, [work], faulty);
    expect(rejected.passed).toBe(false);
    expect(rejected.checks[0].issues.join(' ')).toContain('Centavos divergentes');
  });

  it('compara entrada, parcelas e total pago sem confiar só no somatório oficial', () => {
    const pilot = purchase({ id: 'schedule', code: 'CMP-PARCELAS', total: '100.01', paid: '0.00', planned: '100.01' });
    pilot.payments[0].status = 'cancelled';
    pilot.payments[1].entryAmount = '10.00';
    pilot.payments[1].installmentCount = 3;
    pilot.payments[1].firstDueDate = '2027-01-31';
    const rows = buildUnifiedFinancePayments([pilot], []);
    const report = auditUnifiedFinanceProjection([pilot], [], rows);
    expect(report.passed).toBe(true);
    expect(rows.filter((row) => row.status === 'planned')
      .map((row) => row.amountCents).sort()).toEqual([1000n, 3000n, 3000n, 3001n].sort());
    expect(report.plannedCents).toBe(10001n);

    const faulty = rows.map((row) => row.id.endsWith('installment:2')
      ? { ...row, amountCents: row.amountCents + 1n } : row);
    expect(auditUnifiedFinanceProjection([pilot], [], faulty).checks[0].passed).toBe(false);
  });

  it('confronta frete retido, diferença residual, reembolso por item e saldo líquido', () => {
    const raw = purchase({ id: 'adjust', code: 'CMP-00038', total: '100.00', paid: '100.00', planned: '0.00' });
    raw.payments[1].status = 'cancelled';
    const order = raw.orders[0];
    const retained = order.lines[0];
    retained.lineTotal = '60.00';
    retained.unitPrice = '60.00';
    const cancelled = {
      ...retained, id: order.id + '-cancelled', itemName: 'Mesa cancelada',
      itemCode: 'ITM-CANCEL', unitPrice: '35.00', shippingAmount: '5.00',
      lineTotal: '40.00',
      stores: retained.stores.map((store) => ({ ...store, id: store.id + '-cancelled' })),
    };
    order.lines.push(cancelled);
    const adjustment: PartialAdjustmentRecord = {
      id: 'ajuste-38', purchase_id: raw.id, order_id: order.id,
      payment_id: raw.payments[0].id, refund_attachment_id: 'comprovante-38',
      original_cents: 10000, cancelled_cents: 4000,
      freight_reduction_cents: -510, refund_cents: 3490, remaining_cents: 6510,
      refunded_on: '2026-11-01', reference: 'REEMB-38', reason: 'Cancelamento parcial',
      created_at: '2026-11-01T12:00:00Z',
      line_adjustments: [
        {
          line_id: cancelled.id, kind: 'cancelled',
          reduction_cents: 4000, original_line_cents: 4000, original_shipping_cents: 500,
        },
        {
          line_id: cancelled.id, kind: 'freight_retained',
          reduction_cents: -500, original_line_cents: 4000, original_shipping_cents: 500,
        },
        {
          line_id: cancelled.id, kind: 'residual_retained',
          reduction_cents: -10, original_line_cents: 4000, original_shipping_cents: 500,
        },
      ],
      refund_entries: [
        { line_id: cancelled.id, amount_cents: 3490, refunded_on: '2026-11-01' },
      ],
    };
    const adjusted = applyPurchasePartialAdjustments(raw, [adjustment]);
    const rows = buildUnifiedFinancePayments([adjusted], []);
    const report = auditUnifiedFinanceProjection([adjusted], [], rows);
    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.issues)).toEqual([[], [], [], []]);

    const payment = rows.find((row) => row.status === 'paid');
    expect(payment?.amountCents).toBe(6510n);
    expect(payment?.refundCents).toBe(3490n);
    expect(payment?.adjustmentEntries?.reduce((total, entry) => total + entry.amountCents, 0n)).toBe(-3490n);
    expect(payment?.storeAllocations.reduce((total, entry) => total + entry.amountCents, 0n)).toBe(6510n);
    const decorated = decorateFinancePaymentsWithOccurrences(rows, []);
    expect(decorated[0].occurrenceSumCents).toBe(6510n);
    expect(decorated[0].paymentOccurrences.map((event) => event.amountCents)).toEqual([10000n, -3490n]);

    const corruptedPurchase: PurchaseV2 = {
      ...adjusted,
      payments: adjusted.payments.map((part) => part.status === 'paid'
        ? { ...part, refundedAmount: '34.91' } : part),
    };
    const invalid = auditUnifiedFinanceProjection([corruptedPurchase], [], rows);
    expect(invalid.checks[1].passed).toBe(false);
    expect(invalid.checks[1].issues.length).toBeGreaterThan(0);
  });

  it('confere rateio de cinco centavos entre três lojas e detecta perda de centavos', () => {
    const pilot = purchase({ id: 'rateio', code: 'CMP-RATEIO', total: '0.05', paid: '0.05', planned: '0.00' });
    pilot.payments[1].status = 'cancelled';
    const first = pilot.orders[0].lines[0];
    first.lineTotal = '0.05';
    first.unitPrice = '0.05';
    const originalStore = first.stores[0];
    first.stores = ['store-b', 'store-a', 'store-c'].map((storeId) => ({
      ...originalStore, id: 'rateio-' + storeId, storeId,
      code: 'LOJ-' + storeId.slice(-1).toUpperCase(), quantity: '1',
    }));
    pilot.stores = first.stores.map((store) => ({
      id: store.id, storeId: store.storeId, code: store.code,
      name: store.name, city: store.city, state: store.state,
      address: null, addressSnapshotSource: null,
    }));
    const rows = buildUnifiedFinancePayments([pilot], []);
    const report = auditUnifiedFinanceProjection([pilot], [], rows);
    expect(report.passed).toBe(true);
    const actual = Object.fromEntries(rows[0].storeAllocations.map((allocation) =>
      [allocation.storeId, allocation.amountCents]));
    expect(actual).toEqual({ 'store-a': 2n, 'store-b': 2n, 'store-c': 1n });

    const wrongRows = [{ ...rows[0], storeAllocations: rows[0].storeAllocations.map((entry) =>
      entry.storeId === 'store-c' ? { ...entry, amountCents: 0n } : entry) }];
    expect(auditUnifiedFinanceProjection([pilot], [], wrongRows).checks[2].passed).toBe(false);
  });

  it('não marca pagamentos gerais não distribuídos por pedido como paridade completa', () => {
    const pilot = purchase({ id: 'general', code: 'CMP-GERAL', total: '50.00', paid: '25.00', planned: '0.00' });
    pilot.payments[1].status = 'cancelled';
    pilot.payments[0].purchaseOrderId = null;
    const rows = buildUnifiedFinancePayments([pilot], []);
    const report = auditUnifiedFinanceProjection([pilot], [], rows);
    expect(report.passed).toBe(false);
    expect(report.checks[3].passed).toBe(true);
    expect(report.checks[3].warnings.join(' ')).toContain('pagamento geral');
    expect(rows.find((row) => row.status === 'unscheduled')?.amountCents).toBe(2500n);
  });
});


describe('rateio cruzado entre equipamentos, mobiliário e lojas', () => {
  it('conserva centavos nas três lojas e nas origens financeiras independentes', () => {
    const pilot = purchase({
      id: 'mixed', code: 'CMP-RATEIO-MISTO', total: '101.03', paid: '101.03', planned: '0.00',
    });
    pilot.payments[1].status = 'cancelled';
    const line = pilot.orders[0].lines[0];
    line.lineTotal = '50.01';
    line.unitPrice = '50.01';
    line.stores = line.stores.map((store) => ({
      ...store, storeId: 'store-a', code: 'LOJ-A',
    }));
    pilot.items.push({
      ...pilot.items[0], id: 'mixed-furniture-item',
      itemName: 'Mesa de apoio', itemCategory: 'Mobiliário',
      catalogFinancialGroup: 'furniture', actualTotal: '51.02',
      purchasedQuantity: '2',
    });
    const otherLine = {
      ...line, id: line.id + '-furniture', purchaseItemId: 'mixed-furniture-item',
      itemCode: 'ITM-MESA', itemName: 'Mesa de apoio',
      unitPrice: '51.02', lineTotal: '51.02', quantity: '2',
      stores: ['store-b', 'store-c'].map((storeId) => ({
        ...line.stores[0], id: line.id + '-' + storeId,
        storeId, code: 'LOJ-' + storeId.slice(-1).toUpperCase(),
        quantity: '1',
      })),
    };
    pilot.orders[0].lines.push(otherLine);
    pilot.stores = [...line.stores, ...otherLine.stores].map((store) => ({
      id: store.id, storeId: store.storeId, code: store.code,
      name: store.name, city: store.city, state: store.state,
      address: null, addressSnapshotSource: null,
    }));
    const rows = buildUnifiedFinancePayments([pilot], []);
    const audit = auditUnifiedFinanceProjection([pilot], [], rows);
    expect(audit.passed).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].originAllocations).toEqual({
      equipment: 5001n, furniture: 5102n, works: 0n,
    });
    expect(Object.fromEntries(rows[0].storeAllocations.map((entry) =>
      [entry.storeId, entry.amountCents]))).toEqual({
      'store-a': 5001n, 'store-b': 2551n, 'store-c': 2551n,
    });
    expect(rows[0].unallocatedCents).toBe(0n);
  });
});


describe('crédito residual de frete sem classificação fiscal indevida', () => {
  it('compara o crédito excedente, a redução integral do frete e o valor líquido', () => {
    const source = purchase({ id: 'credit', code: 'CMP-CREDITO', total: '100.00', paid: '100.00', planned: '0.00' });
    source.payments[1].status = 'cancelled';
    const order = source.orders[0];
    const kept = order.lines[0];
    kept.lineTotal = '60.00';
    kept.unitPrice = '50.00';
    kept.shippingAmount = '10.00';
    const cancelled = {
      ...kept, id: order.id + '-cancel', itemCode: 'ITM-CANCEL',
      itemName: 'Item devolvido', unitPrice: '40.00',
      shippingAmount: '0.00', lineTotal: '40.00',
      stores: kept.stores.map((store) => ({ ...store, id: store.id + '-cancel' })),
    };
    order.lines.push(cancelled);
    const adjustment: PartialAdjustmentRecord = {
      id: 'credit-adjust', purchase_id: source.id, order_id: order.id,
      payment_id: source.payments[0].id,
      refund_attachment_id: 'refund-proof',
      original_cents: 10000, cancelled_cents: 4000,
      freight_reduction_cents: 1300, refund_cents: 5300,
      remaining_cents: 4700, refunded_on: '2026-11-03',
      reference: 'AJ-CREDITO', reason: 'Crédito residual',
      created_at: '2026-11-03T10:00:00Z',
      line_adjustments: [
        {
          line_id: cancelled.id, kind: 'cancelled', reduction_cents: 4000,
          original_line_cents: 4000, original_shipping_cents: 0,
        },
        {
          line_id: kept.id, kind: 'freight', reduction_cents: 1000,
          original_line_cents: 6000, original_shipping_cents: 1000,
        },
        {
          line_id: kept.id, kind: 'residual_credit', reduction_cents: 300,
          original_line_cents: 6000, original_shipping_cents: 1000,
        },
      ],
      refund_entries: [{
        line_id: cancelled.id, amount_cents: 5300, refunded_on: '2026-11-03',
      }],
    };
    const adjusted = applyPurchasePartialAdjustments(source, [adjustment]);
    const rows = buildUnifiedFinancePayments([adjusted], []);
    const report = auditUnifiedFinanceProjection([adjusted], [], rows);
    expect(report.passed).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(4700n);
    expect(rows[0].refundCents).toBe(5300n);
    expect(rows[0].adjustmentEntries?.reduce((total, event) => total + event.amountCents, 0n)).toBe(-5300n);
    expect(rows[0].storeAllocations[0].amountCents).toBe(4700n);
    expect(adjusted.orders[0].lines.some((line) => line.itemCode === 'AJ-CREDITO')).toBe(true);
    expect(adjusted.orders[0].lines.some((line) =>
      line.itemCode === 'AJ-CREDITO' && line.lineTotal === '-3.00')).toBe(true);
  });
});


describe('comparação imutável SQL dos reembolsos', () => {
  it('reconcilia o histórico de CMP-00038 e identifica diferença de um centavo', () => {
    const p = purchase({
      id: 'cmp38', code: 'CMP-00038', total: '100.00', paid: '100.00', planned: '0.00',
    });
    const payment = p.payments[0];
    p.payments[1].status = 'cancelled';
    payment.grossAmount = '100.00';
    payment.amount = '65.10';
    payment.refundedAmount = '34.90';
    payment.refundedOn = '2026-11-01';
    payment.refundEntries = [
      { lineId: 'cancel-a', amountCents: 2000n, refundedOn: '2026-11-01' },
      { lineId: 'cancel-b', amountCents: 1490n, refundedOn: '2026-11-01' },
    ];
    p.adjustments = [{
      id: 'adjustment-38', orderId: p.orders[0].id, paymentId: payment.id,
      refundAttachmentId: 'document-38', grossCents: 10000n, cancelledCents: 4000n,
      freightReductionCents: -510n, residualCents: -10n, refundedCents: 3490n,
      netCents: 6510n, refundedOn: '2026-11-01', reference: 'REF-38',
      reason: 'Cancelamento parcial',
      refundEntries: payment.refundEntries,
      createdAt: '2026-11-01T12:00:00Z',
      cancelledLines: [], freightLines: [],
    }];
    const row: FinancePurchaseAdjustmentSnapshot = {
      id: 'adjustment-38', purchaseId: p.id, orderId: p.orders[0].id,
      paymentId: payment.id, referenceCode: p.code, reference: 'REF-38',
      refundedOn: '2026-11-01', grossCents: 10000n,
      netCents: 6510n, refundedCents: 3490n, cancelledCents: 4000n,
      freightReductionCents: -510n, residualCents: -10n,
      refundEntryCents: 3490n, entryCount: 2, isValid: true,
    };
    const totals = {
      totalCount: 1, invalidCount: 0, isComplete: true,
      grossCents: 10000n, netCents: 6510n, refundedCents: 3490n,
    };
    expect(() => assertPurchaseAdjustmentParity([p], totals, [row])).not.toThrow();
    expect(() => assertPurchaseAdjustmentParity(
      [p], totals, [{ ...row, refundedCents: 3491n }],
    )).toThrow('Centavos, histórico ou crédito divergentes');
    expect(() => assertPurchaseAdjustmentParity(
      [p], totals, [row, row],
    )).toThrow('todas as páginas');
    expect(() => assertPurchaseAdjustmentParity(
      [p], { ...totals, invalidCount: 1, isComplete: false }, [row],
    )).toThrow('exigem conciliação manual');
  });
});
