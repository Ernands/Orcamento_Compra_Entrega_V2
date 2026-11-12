import { buildFinancePaymentEvents } from './finance-calculations';
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
    'isComplete' | 'totalCount' | 'paidCents' | 'plannedCents'>,
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
    if (row.status === 'paid') paidCents += row.amountCents;
    else plannedCents += row.amountCents;
  }

  if (paidCents !== result.paidCents || plannedCents !== result.plannedCents) {
    throw new Error('Divergência de centavos nos totais da projeção financeira.');
  }
}
