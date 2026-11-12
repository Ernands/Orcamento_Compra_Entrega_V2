import type { PurchaseV2 } from './purchase-v2-types';
import type { UnifiedFinancePaymentRow } from './finance-payments';
import { buildUnifiedFinancePayments } from './finance-payments';
import { moneyToCents } from './supply-calculations';
import { purchaseOrderTotalCents } from './purchase-v2-calculations';
import type {
  FinancePurchaseUnscheduledPage, FinancePurchaseUnscheduledRow,
} from '../data/finance/finance-purchase-unscheduled-repository';

/** Complete-page, 1-cent exact comparison with the production finance engine. */
export function assertPurchaseUnscheduledParity(
  purchases: PurchaseV2[],
  result: Pick<FinancePurchaseUnscheduledPage,
    'isComplete' | 'totalCount' | 'unscheduledCents'>,
  rows: FinancePurchaseUnscheduledRow[],
  displayedRows?: UnifiedFinancePaymentRow[],
): void {
  if (!result.isComplete) {
    throw new Error('Projeção SQL sem programação excluiu compras e não pode ser aprovada.');
  }
  if (rows.length !== result.totalCount) {
    throw new Error('Consulta de saldos SQL com páginas faltantes.');
  }
  const legacy = displayedRows || buildUnifiedFinancePayments(purchases, []);
  const expected = legacy.filter((row) =>
    row.status === 'unscheduled' && row.workServiceId === null);
  if (expected.length !== rows.length) {
    throw new Error('Quantidade de saldos sem programação divergente do sistema atual.');
  }
  const expectedById = new Map(expected.map((row) => [row.id, row]));
  const purchasesById = new Map(purchases.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let sum = 0n;
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error('Saldo SQL duplicado: ' + row.id);
    seen.add(row.id);
    const old = expectedById.get(row.id);
    const purchase = purchasesById.get(row.purchaseId);
    const order = purchase?.orders.find((entry) => entry.id === row.orderId);
    if (!old || !purchase || !order || old.amountCents !== row.amountCents ||
        old.referenceCodes[0] !== row.referenceCode ||
        !old.purchaseOrderIds.includes(row.orderId) ||
        !old.purchaseIds.includes(row.purchaseId)) {
      throw new Error('Saldo financeiro SQL difere do cálculo atual: ' + row.id);
    }
    const contracted = purchaseOrderTotalCents(order);
    const linked = purchase.payments.filter((payment) =>
      payment.status !== 'cancelled' && payment.purchaseOrderId === row.orderId)
      .reduce((total, payment) => total + moneyToCents(payment.amount), 0n);
    if (contracted === null || contracted !== row.contractedCents ||
        linked !== row.linkedCents ||
        row.generalAllocatedCents < 0n ||
        row.amountCents !== row.contractedCents - row.linkedCents - row.generalAllocatedCents) {
      throw new Error('Contratação, vinculação ou rateio geral divergente: ' + row.id);
    }
    sum += row.amountCents;
  }
  if (sum !== result.unscheduledCents) {
    throw new Error('Total SQL de saldos sem programação diverge em centavos.');
  }
}
