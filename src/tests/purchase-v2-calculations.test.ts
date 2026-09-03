import { describe, expect, it } from 'vitest';
import {
  approvedDestinationAllocations,
  calculateRegistrationTotal,
  itemExecution,
  purchaseAllocationCoverage,
  purchaseExecutionSummary,
  purchaseOrderFinancialSummary,
  purchaseOrderStoreCosts,
  purchasePortfolioDestinationRows,
  purchasePortfolioStoreRows,
  purchasePortfolioSummary,
  purchaseStoreCosts,
  suggestedDeliveryDate,
} from '../domain/purchase-v2-calculations';
import type { PurchaseItemV2, PurchaseOrderLineV2, PurchaseOrderV2, PurchaseStoreV2, PurchaseV2 } from '../domain/purchase-v2-types';

function store(id: string, code: string): PurchaseStoreV2 {
  return { id: `ps-${id}`, storeId: id, code, name: code, city: 'Cidade', state: 'CE', address: null, addressSnapshotSource: null };
}

function item(overrides: Partial<PurchaseItemV2> = {}): PurchaseItemV2 {
  return {
    id: 'item-1', purchaseId: 'purchase-1', sourceQuoteItemId: 'quote-item-1', supplyItemId: 'supply-item-1',
    itemCode: 'ITM-0001', itemName: 'Item', itemDescription: null, itemCategory: null, itemArea: null,
    brandReference: null, technicalSpecification: null, offeredBrandModel: null, productUrl: null,
    storeId: null, storeCode: null, quantityApproved: '10', purchasedQuantity: '0', unit: 'un',
    quotedUnitPrice: '100.00', quotedDiscountAmount: '0', quotedShippingType: 'free', quotedShippingAmount: '0',
    quotedOtherCosts: '0', quotedDeliveryDays: 5, approvedLineTotal: '1000.00', actualTotal: '0',
    itemContextSnapshotSource: 'approval', quoteItemNotes: null, destinations: [], ...overrides,
  };
}

function line(overrides: Partial<PurchaseOrderLineV2> = {}): PurchaseOrderLineV2 {
  return {
    id: 'line-1', orderId: 'order-1', purchaseItemId: 'item-1', purchaseDestinationId: null,
    itemCode: 'ITM-0001', itemName: 'Item', destinationLabel: null, destinationState: null,
    quantity: '4', unit: 'un', unitPrice: '100.00', discountAmount: '0', shippingType: 'free',
    actualShippingType: 'free', shippingAmount: '0', otherCosts: '0', lineTotal: '400.00',
    expectedDeliveryDate: '2026-09-06', notes: null, storeDistributionStatus: 'confirmed',
    stores: [{ id: 'ls-1', orderLineId: 'line-1', purchaseDestinationStoreId: null, storeId: 'store-1', code: 'L1', name: 'L1', city: 'Cidade', state: 'CE', quantity: '4', allocationSource: 'manual' }],
    ...overrides,
  };
}

function order(lines: PurchaseOrderLineV2[], overrides: Partial<PurchaseOrderV2> = {}): PurchaseOrderV2 {
  return {
    id: 'order-1', purchaseId: 'purchase-1', purchasedOn: '2026-09-01', supplierOrderRef: null,
    expectedDeliveryDate: '2026-09-06', status: 'active', source: 'manual', notes: null,
    createdBy: null, createdByName: 'Teste', createdAt: '2026-09-01T12:00:00Z', cancelledBy: null,
    cancelledByName: null, cancelledAt: null, cancellationReason: null, lines, ...overrides,
  };
}

function purchase(overrides: Partial<PurchaseV2> = {}): PurchaseV2 {
  return {
    id: 'purchase-1', code: 'CMP-00001', quoteId: 'quote-1', quoteCode: 'COT-00001', supplierId: 'supplier-1',
    supplierName: 'Fornecedor', quoteDate: '2026-08-31', approvedTotal: '1000.00', hasPendingShipping: false,
    paymentMethodSnapshot: null, entryAmountSnapshot: null, installmentCountSnapshot: null, paymentNotesSnapshot: null,
    status: 'approved', notes: null, approvedAt: '2026-09-01T10:00:00Z', returnedAt: null,
    supplierChannelId: null, channelType: 'ecommerce', originCity: null, originState: null, contact: null,
    quoteContextSnapshotSource: 'approval', stores: [store('store-1', 'L1'), store('store-2', 'L2')],
    items: [item()], orders: [], payments: [], attachments: [], quoteAttachments: [], ...overrides,
  };
}

describe('purchase-v2-calculations', () => {
  it('calcula o total do registro com desconto, frete e outros custos', () => {
    expect(calculateRegistrationTotal({ quantity: '2', unitPrice: '100', discountAmount: '10', shippingAmount: '15', otherCosts: '5' })).toBe(21000n);
  });

  it('ignora registros cancelados e so fecha variacao quando a quantidade termina', () => {
    const active = line({ quantity: '4', lineTotal: '400.00' });
    const cancelled = order([line({ id: 'line-cancelled', quantity: '6', lineTotal: '600.00' })], { id: 'order-cancelled', status: 'cancelled' });
    const partialPurchase = purchase({ orders: [order([active]), cancelled] });
    expect(itemExecution(partialPurchase.items[0], partialPurchase).purchasedQuantity).toBe(4000n);
    expect(itemExecution(partialPurchase.items[0], partialPurchase).variationCents).toBeNull();
  });

  it('mantem variacao em andamento quando o frete realizado esta pendente', () => {
    const pendingLine = line({ quantity: '10', shippingType: 'pending', actualShippingType: 'pending', shippingAmount: null, lineTotal: null });
    const current = purchase({ orders: [order([pendingLine])], status: 'purchased' });
    expect(purchaseExecutionSummary(current).completed).toBe(true);
    expect(purchaseExecutionSummary(current).variationCents).toBeNull();
  });

  it('usa rateio igual apenas como fallback historico e preserva os centavos', () => {
    const legacyItem = item({ sourceQuoteItemId: null, approvedLineTotal: '10.00' });
    const current = purchase({ stores: [store('a', 'A'), store('b', 'B'), store('c', 'C')], items: [legacyItem], approvedTotal: '10.00' });
    const costs = purchaseStoreCosts(current);
    expect(costs.approvedUnallocatedCents).toBe(0n);
    expect(costs.rows.reduce((sum, row) => sum + row.approvedCents, 0n)).toBe(1000n);
    expect(costs.rows.map((row) => row.approvedCents).sort((a, b) => Number(a - b))).toEqual([333n, 333n, 334n]);
  });

  it('nao inventa rateio para item V2 novo sem destino', () => {
    const current = purchase({ items: [item({ sourceQuoteItemId: 'quote-item-1', approvedLineTotal: '10.00' })], approvedTotal: '10.00' });
    const costs = purchaseStoreCosts(current);
    expect(costs.approvedUnallocatedCents).toBe(1000n);
    expect(costs.rows.every((row) => row.approvedCents === 0n)).toBe(true);
  });

  it('so aloca realizado por loja quando a distribuicao fisica esta confirmada', () => {
    const pending = line({ lineTotal: '400.00', storeDistributionStatus: 'pending', stores: [] });
    const current = purchase({ orders: [order([pending])] });
    const costs = purchaseStoreCosts(current);
    expect(costs.realizedUnallocatedCents).toBe(40000n);
    expect(costs.rows.every((row) => row.realizedCents === 0n)).toBe(true);
  });

  it('mostra o custo exato por loja dentro de uma compra realizada', () => {
    const currentOrder = order([line({
      quantity: '4',
      lineTotal: '401.00',
      stores: [
        { id: 'ls-1', orderLineId: 'line-1', purchaseDestinationStoreId: null, storeId: 'store-1', code: 'L1', name: 'L1', city: 'Cidade', state: 'CE', quantity: '1', allocationSource: 'manual' },
        { id: 'ls-2', orderLineId: 'line-1', purchaseDestinationStoreId: null, storeId: 'store-2', code: 'L2', name: 'L2', city: 'Cidade', state: 'CE', quantity: '3', allocationSource: 'manual' },
      ],
    })]);
    const costs = purchaseOrderStoreCosts(currentOrder);
    expect(costs.isConfirmed).toBe(true);
    expect(costs.unallocatedCents).toBe(0n);
    expect(costs.rows.map((row) => ({ code: row.code, cost: row.costCents }))).toEqual([
      { code: 'L1', cost: 10025n },
      { code: 'L2', cost: 30075n },
    ]);
  });

  it('concilia somente pagamentos vinculados a compra especifica', () => {
    const currentOrder = order([line({ lineTotal: '400.00' })]);
    const current = purchase({
      orders: [currentOrder],
      payments: [
        { id: 'linked', purchaseId: 'purchase-1', purchaseOrderId: 'order-1', paymentMethod: 'pix', sourceLabel: null, amount: '400', entryAmount: null, installmentCount: null, firstDueDate: null, status: 'paid', paidAt: '2026-09-01T12:00:00Z', notes: null, createdAt: '2026-09-01T12:00:00Z' },
        { id: 'general', purchaseId: 'purchase-1', purchaseOrderId: null, paymentMethod: 'cash', sourceLabel: null, amount: '50', entryAmount: null, installmentCount: null, firstDueDate: null, status: 'paid', paidAt: '2026-09-01T12:00:00Z', notes: null, createdAt: '2026-09-01T12:00:00Z' },
      ],
    });
    const financial = purchaseOrderFinancialSummary(current, currentOrder);
    expect(financial.paidCents).toBe(40000n);
    expect(financial.balanceToPayCents).toBe(0n);
    expect(financial.isReconciled).toBe(true);
  });

  it('nao conclui item que ainda esteja 0,001 unidade abaixo do aprovado', () => {
    const almostComplete = line({ quantity: '9.999', lineTotal: '999.90' });
    const current = purchase({ items: [item({ quantityApproved: '10.000' })], orders: [order([almostComplete])] });
    const execution = itemExecution(current.items[0], current);
    expect(execution.completed).toBe(false);
    expect(execution.missingQuantity).toBe(1n);
    expect(execution.variationCents).toBeNull();
  });


  it('rateia o valor aprovado por destino preservando o frete de cada destino e os centavos', () => {
    const currentItem = item({
      quantityApproved: '10',
      approvedLineTotal: '1050.00',
      destinations: [
        {
          id: 'd1', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd1', destinationType: 'profile',
          profileId: 'p1', storeId: null, label: 'Prospector A', state: 'CE', destinationCount: 1,
          quantity: '4', unit: 'un', quotedShippingType: 'informed', quotedShippingAmount: '30',
          quotedDeliveryDays: 5, notes: null, position: 0, distributionStatus: 'pending', snapshotSource: 'approval', stores: [],
        },
        {
          id: 'd2', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd2', destinationType: 'profile',
          profileId: 'p2', storeId: null, label: 'Prospector B', state: 'CE', destinationCount: 1,
          quantity: '6', unit: 'un', quotedShippingType: 'informed', quotedShippingAmount: '20',
          quotedDeliveryDays: 7, notes: null, position: 1, distributionStatus: 'pending', snapshotSource: 'approval', stores: [],
        },
      ],
    });
    const allocation = approvedDestinationAllocations(currentItem);
    expect(allocation.get('d1')).toBe(43000n);
    expect(allocation.get('d2')).toBe(62000n);
    expect([...allocation.values()].reduce((sum, value) => sum + value, 0n)).toBe(105000n);
  });

  it('classifica cobertura entre destino real, loja direta, fallback legado e nao alocado', () => {
    const current = purchase({
      items: [
        item({ id: 'destination', destinations: [{
          id: 'd1', purchaseItemId: 'destination', sourceQuoteDestinationId: 'qd1', destinationType: 'store',
          profileId: null, storeId: 'store-1', label: 'L1', state: 'CE', destinationCount: 1, quantity: '10', unit: 'un',
          quotedShippingType: 'free', quotedShippingAmount: '0', quotedDeliveryDays: 1, notes: null, position: 0,
          distributionStatus: 'confirmed', snapshotSource: 'approval', stores: [],
        }] }),
        item({ id: 'direct', storeId: 'store-1', storeCode: 'L1', destinations: [] }),
        item({ id: 'legacy', sourceQuoteItemId: null, destinations: [] }),
        item({ id: 'unallocated', sourceQuoteItemId: 'quote-item-2', storeId: null, destinations: [] }),
      ],
    });
    expect(purchaseAllocationCoverage(current)).toEqual({
      destinationItems: 1,
      directStoreItems: 1,
      legacyFallbackItems: 1,
      unallocatedItems: 1,
    });
  });

  it('sugere previsao somando o prazo cotado a data da compra', () => {
    expect(suggestedDeliveryDate('2026-09-01', 5)).toBe('2026-09-06');
    expect(suggestedDeliveryDate('2026-09-01', null)).toBe('');
  });

  it('consolida valores, pagamentos e pendencias do portfolio de compras', () => {
    const first = purchase({
      status: 'partially_purchased',
      items: [item({ storeId: 'store-1', storeCode: 'L1' })],
      orders: [order([line({ storeDistributionStatus: 'pending', stores: [] })])],
      payments: [{
        id: 'payment-1', purchaseId: 'purchase-1', purchaseOrderId: null, paymentMethod: 'pix', sourceLabel: null,
        amount: '400', entryAmount: null, installmentCount: null, firstDueDate: null,
        status: 'paid', paidAt: '2026-09-01T12:00:00Z', notes: null, createdAt: '2026-09-01T12:00:00Z',
      }],
      attachments: [{ id: 'attachment-1' } as never],
    });
    const second = purchase({
      id: 'purchase-2', approvedTotal: '500', status: 'approved', orders: [],
      items: [item({ id: 'item-2', purchaseId: 'purchase-2', storeId: 'store-2', storeCode: 'L2', approvedLineTotal: '500' })],
      payments: [{
        id: 'payment-2', purchaseId: 'purchase-2', purchaseOrderId: null, paymentMethod: 'boleto', sourceLabel: null,
        amount: '500', entryAmount: null, installmentCount: null, firstDueDate: '2026-09-10',
        status: 'planned', paidAt: null, notes: null, createdAt: '2026-09-01T12:00:00Z',
      }],
    });

    expect(purchasePortfolioSummary([first, second])).toMatchObject({
      purchaseCount: 2,
      approvedCents: 150000n,
      realizedCents: 40000n,
      paidPayments: 1,
      paidCents: 40000n,
      linkedPaidCents: 0n,
      unlinkedPaidCents: 40000n,
      plannedPayments: 1,
      plannedCents: 50000n,
      documents: 1,
      pendingLineDistributions: 1,
      statusCounts: { partially_purchased: 1, approved: 1 },
    });
    expect(purchasePortfolioStoreRows([first, second]).map((row) => ({
      code: row.code,
      approvedCents: row.approvedCents,
      realizedCents: row.realizedCents,
    }))).toEqual([
      { code: 'L1', approvedCents: 100000n, realizedCents: 0n },
      { code: 'L2', approvedCents: 50000n, realizedCents: 0n },
    ]);
  });

  it('agrupa a visao de prospectores e UF sem duplicar compras e lojas', () => {
    const destinationItem = item({
      destinations: [{
        id: 'destination-1', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd-1',
        destinationType: 'profile', profileId: 'profile-1', storeId: null, label: 'Prospector A',
        state: 'CE', destinationCount: 2, quantity: '10', unit: 'un', quotedShippingType: 'free',
        quotedShippingAmount: '0', quotedDeliveryDays: 5, notes: null, position: 0,
        distributionStatus: 'pending', snapshotSource: 'approval', stores: [
          { id: 'ds-1', purchaseDestinationId: 'destination-1', storeId: 'store-1', code: 'L1', name: 'L1', city: 'Cidade', state: 'CE', allocatedQuantity: null, allocationSource: 'pending' },
          { id: 'ds-2', purchaseDestinationId: 'destination-1', storeId: 'store-2', code: 'L2', name: 'L2', city: 'Cidade', state: 'CE', allocatedQuantity: null, allocationSource: 'pending' },
        ],
      }],
    });
    const current = purchase({ items: [destinationItem] });
    expect(purchasePortfolioDestinationRows([current])).toEqual([
      expect.objectContaining({
        label: 'Prospector A', state: 'CE', purchaseCount: 1, itemCount: 1, storeCount: 2,
        approvedCents: 0n, approvedUnallocatedCents: 100000n, realizedCents: 0n, pendingDistributions: 1,
      }),
    ]);
  });
});
