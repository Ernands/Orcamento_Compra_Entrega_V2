import { describe, expect, it } from 'vitest';
import {
  PURCHASE_DELIVERY_STATUS_LABELS,
  purchaseDeliveryPending,
  type PurchaseDeliveryItem,
} from '../domain/purchase-delivery-types';

function item(values: Partial<PurchaseDeliveryItem> = {}): PurchaseDeliveryItem {
  return {
    id: 'item-1',
    name: 'Item teste',
    purchaseTotal: 10,
    acquiredQuantity: 7,
    position: 1,
    active: true,
    notes: null,
    ...values,
  };
}

describe('gerenciamento compra/entrega', () => {
  it('mantem a regra da planilha para pendente: adquirido menos compra total', () => {
    expect(purchaseDeliveryPending(item())).toBe(-3);
    expect(purchaseDeliveryPending(item({ acquiredQuantity: 10 }))).toBe(0);
    expect(purchaseDeliveryPending(item({ acquiredQuantity: 12 }))).toBe(2);
  });

  it('preserva os principais estados visuais da planilha', () => {
    expect(PURCHASE_DELIVERY_STATUS_LABELS.matrix).toBe('Matriz / distribuir');
    expect(PURCHASE_DELIVERY_STATUS_LABELS.delivered).toBe('Entregue');
    expect(PURCHASE_DELIVERY_STATUS_LABELS.shipping_note).toBe('Envio com observação');
    expect(PURCHASE_DELIVERY_STATUS_LABELS.do_not_buy).toBe('Não comprar');
  });
});
