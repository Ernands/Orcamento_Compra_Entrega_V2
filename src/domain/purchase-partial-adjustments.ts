import { moneyToCents, quantityToThousandths } from './supply-calculations';
import type { PurchaseV2 } from './purchase-v2-types';

export type PartialAdjustmentLine = {
  line_id: string;
  kind: 'cancelled' | 'freight';
  reduction_cents: number;
  original_line_cents: number;
  original_shipping_cents: number;
};
export type PartialAdjustmentRecord = {
  id: string;
  purchase_id: string;
  order_id: string;
  payment_id: string;
  refund_attachment_id: string;
  original_cents: number;
  cancelled_cents: number;
  freight_reduction_cents: number;
  refund_cents: number;
  remaining_cents: number;
  refunded_on: string;
  reference: string;
  reason: string;
  line_adjustments: PartialAdjustmentLine[];
  created_at: string;
};

export type PurchasePartialAdjustment = {
  id: string;
  orderId: string;
  paymentId: string;
  refundAttachmentId: string;
  grossCents: bigint;
  cancelledCents: bigint;
  freightReductionCents: bigint;
  refundedCents: bigint;
  netCents: bigint;
  refundedOn: string;
  reference: string;
  reason: string;
  createdAt: string;
  cancelledLines: Array<{
    id: string; itemCode: string; itemName: string; originalTotalCents: bigint; originalShippingCents: bigint;
  }>;
  freightLines: Array<{
    id: string; itemCode: string; itemName: string; originalShippingCents: bigint; reductionCents: bigint;
  }>;
};

function decimalFromThousandths(value: bigint): string {
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function toSqlMoney(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/**
 * Applies immutable adjustment records to the read model. The DB source
 * and payment history are NEVER modified. All standard finance views share
 * this returned PurchaseV2 representation, avoiding duplicate deductions.
 */
export function applyPurchasePartialAdjustments(
  purchase: PurchaseV2,
  records: PartialAdjustmentRecord[],
): PurchaseV2 {
  if (!records.length) return purchase;
  const applicable = records.filter((record) => record.purchase_id === purchase.id);
  if (!applicable.length) return purchase;
  const adjustments: PurchasePartialAdjustment[] = [];
  const cancelledByItem = new Map<string, bigint>();
  const originalOrders = new Map(purchase.orders.map((order) => [order.id, order]));
  const originalPayments = new Map(purchase.payments.map((payment) => [payment.id, payment]));
  for (const record of applicable) {
    const order = originalOrders.get(record.order_id);
    const payment = originalPayments.get(record.payment_id);
    if (!order || !payment || payment.status !== 'paid' ||
      payment.purchaseOrderId !== order.id ||
      moneyToCents(payment.amount) !== BigInt(record.original_cents)) {
      throw new Error(`Inconsistência na conciliação da compra ${purchase.code}. Atualize ou confira o histórico.`);
    }
    const lineMap = new Map(order.lines.map((line) => [line.id, line]));
    const seen = new Set<string>();
    let cancelled = 0n;
    let freight = 0n;
    const cancelledLines: PurchasePartialAdjustment['cancelledLines'] = [];
    const freightLines: PurchasePartialAdjustment['freightLines'] = [];
    for (const item of record.line_adjustments) {
      const line = lineMap.get(item.line_id);
      if (!line || seen.has(line.id) || !Number.isSafeInteger(item.reduction_cents) ||
        !Number.isSafeInteger(item.original_line_cents) ||
        !Number.isSafeInteger(item.original_shipping_cents)) {
        throw new Error(`Item inválido no ajuste da compra ${purchase.code}.`);
      }
      seen.add(line.id);
      const lineAmount = moneyToCents(line.lineTotal || '');
      const freightAmount = moneyToCents(line.shippingAmount || '');
      if (lineAmount !== BigInt(item.original_line_cents) ||
        freightAmount !== BigInt(item.original_shipping_cents)) {
        throw new Error(`Histórico da linha ${line.itemCode} não corresponde ao ajuste.`);
      }
      if (item.kind === 'cancelled') {
        if (item.reduction_cents !== item.original_line_cents) {
          throw new Error('Cancelamento exige abatimento do valor integral da linha.');
        }
        cancelled += BigInt(item.reduction_cents);
        if (line.purchaseItemId) {
          cancelledByItem.set(line.purchaseItemId,
            (cancelledByItem.get(line.purchaseItemId) || 0n) + quantityToThousandths(line.quantity));
        }
        cancelledLines.push({
          id: line.id, itemCode: line.itemCode, itemName: line.itemName,
          originalTotalCents: lineAmount, originalShippingCents: freightAmount,
        });
      } else if (item.kind === 'freight') {
        if (item.reduction_cents < 0 || item.reduction_cents > item.original_shipping_cents) {
          throw new Error('Abatimento excede o frete da linha.');
        }
        freight += BigInt(item.reduction_cents);
        freightLines.push({
          id: line.id, itemCode: line.itemCode, itemName: line.itemName,
          originalShippingCents: freightAmount, reductionCents: BigInt(item.reduction_cents),
        });
      } else throw new Error('Tipo de ajuste desconhecido.');
    }
    if (cancelled !== BigInt(record.cancelled_cents) ||
      freight !== BigInt(record.freight_reduction_cents) ||
      cancelled + freight !== BigInt(record.refund_cents) ||
      BigInt(record.original_cents) - BigInt(record.refund_cents) !== BigInt(record.remaining_cents)) {
      throw new Error('Ajuste financeiro não conciliado no banco.');
    }
    const cancelledIds = new Set(cancelledLines.map((line) => line.id));
    const reductions = new Map(freightLines.map((line) => [line.id, line.reductionCents]));
    const currentOrder = purchase.orders.find((entry) => entry.id === order.id)!;
    currentOrder.lines = currentOrder.lines.filter((line) => !cancelledIds.has(line.id)).map((line) => {
      const reduction = reductions.get(line.id) || 0n;
      if (!reduction) return line;
      return {
        ...line,
        shippingAmount: toSqlMoney(moneyToCents(line.shippingAmount || '0') - reduction),
        lineTotal: toSqlMoney(moneyToCents(line.lineTotal || '0') - reduction),
      };
    });
    const currentPayment = purchase.payments.find((entry) => entry.id === payment.id)!;
    currentPayment.grossAmount = payment.amount;
    currentPayment.refundedAmount = toSqlMoney(BigInt(record.refund_cents));
    currentPayment.refundedOn = record.refunded_on;
    currentPayment.amount = toSqlMoney(BigInt(record.remaining_cents));
    adjustments.push({
      id: record.id, orderId: order.id, paymentId: payment.id,
      refundAttachmentId: record.refund_attachment_id,
      grossCents: BigInt(record.original_cents),
      cancelledCents: cancelled, freightReductionCents: freight,
      refundedCents: BigInt(record.refund_cents), netCents: BigInt(record.remaining_cents),
      refundedOn: record.refunded_on, reason: record.reason, reference: record.reference,
      createdAt: record.created_at, cancelledLines, freightLines,
    });
  }
  // Recalculate actual item totals only when a purchase is adjusted,
  // preserving all original approved (quoted) values.
  const activeLines = purchase.orders.filter((order) => order.status === 'active').flatMap((order) => order.lines);
  purchase.items = purchase.items.map((item) => {
    const lines = activeLines.filter((line) => line.purchaseItemId === item.id);
    const amount = lines.reduce((total, line) => total + moneyToCents(line.lineTotal || '0'), 0n);
    const qty = lines.reduce((total, line) => total + quantityToThousandths(line.quantity), 0n);
    return { ...item, actualTotal: toSqlMoney(amount), purchasedQuantity: decimalFromThousandths(qty),
      cancelledQuantity: decimalFromThousandths(cancelledByItem.get(item.id) || 0n) };
  });
  purchase.adjustments = adjustments;
  return purchase;
}
