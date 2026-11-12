import type { PurchaseV2 } from './purchase-v2-types';
import { moneyToCents } from './supply-calculations';
import type {
  FinancePurchaseAdjustmentPage,
  FinancePurchaseAdjustmentSnapshot,
} from '../data/finance/finance-purchase-adjustment-repository';

/**
 * Full-page comparison of the SQL adjustment audit with the same immutable
 * adjustment records already validated by applyPurchasePartialAdjustments.
 * Fails closed on missing pages, mismatched cents or invalid history.
 */
export function assertPurchaseAdjustmentParity(
  purchases: PurchaseV2[],
  totals: Pick<FinancePurchaseAdjustmentPage,
    'totalCount' | 'invalidCount' | 'isComplete' | 'grossCents' | 'netCents' | 'refundedCents'>,
  rows: FinancePurchaseAdjustmentSnapshot[],
): void {
  if (!totals.isComplete || totals.invalidCount !== 0) {
    throw new Error('SQL retornou ajustes financeiros que exigem conciliação manual.');
  }
  if (rows.length !== totals.totalCount) {
    throw new Error('A leitura SQL dos ajustes não contém todas as páginas.');
  }
  const expected = new Map(purchases.flatMap((p) =>
    (p.adjustments || []).map((a) => [a.id, { purchase: p, adjustment: a }] as const)));
  if (expected.size !== rows.length) {
    throw new Error('Diferença de quantidade de ajustes entre SQL e sistema atual.');
  }
  const seen = new Set<string>();
  let gross = 0n;
  let net = 0n;
  let refunded = 0n;
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error('Ajuste duplicado no SQL: ' + row.id);
    seen.add(row.id);
    const source = expected.get(row.id);
    if (!source || !row.isValid) {
      throw new Error('Ajuste não conciliado: ' + row.id);
    }
    const { purchase, adjustment: a } = source;
    const payment = purchase.payments.find((p) => p.id === a.paymentId);
    if (!payment ||
      row.purchaseId !== purchase.id ||
      row.referenceCode !== purchase.code ||
      row.orderId !== a.orderId ||
      row.paymentId !== a.paymentId ||
      row.reference !== a.reference ||
      row.refundedOn !== a.refundedOn ||
      row.grossCents !== a.grossCents ||
      row.netCents !== a.netCents ||
      row.refundedCents !== a.refundedCents ||
      row.cancelledCents !== a.cancelledCents ||
      row.freightReductionCents !== a.freightReductionCents ||
      row.residualCents !== a.residualCents ||
      row.entryCount !== a.refundEntries.length ||
      row.refundEntryCents !== a.refundEntries.reduce((s, e) => s + e.amountCents, 0n) ||
      moneyToCents(payment.amount) !== a.netCents ||
      moneyToCents(payment.refundedAmount || '0') !== a.refundedCents) {
      throw new Error('Centavos, histórico ou crédito divergentes em ' + purchase.code +
        ' ajuste ' + row.id);
    }
    gross += row.grossCents;
    net += row.netCents;
    refunded += row.refundedCents;
  }
  if (gross !== totals.grossCents ||
    net !== totals.netCents ||
    refunded !== totals.refundedCents ||
    gross - refunded !== net) {
    throw new Error('Total de ajustes SQL não concilia com os valores do sistema atual.');
  }
}
