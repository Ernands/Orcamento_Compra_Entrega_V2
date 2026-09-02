import { describe, expect, it } from 'vitest';
import {
  buildPurchaseOrderRpcPayloadV2,
  buildPurchasePaymentRpcPayloadV2,
} from '../data/purchases/purchases-v2-repository';

function values(shippingAmount: string) {
  return {
    purchaseId: 'purchase-1', purchasedOn: '2026-09-01', supplierOrderRef: ' PED-10 ', expectedDeliveryDate: '2026-09-06', notes: ' compra parcial ',
    lines: [{ purchaseItemId: 'item-1', purchaseDestinationId: null, quantity: '4', unitPrice: '99,80', discountAmount: '', shippingAmount, otherCosts: '', expectedDeliveryDate: '2026-09-06', notes: ' linha ' }],
  };
}

describe('buildPurchaseOrderRpcPayloadV2', () => {
  it('preserva frete vazio para o backend registrar como nao informado', () => {
    const payload = buildPurchaseOrderRpcPayloadV2(values(''));
    expect(payload.p_lines[0].shipping_amount).toBe('');
  });

  it('preserva zero como frete gratis explicito', () => {
    const payload = buildPurchaseOrderRpcPayloadV2(values('0'));
    expect(payload.p_lines[0].shipping_amount).toBe('0');
  });

  it('normaliza campos opcionais sem alterar os valores numericos', () => {
    const payload = buildPurchaseOrderRpcPayloadV2(values('12,50'));
    expect(payload).toMatchObject({ p_supplier_order_ref: 'PED-10', p_notes: 'compra parcial' });
    expect(payload.p_lines[0]).toMatchObject({ discount_amount: '0', other_costs: '0', shipping_amount: '12,50', notes: 'linha' });
  });
});

describe('buildPurchasePaymentRpcPayloadV2', () => {
  it('normaliza os campos opcionais antes de chamar o RPC', () => {
    expect(buildPurchasePaymentRpcPayloadV2({
      id: null,
      purchaseId: 'purchase-1',
      paymentMethod: 'pix',
      sourceLabel: ' Conta operacional ',
      amount: '4880',
      entryAmount: '',
      installmentCount: '2',
      firstDueDate: '',
      status: 'planned',
      paidAt: '',
      notes: ' Teste ',
    })).toEqual({
      p_payment_id: null,
      p_purchase_id: 'purchase-1',
      p_payment_method: 'pix',
      p_source_label: 'Conta operacional',
      p_amount: '4880',
      p_entry_amount: null,
      p_installment_count: 2,
      p_first_due_date: null,
      p_status: 'planned',
      p_paid_at: null,
      p_notes: 'Teste',
    });
  });
});
