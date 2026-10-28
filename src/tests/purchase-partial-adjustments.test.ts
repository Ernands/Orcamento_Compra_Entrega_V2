import { describe, expect, it } from 'vitest';
import { applyPurchasePartialAdjustments, type PartialAdjustmentRecord } from '../domain/purchase-partial-adjustments';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import { moneyToCents } from '../domain/supply-calculations';
import { buildUnifiedFinancePayments, financePaymentTotals } from '../domain/finance-payments';
import {
  decorateFinancePaymentsWithOccurrences,
  financePaymentMatchesDateRange,
  scopeFinancePaymentToOccurrenceDateRange,
} from '../domain/finance-payment-occurrences';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import { buildStoreReimbursement } from '../domain/finance-reimbursement';

const D = (v: number) => (v / 100).toFixed(2);
const lines = [
  { id: 'line-cancel', name: 'Item sintético cancelado', code: 'SYN-01', price: 10000, freight: 2000, total: 12000 },
  { id: 'line-keep1', name: 'Item sintético A', code: 'SYN-02', price: 9000, freight: 1000, total: 10000 },
  { id: 'line-keep2', name: 'Item sintético B', code: 'SYN-03', price: 8000, freight: 2000, total: 10000 },
];

function fixture(): PurchaseV2 {
  return {
    id: 'purchase-synthetic', code: 'CMP-TESTE', quoteId: 'quote-synthetic',
    quoteCode: 'COT-TESTE', supplierId: 'supplier-synthetic', supplierName: 'Fornecedor de teste',
    quoteDate: '2026-01-01', approvedTotal: '320.00', hasPendingShipping: false,
    paymentMethodSnapshot: 'boleto', entryAmountSnapshot: null, installmentCountSnapshot: null,
    paymentNotesSnapshot: null, status: 'purchased', notes: null, approvedAt: '2026-01-01',
    returnedAt: null, supplierChannelId: null, channelType: null,
    originCity: null, originState: null, contact: null, quoteContextSnapshotSource: null,
    stores: [{ id:'store-link', storeId:'store-one', code:'LOJ-TESTE', name:'Loja de teste',
      city:'Cidade de teste',state:'CE',address:null,addressSnapshotSource:null }],
    items: lines.map(line => ({
      id:line.id,purchaseId:'purchase-synthetic',sourceQuoteItemId:null,supplyItemId:line.id,
      itemCode:line.code,itemName:line.name,itemDescription:null,itemCategory:'Mobiliário',
      catalogSubcategory:null,catalogGroupName:null,catalogFinancialGroup:'furniture' as const,
      itemArea:null,brandReference:null,technicalSpecification:null,offeredBrandModel:null,
      productUrl:null,storeId:'store-one',storeCode:'LOJ-TESTE',
      quantityApproved:'1',purchasedQuantity:'1',unit:'un',
      quotedUnitPrice:D(line.price),quotedDiscountAmount:'0',quotedShippingType:'informed' as const,
      quotedShippingAmount:D(line.freight),quotedOtherCosts:'0',quotedDeliveryDays:null,
      approvedLineTotal:D(line.total),actualTotal:D(line.total),
      itemContextSnapshotSource:null,quoteItemNotes:null,destinations:[],
    })),
    orders:[{
      id:'order-synthetic',purchaseId:'purchase-synthetic',purchasedOn:'2026-01-02',
      supplierOrderRef:'TEST',expectedDeliveryDate:null,status:'active',source:'manual',
      notes:null,createdBy:null,createdByName:null,createdAt:'2026-01-02',
      cancelledBy:null,cancelledByName:null,cancelledAt:null,cancellationReason:null,
      lines:lines.map(line=>({
        id:line.id,orderId:'order-synthetic',purchaseItemId:line.id,purchaseDestinationId:null,
        itemCode:line.code,itemName:line.name,destinationLabel:'Loja de teste',
        destinationState:'CE',quantity:'1',unit:'un',unitPrice:D(line.price),
        discountAmount:'0',shippingType:'informed' as const,
        actualShippingType:'informed' as const,shippingAmount:D(line.freight),
        otherCosts:'0',lineTotal:D(line.total),expectedDeliveryDate:null,notes:null,
        storeDistributionStatus:'confirmed' as const,
        stores:[{id:'store-'+line.id,orderLineId:line.id,purchaseDestinationStoreId:null,
          storeId:'store-one',code:'LOJ-TESTE',name:'Loja de teste',city:'Cidade de teste',
          state:'CE',quantity:'1',allocationSource:'direct' as const}],
      })),
    }],
    payments:[{id:'paid-synthetic',purchaseId:'purchase-synthetic',
      purchaseOrderId:'order-synthetic',paymentMethod:'boleto',sourceLabel:'Boleto teste',
      amount:'320.00',entryAmount:null,installmentCount:null,firstDueDate:null,
      status:'paid',paidAt:'2026-01-02',notes:null,createdAt:'2026-01-02'}],
    attachments:[],quoteAttachments:[],
  };
}

function record(): PartialAdjustmentRecord {
  return {
    id:'adjustment-synthetic',purchase_id:'purchase-synthetic',order_id:'order-synthetic',
    payment_id:'paid-synthetic',refund_attachment_id:'refund-proof-synthetic',
    original_cents:32000,cancelled_cents:12000,freight_reduction_cents:500,
    refund_cents:12500,remaining_cents:19500,
    refunded_on:'2026-01-03',reference:'REFUND-TEST',reason:'Teste sintético de cancelamento',
    created_at:'2026-01-03',
    line_adjustments:[
      {line_id:'line-cancel',kind:'cancelled',reduction_cents:12000,
        original_line_cents:12000,original_shipping_cents:2000},
      {line_id:'line-keep1',kind:'freight',reduction_cents:167,
        original_line_cents:10000,original_shipping_cents:1000},
      {line_id:'line-keep2',kind:'freight',reduction_cents:333,
        original_line_cents:10000,original_shipping_cents:2000},
    ],
  };
}

describe('cancelamento parcial auditável: invariantes e integração entre módulos', () => {
  it('preserva dados brutos e projeta o valor líquido sem desconto duplo', () => {
    const purchase=fixture();
    const before=JSON.stringify(purchase);
    const after=applyPurchasePartialAdjustments(structuredClone(purchase),[record()]);
    expect(JSON.stringify(purchase)).toEqual(before);
    expect(after.orders[0].lines.map(line=>line.id)).toEqual(['line-keep1','line-keep2']);
    expect(after.orders[0].lines.reduce((sum,line)=>sum+moneyToCents(line.lineTotal||'0'),0n)).toBe(19500n);
    expect(after.orders[0].lines.map(line=>line.shippingAmount)).toEqual(['8.33','16.67']);
    expect(after.payments[0].amount).toBe('195.00');
    expect(after.payments[0].grossAmount).toBe('320.00');
    expect(after.payments[0].refundedAmount).toBe('125.00');
    expect(after.adjustments?.[0].freightReductionCents).toBe(500n);
  });

  it('propaga líquido em Pagamentos, Detalhe por loja e Solicitação de Reembolso', () => {
    const p=applyPurchasePartialAdjustments(fixture(),[record()]);
    const rows=buildUnifiedFinancePayments([p],[]);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(19500n);
    expect(rows[0].refundCents).toBe(12500n);
    expect(financePaymentTotals(rows).paidCents).toBe(19500n);
    const perStore=buildFinanceStoreRows([p],[]);
    expect(perStore[0].paidCents).toBe(19500n);
    expect(perStore[0].realizedCents).toBe(19500n);
    const reimb=buildStoreReimbursement(rows,[p],[],'store-one');
    expect(reimb.totals.paidCents).toBe(19500n);
    expect(reimb.totals.commitmentCents).toBe(19500n);
    const enriched=decorateFinancePaymentsWithOccurrences(rows,[{
      id:'occ-test',paymentId:'paid-synthetic',occurredOn:'2026-01-02',
      amount:'320.00',source:'proof_backfill',position:0,attachmentId:null,
      paymentMethod:'boleto',referenceLabel:'Boleto de teste',notes:null,
    }]);
    expect(enriched[0].paymentOccurrences.map(v=>v.amountCents)).toEqual([32000n,-12500n]);
    expect(enriched[0].occurrenceDifferenceCents).toBe(0n);
    expect(financePaymentMatchesDateRange(enriched[0],'2026-01-02','2026-01-02')).toBe(true);
    expect(financePaymentMatchesDateRange(enriched[0],'2026-01-03','2026-01-03')).toBe(false);
    expect(scopeFinancePaymentToOccurrenceDateRange(enriched[0],'2026-01-02','2026-01-02').amountCents).toBe(19500n);
  });

  it('falha fechado quando o bruto diverge ou os componentes do crédito não fecham',()=>{
    const original=fixture();
    original.payments[0].amount='319.00';
    expect(()=>applyPurchasePartialAdjustments(original,[record()])).toThrow('Inconsistência');
    const invalid=record();
    invalid.refund_cents=12501;
    expect(()=>applyPurchasePartialAdjustments(fixture(),[invalid])).toThrow('não conciliado');
  });
});
