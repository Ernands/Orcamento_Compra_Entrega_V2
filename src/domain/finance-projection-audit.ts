import { buildFinancePaymentEvents } from './finance-calculations';
import {
  buildUnifiedFinancePayments,
  financePaymentTotals,
  scopeFinancePaymentsByStores,
  type UnifiedFinancePaymentRow,
} from './finance-payments';
import { moneyToCents } from './supply-calculations';
import { purchaseOrderTotalCents } from './purchase-v2-calculations';
import type { PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';

export type FinanceAuditStage = 1 | 2 | 3 | 4;
export interface FinanceAuditCheck {
  stage: FinanceAuditStage;
  title: string;
  checked: number;
  issues: string[];
  warnings: string[];
  passed: boolean;
}
export interface FinanceAuditReport {
  passed: boolean;
  checkedAt: string;
  purchaseCount: number;
  workCount: number;
  paymentRows: number;
  paidCents: bigint;
  plannedCents: bigint;
  unscheduledCents: bigint;
  checks: FinanceAuditCheck[];
}

const ORIGINS = ['equipment', 'furniture', 'works'] as const;
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);
const unique = (values: string[]) => [...new Set(values)];
const MAX_ISSUES = 30;
const record = (issues: string[], message: string) => {
  if (issues.length < MAX_ISSUES) issues.push(message);
};
const makeCheck = (stage: FinanceAuditStage, title: string): FinanceAuditCheck => ({
  stage, title, checked: 0, issues: [], warnings: [], passed: true,
});

/**
 * Read-only shadow audit of the EXISTING finance calculation. Checks independent
 * source-payment and refund conservation, allocation invariants and the way
 * separate CMP events are consolidated. It does NOT claim SQL replacement parity:
 * that check is performed separately by assertPurchaseEventParity.
 *
 * No SQL writes, no storage mutations, no changes to official finance totals.
 */
export function auditUnifiedFinanceProjection(
  purchases: PurchaseV2[],
  works: WorkService[],
  sourceRows: UnifiedFinancePaymentRow[] = buildUnifiedFinancePayments(purchases, works),
  checkedAt = new Date().toISOString(),
): FinanceAuditReport {
  const checks = [
    makeCheck(1, 'Parcelamentos e eventos financeiros'),
    makeCheck(2, 'Cancelamentos, fretes e reembolsos'),
    makeCheck(3, 'Rateio em centavos por loja e origem'),
    makeCheck(4, 'Consolidação entre compras e compromisso'),
  ];
  const [schedule, adjustments, stores, combined] = checks;

  // The source engine exposes an event for each paid payment and one or more
  // planned events for entry/installments. Compare against the FINAL rows after
  // combined-CMP merging without reusing the final rows as the oracle.
  const allEvents = buildFinancePaymentEvents(purchases);
  const events = new Map(allEvents.map((event) => ['purchase:' + event.id, event]));
  const consumed = new Set<string>();
  const sourceEventAmounts = new Map<string, bigint>();
  const sourceEventRefunds = new Map<string, bigint>();
  const sourceCodesByRow = new Map<string, string[]>();
  const purchaseRows = sourceRows.filter((row) => row.workServiceId === null && row.status !== 'unscheduled');
  let combinedRowCount = 0;

  for (const row of purchaseRows) {
    const ids = row.id.startsWith('combined:') ? row.id.slice(9).split('|') : [row.id];
    if (row.id.startsWith('combined:')) combinedRowCount += 1;
    const sourceEvents = ids.map((id) => events.get(id));

    for (const id of ids) {
      schedule.checked += 1;
      if (consumed.has(id)) record(schedule.issues, 'Evento repetido na consolidação: ' + id);
      consumed.add(id);
      if (!events.has(id)) record(schedule.issues, 'Evento sem origem na compra: ' + id);
    }
    if (sourceEvents.some((event) => !event)) continue;
    const completeEvents = sourceEvents.filter((event): event is NonNullable<typeof event> => Boolean(event));
    const amount = sum(completeEvents.map((event) => event.amountCents));
    const codeList = unique(completeEvents.map((event) => event.purchaseCode)).sort();
    sourceCodesByRow.set(row.id, codeList);
    if (row.amountCents !== amount) {
      record(schedule.issues, 'Centavos divergentes em ' + row.id + ': eventos=' +
        amount + ', tela=' + row.amountCents);
    }
    if (completeEvents.some((event) => event.status !== row.status ||
        event.date !== row.date)) {
      record(schedule.issues, 'Status ou vencimento divergente em ' + row.id);
    }
    if (row.id.startsWith('combined:') &&
        JSON.stringify([...row.referenceCodes].sort()) !== JSON.stringify(codeList)) {
      record(combined.issues, 'Compras combinadas com referências incorretas: ' + row.id);
    }
    completeEvents.forEach((event) => {
      sourceEventAmounts.set(event.paymentId,
        (sourceEventAmounts.get(event.paymentId) || 0n) + event.amountCents);
    });
  }
  if (consumed.size !== events.size) {
    const missing = [...events.keys()].filter((id) => !consumed.has(id));
    record(schedule.issues, 'Eventos de Compras ausentes: ' + missing.slice(0, 5).join(', '));
  }

  // Independent of the event grouping, the net event amounts must reconcile
  // exactly with each registered non-cancelled payment.
  purchases.forEach((purchase) => {
    purchase.payments.filter((payment) => payment.status !== 'cancelled')
      .forEach((payment) => {
        schedule.checked += 1;
        const actual = sourceEventAmounts.get(payment.id) || 0n;
        const expected = moneyToCents(payment.amount);
        if (actual !== expected) {
          record(schedule.issues, purchase.code + ' pagamento ' + payment.id +
            ': parcelas somam ' + actual + ' centavos, registro ' + expected);
        }
      });
  });

  for (const purchase of purchases) {
    const paid = purchase.payments.filter((payment) => payment.status === 'paid');
    const eachRefund = new Map(paid.map((payment) =>
      [payment.id, moneyToCents(payment.refundedAmount || '0')]));
    const rowRefunds = new Map<string, bigint>();

    purchaseRows.filter((row) => row.purchaseIds.includes(purchase.id)).forEach((row) => {
      // Combined rows can contain other CMPs: aggregate once per row globally
      // below; never attribute the entire combined refund to each CMP.
      if (row.purchaseIds.length === 1) {
        row.paymentIds.forEach((paymentId) =>
          rowRefunds.set(paymentId, (rowRefunds.get(paymentId) || 0n) +
            (row.paymentIds.length === 1 ? (row.refundCents || 0n) : 0n)));
      }
    });

    for (const payment of paid) {
      adjustments.checked += 1;
      const net = moneyToCents(payment.amount);
      const refunded = eachRefund.get(payment.id) || 0n;
      if (payment.grossAmount !== undefined &&
        moneyToCents(payment.grossAmount) !== net + refunded) {
        record(adjustments.issues, purchase.code + ' - pagamento bruto não reconcilia com líquido + crédito');
      }
      if (payment.refundEntries?.length &&
        sum(payment.refundEntries.map((entry) => entry.amountCents)) !== refunded) {
        record(adjustments.issues, purchase.code + ' - créditos detalhados não fecham com reembolso');
      }
      if (rowRefunds.has(payment.id) && rowRefunds.get(payment.id) !== refunded) {
        record(adjustments.issues, purchase.code + ' - reembolso difere do evento financeiro');
      }
    }

    for (const adjustment of purchase.adjustments || []) {
      adjustments.checked += 1;
      if (adjustment.grossCents - adjustment.refundedCents !== adjustment.netCents ||
          adjustment.cancelledCents + adjustment.freightReductionCents !== adjustment.refundedCents) {
        record(adjustments.issues, purchase.code + ' ajuste ' + adjustment.id +
          ': valores históricos de cancelamento, frete e crédito divergentes');
      }
      if (adjustment.refundEntries.length > 0 &&
        sum(adjustment.refundEntries.map((entry) => entry.amountCents)) !== adjustment.refundedCents) {
        record(adjustments.issues, purchase.code + ' ajuste ' + adjustment.id +
          ': créditos por item não conciliados');
      }
      const payment = purchase.payments.find((entry) => entry.id === adjustment.paymentId);
      if (!payment || payment.status !== 'paid' ||
          moneyToCents(payment.amount) !== adjustment.netCents ||
          moneyToCents(payment.refundedAmount || '0') !== adjustment.refundedCents) {
        record(adjustments.issues, purchase.code + ' ajuste ' + adjustment.id +
          ': registro de pagamento líquido incompatível');
      }
    }
  }

  // Global refund conservation works also for combined CMP rows. Each paid
  // payment appears in exactly one paid event, even when multiple CMPs merge.
  const expectedRefundCents = sum(purchases.flatMap((purchase) =>
    purchase.payments.filter((payment) => payment.status === 'paid')
      .map((payment) => moneyToCents(payment.refundedAmount || '0'))));
  const actualRefundCents = sum(purchaseRows.filter((row) => row.status === 'paid')
    .map((row) => row.refundCents || 0n));
  if (expectedRefundCents !== actualRefundCents) {
    record(adjustments.issues, 'Créditos líquidos das CMPs não conservados: esperado=' +
      expectedRefundCents + ', financeiro=' + actualRefundCents);
  }

  sourceRows.forEach((row) => {
    stores.checked += 1;
    const allocated = sum(row.storeAllocations.map((item) => item.amountCents));
    if (allocated + row.unallocatedCents !== row.amountCents) {
      record(stores.issues, row.id + ' - rateio + não distribuído difere do lançamento');
    }
    const totals = ORIGINS.map((origin) => row.originAllocations[origin]);
    const originTotal = sum(totals);
    if (originTotal !== row.amountCents) {
      // Some legacy purchases have no active lines/origin weights. Do not call
      // such a source-only row a "matched" fully allocated record.
      if (originTotal === 0n && row.amountCents > 0n) {
        if (stores.warnings.length < MAX_ISSUES)
          stores.warnings.push(row.id + ' sem composição por origem (linha de compra incompleta)');
      } else record(stores.issues, row.id + ' - composição por origem não fecha em centavos');
    }
    if (unique(row.storeAllocations.map((entry) => entry.storeId)).length !==
        row.storeAllocations.length) {
      record(stores.issues, row.id + ' - loja duplicada no rateio');
    }
    row.storeAllocations.forEach((allocation) => {
      const originByStore = sum(ORIGINS.map((origin) => allocation.originAllocations[origin]));
      if (allocation.amountCents !== originByStore) {
        record(stores.issues, row.id + ' - origem por loja não fecha: ' + allocation.storeId);
      }
      if (allocation.amountCents > 0n) {
        const scoped = scopeFinancePaymentsByStores([row], [allocation.storeId]);
        if (scoped.length !== 1 || scoped[0].amountCents !== allocation.amountCents) {
          record(stores.issues, row.id + ' - filtro por loja mudou os centavos: ' + allocation.storeId);
        }
      }
    });
  });

  combined.checked = purchaseRows.length;
  combined.checked += combinedRowCount;
  for (const row of sourceRows) {
    if (!row.id.startsWith('combined:')) continue;
    const eventIds = row.id.slice(9).split('|');
    const expectedRefs = sourceCodesByRow.get(row.id) || [];
    if (row.purchaseIds.length !== expectedRefs.length ||
        row.referenceCodes.length !== expectedRefs.length ||
        eventIds.length < 2) {
      record(combined.issues, 'CMPs combinadas inconsistentes: ' + row.id);
    }
  }

  // Verify one-order residuals independently of the display builder. For
  // general/unlinked payments, weighted distribution is covered by fixtures.
  for (const purchase of purchases) {
    if (purchase.status === 'cancelled' || purchase.status === 'returned') continue;
    const hasUnlinked = purchase.payments.some((payment) =>
      payment.status !== 'cancelled' && !payment.purchaseOrderId);
    if (hasUnlinked) {
      combined.warnings.push(purchase.code + ' - pagamento geral: exige conferência por rateio entre pedidos');
      continue;
    }
    for (const order of purchase.orders.filter((entry) => entry.status === 'active')) {
      const contracted = purchaseOrderTotalCents(order);
      if (contracted === null || contracted <= 0n) continue;
      combined.checked += 1;
      const registered = sum(purchase.payments.filter((payment) =>
        payment.status !== 'cancelled' && payment.purchaseOrderId === order.id)
        .map((payment) => moneyToCents(payment.amount)));
      const expectedResidual = contracted > registered ? contracted - registered : 0n;
      const actualResidual = sum(sourceRows.filter((row) =>
        row.id === 'purchase-unscheduled:' + purchase.id + ':' + order.id)
        .map((row) => row.amountCents));
      if (expectedResidual !== actualResidual) {
        record(combined.issues, purchase.code + ' - saldo não programado difere no pedido ' + order.id);
      }
    }
  }

  const totals = financePaymentTotals(sourceRows);
  if (totals.paidCents + totals.plannedCents + totals.unscheduledCents !== totals.commitmentCents) {
    record(combined.issues, 'Compromisso não corresponde à soma dos três status financeiros');
  }
  checks.forEach((check) => { check.passed = check.issues.length === 0; });

  return {
    passed: checks.every((check) => check.passed),
    checkedAt,
    purchaseCount: purchases.length,
    workCount: works.length,
    paymentRows: sourceRows.length,
    paidCents: totals.paidCents,
    plannedCents: totals.plannedCents,
    unscheduledCents: totals.unscheduledCents,
    checks,
  };
}
