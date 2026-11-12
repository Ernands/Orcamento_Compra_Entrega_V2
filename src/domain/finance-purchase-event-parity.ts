import { buildFinancePaymentEvents } from './finance-calculations';
import { moneyToCents } from './supply-calculations';
import type { PurchaseV2 } from './purchase-v2-types';
import type { FinancePurchaseEventsPage, FinancePurchaseEvent } from '../data/finance/finance-purchase-events-repository';

/**
 * Checks unfiltered complete server projection against the existing domain.
 * Receives ALL server pages (not just the currently visible page).
 * Never changes official financial totals or data.
 */
export function assertPurchaseEventParity(
  purchases: PurchaseV2[],
  result: Pick<FinancePurchaseEventsPage,
    'isComplete' | 'totalCount' | 'paidCents' | 'plannedCents' | 'grossPaidCents' | 'refundedCents'>,
  rows: FinancePurchaseEvent[],
): void {
  if (!result.isComplete) {
    throw new Error('Não é possível conferir paridade de uma projeção de Compras incompleta.');
  }
  if (rows.length !== result.totalCount) {
    throw new Error('Conferência incompleta: nem todas as páginas foram carregadas.');
  }
  const expected = buildFinancePaymentEvents(purchases);
  if (expected.length !== rows.length) {
    throw new Error('Divergência de quantidade de eventos financeiros de Compras.');
  }
  const expectedById = new Map(expected.map((event) => ['purchase:' + event.id, event]));
  const seen = new Set<string>();
  let paidCents = 0n;
  let plannedCents = 0n;
  let grossPaidCents = 0n;
  let refundedCents = 0n;
  const payments = new Map(purchases.flatMap((purchase) =>
    purchase.payments.map((payment) => [payment.id, payment] as const)));

  for (const row of rows) {
    if (seen.has(row.id)) throw new Error('Evento financeiro duplicado: ' + row.id);
    seen.add(row.id);
    const old = expectedById.get(row.id);
    if (!old || old.paymentId !== row.paymentId ||
        old.purchaseId !== row.purchaseId ||
        old.purchaseOrderId !== row.orderId ||
        old.purchaseCode !== row.referenceCode ||
        old.supplierName !== row.counterpart ||
        old.status !== row.status ||
        old.date !== row.date ||
        old.amountCents !== row.amountCents ||
        old.paymentMethod !== row.paymentMethod ||
        old.sourceLabel !== row.sourceLabel ||
        old.installmentLabel !== row.installmentLabel) {
      throw new Error('Divergência de paridade no evento financeiro: ' + row.id);
    }
    if (row.status === 'paid') {
      const payment = payments.get(row.paymentId);
      const refund = moneyToCents(payment?.refundedAmount || '0');
      if (row.refundCents === undefined || row.grossAmountCents === undefined ||
        row.refundCents !== refund ||
        row.grossAmountCents !== row.amountCents + refund ||
        (payment?.grossAmount !== undefined &&
          row.grossAmountCents !== moneyToCents(payment.grossAmount))) {
        throw new Error('Histórico bruto-líquido SQL divergente em ' + row.id);
      }
      paidCents += row.amountCents;
      grossPaidCents += row.grossAmountCents;
      refundedCents += refund;
    } else {
      if (row.refundCents !== 0n || row.grossAmountCents !== row.amountCents) {
        throw new Error('Evento programado SQL contém crédito ou bruto inconsistente.');
      }
      plannedCents += row.amountCents;
    }
  }

  if (paidCents !== result.paidCents ||
    plannedCents !== result.plannedCents ||
    grossPaidCents !== result.grossPaidCents ||
    refundedCents !== result.refundedCents ||
    grossPaidCents - refundedCents !== paidCents) {
    throw new Error('Divergência de centavos nos totais da projeção financeira.');
  }
}
