import { describe, expect, it } from 'vitest';
import {
  buildPurchaseOperationRpcPayloadV2,
  buildPurchaseOrderRpcPayloadV2,
  buildPurchasePaymentRpcPayloadV2,
  paidAtFromDateV2,
  purchasePaymentDecimalV2,
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
      purchaseOrderId: 'order-1',
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
      p_purchase_order_id: 'order-1',
      p_payment_method: 'pix',
      p_source_label: 'Conta operacional',
      p_amount: '4880.00',
      p_entry_amount: null,
      p_installment_count: 2,
      p_first_due_date: null,
      p_status: 'planned',
      p_paid_at: null,
      p_notes: 'Teste',
    });
  });
});

describe('buildPurchaseOperationRpcPayloadV2', () => {
  it('envia compra, custo por loja e pagamentos na mesma operacao', () => {
    const payload = buildPurchaseOperationRpcPayloadV2({
      ...values('12,50'),
      lines: [{
        ...values('12,50').lines[0],
        storeAllocations: [
          { storeId: 'store-1', quantity: '1.5' },
          { storeId: 'store-2', quantity: '2.5' },
        ],
      }],
      payments: [{
        paymentMethod: 'pix',
        sourceLabel: ' Conta operacional ',
        amount: '411,70',
        entryAmount: '',
        installmentCount: '',
        firstDueDate: '',
        status: 'paid',
        paidAt: '2026-09-01T12:00:00.000Z',
        notes: ' quitado ',
      }],
    });

    expect(payload.p_lines[0].store_allocations).toEqual([
      { store_id: 'store-1', quantity: '1.5' },
      { store_id: 'store-2', quantity: '2.5' },
    ]);
    expect(payload.p_payments).toEqual([expect.objectContaining({
      payment_method: 'pix',
      source_label: 'Conta operacional',
      amount: '411,70',
      status: 'paid',
      notes: 'quitado',
    })]);
  });
});

describe('atualizacao de parcela existente', () => {
  it('preserva o ID original ao marcar como pago com a data real', () => {
    const date = paidAtFromDateV2('2026-10-09');
    expect(date).toBe('2026-10-09T12:00:00.000Z');
    const rpc = buildPurchasePaymentRpcPayloadV2({
      id: 'parcela-original',
      purchaseId: 'compra-miranda',
      purchaseOrderId: 'pedido-original',
      paymentMethod: 'boleto',
      sourceLabel: 'Boleto Miranda 1/5',
      amount: '14652,96',
      entryAmount: '',
      installmentCount: '',
      firstDueDate: '2026-10-13',
      status: 'paid',
      paidAt: date,
      notes: 'Quitado',
    });
    expect(rpc).toMatchObject({
      p_payment_id: 'parcela-original',
      p_purchase_order_id: 'pedido-original',
      p_amount: '14652.96',
      p_status: 'paid',
      p_first_due_date: '2026-10-13',
      p_paid_at: '2026-10-09T12:00:00.000Z',
    });
  });

  it('rejeita data impossivel ou em branco', () => {
    expect(() => paidAtFromDateV2('')).toThrow();
    expect(() => paidAtFromDateV2('2026-02-30')).toThrow();
  });
});

describe('pagamentos com pontuacao brasileira', () => {
  it.each([
    ['5.684,00', '5684.00'],
    ['5684,00', '5684.00'],
    ['5.684', '5684.00'],
    ['R$ 5.684,00', '5684.00'],
    ['5684.00', '5684.00'],
    ['1.234.567,89', '1234567.89'],
    ['1,234.56', '1234.56'],
    ['5,90', '5.90'],
    ['0', '0.00'],
  ])('normaliza %s como %s antes de gravar no PostgreSQL', (entered, expected) => {
    expect(purchasePaymentDecimalV2(entered)).toBe(expected);
  });

  it('normaliza valor e entrada ao atualizar a mesma parcela', () => {
    const payload = buildPurchasePaymentRpcPayloadV2({
      id: 'parcela-00003',
      purchaseId: 'compra-00003',
      purchaseOrderId: 'pedido-miranda',
      paymentMethod: 'boleto',
      sourceLabel: 'Boleto Miranda 1/5',
      amount: '5.684,00',
      entryAmount: '1.000,50',
      installmentCount: '',
      firstDueDate: '2026-10-13',
      status: 'paid',
      paidAt: paidAtFromDateV2('2026-10-08'),
      notes: 'Parcela combinada',
    });
    expect(payload).toMatchObject({
      p_payment_id: 'parcela-00003',
      p_amount: '5684.00',
      p_entry_amount: '1000.50',
      p_first_due_date: '2026-10-13',
      p_status: 'paid',
    });
  });

  it.each(['', 'abc', '5.684,000', '1,2,3', '1.234,5.6'])(
    'rejeita texto monetario invalido %s antes de enviar a RPC', (entered) => {
      expect(() => purchasePaymentDecimalV2(entered)).toThrow();
    },
  );
});
