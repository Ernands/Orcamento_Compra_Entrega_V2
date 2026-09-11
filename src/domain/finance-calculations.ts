import { moneyToCents, quantityToThousandths } from './supply-calculations';
import { formatQuantityV2, purchaseOrderStoreCosts } from './purchase-v2-calculations';
import type { PurchaseAttachmentV2, PurchasePaymentV2, PurchaseV2 } from './purchase-v2-types';
import type {
  FinancePaymentEvent,
  FinanceReimbursement,
  FinanceStorePurchaseRow,
  FinanceStoreRow,
} from './finance-types';

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function financeMonthKey(value: string): string {
  return dateOnly(value).slice(0, 7);
}

export function addCalendarMonths(value: string, months: number): string {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function allocateCents(totalCents: bigint, entries: Array<{ key: string; weight: bigint }>) {
  const positive = entries.filter((entry) => entry.weight > 0n);
  const allocations = new Map<string, bigint>();
  if (!positive.length || totalCents === 0n) return allocations;
  const negative = totalCents < 0n;
  const absoluteTotal = negative ? -totalCents : totalCents;
  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const remainders: Array<{ key: string; remainder: bigint }> = [];
  let allocated = 0n;

  positive.forEach((entry) => {
    const numerator = absoluteTotal * entry.weight;
    const base = numerator / totalWeight;
    allocations.set(entry.key, base);
    allocated += base;
    remainders.push({ key: entry.key, remainder: numerator % totalWeight });
  });

  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.key.localeCompare(b.key) : a.remainder > b.remainder ? -1 : 1,
  );
  let remainder = absoluteTotal - allocated;
  let index = 0;
  while (remainder > 0n) {
    const key = remainders[index % remainders.length].key;
    allocations.set(key, (allocations.get(key) || 0n) + 1n);
    remainder -= 1n;
    index += 1;
  }

  if (negative) {
    allocations.forEach((amount, key) => allocations.set(key, -amount));
  }
  return allocations;
}

function splitInstallments(totalCents: bigint, count: number): bigint[] {
  if (count <= 0 || totalCents <= 0n) return [];
  const allocations = allocateCents(
    totalCents,
    Array.from({ length: count }, (_, index) => ({ key: String(index), weight: 1n })),
  );
  return Array.from({ length: count }, (_, index) => allocations.get(String(index)) || 0n);
}

function paymentAttachments(
  purchase: PurchaseV2,
  payment: PurchasePaymentV2,
): PurchaseAttachmentV2[] {
  return purchase.attachments.filter((attachment) => {
    if (!['payment_proof', 'receipt', 'boleto'].includes(attachment.documentType)) return false;
    return payment.purchaseOrderId
      ? attachment.purchaseOrderId === payment.purchaseOrderId ||
          attachment.purchaseOrderId === null
      : attachment.purchaseOrderId === null;
  });
}

function paymentContext(purchase: PurchaseV2, payment: PurchasePaymentV2) {
  const order = purchase.orders.find((entry) => entry.id === payment.purchaseOrderId);

  if (!order) {
    return {
      itemSummary:
        [...new Set(purchase.items.map((item) => item.itemName))].join(', ') ||
        'Itens nao informados',
      allocationStatus: 'unlinked' as const,
      storeIds: [],
      states: [],
    };
  }

  const itemSummary =
    [...new Set(order.lines.map((line) => line.itemName))].join(', ') || 'Itens nao informados';
  const hasPendingDistribution =
    order.lines.length === 0 ||
    order.lines.some(
      (line) => line.storeDistributionStatus !== 'confirmed' || line.stores.length === 0,
    );

  if (hasPendingDistribution) {
    return {
      itemSummary,
      allocationStatus: 'pending_distribution' as const,
      storeIds: [],
      states: [],
    };
  }

  return {
    itemSummary,
    allocationStatus: 'assigned' as const,
    storeIds: [
      ...new Set(order.lines.flatMap((line) => line.stores.map((store) => store.storeId))),
    ],
    states: [...new Set(order.lines.flatMap((line) => line.stores.map((store) => store.state)))],
  };
}

export function buildFinancePaymentEvents(purchases: PurchaseV2[]): FinancePaymentEvent[] {
  return purchases
    .flatMap((purchase) =>
      purchase.payments.flatMap((payment) => {
        if (payment.status === 'cancelled') return [];
        const context = paymentContext(purchase, payment);
        const attachments = paymentAttachments(purchase, payment);
        const base = {
          paymentId: payment.id,
          purchaseId: purchase.id,
          purchaseOrderId: payment.purchaseOrderId,
          purchaseCode: purchase.code,
          quoteCode: purchase.quoteCode,
          supplierName: purchase.supplierName,
          itemSummary: context.itemSummary,
          allocationStatus: context.allocationStatus,
          storeIds: context.storeIds,
          states: context.states,
          paymentMethod: payment.paymentMethod,
          sourceLabel: payment.sourceLabel,
          attachments,
        };
        const totalCents = moneyToCents(payment.amount);

        if (payment.status === 'paid') {
          const date = dateOnly(payment.paidAt || payment.createdAt);
          return [
            {
              ...base,
              id: `${payment.id}:paid`,
              status: 'paid' as const,
              date,
              month: financeMonthKey(date),
              amountCents: totalCents,
              installmentLabel:
                payment.installmentCount && payment.installmentCount > 1
                  ? `${payment.installmentCount}x · registro quitado`
                  : 'Pagamento realizado',
            },
          ];
        }

        const entryCents = payment.entryAmount ? moneyToCents(payment.entryAmount) : 0n;
        const boundedEntryCents = entryCents > totalCents ? totalCents : entryCents;
        const installments = Math.max(1, payment.installmentCount || 1);
        const firstDueDate = dateOnly(payment.firstDueDate || payment.createdAt);
        const events: FinancePaymentEvent[] = [];

        if (boundedEntryCents > 0n) {
          const entryDate = dateOnly(payment.createdAt);
          events.push({
            ...base,
            id: `${payment.id}:entry`,
            status: 'planned',
            date: entryDate,
            month: financeMonthKey(entryDate),
            amountCents: boundedEntryCents,
            installmentLabel: 'Entrada prevista',
          });
        }

        splitInstallments(totalCents - boundedEntryCents, installments).forEach(
          (amountCents, index) => {
            if (amountCents <= 0n) return;
            const date = addCalendarMonths(firstDueDate, index);
            events.push({
              ...base,
              id: `${payment.id}:installment:${index + 1}`,
              status: 'planned',
              date,
              month: financeMonthKey(date),
              amountCents,
              installmentLabel:
                installments > 1 ? `Parcela ${index + 1}/${installments}` : 'Pagamento previsto',
            });
          },
        );

        return events;
      }),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.purchaseCode.localeCompare(b.purchaseCode, 'pt-BR'),
    );
}

function scopedAttachments(purchase: PurchaseV2, orderId: string, storeId: string) {
  return purchase.attachments.filter((attachment) => {
    const matchesOrder =
      attachment.purchaseOrderId === orderId || attachment.purchaseOrderId === null;
    const matchesStore =
      attachment.stores.length === 0 ||
      attachment.stores.some((store) => store.storeId === storeId);
    return matchesOrder && matchesStore;
  });
}

function reimbursementAmounts(
  reimbursements: FinanceReimbursement[],
  storeId: string,
  purchaseId: string,
  purchaseOrderId: string,
) {
  let requestedCents = 0n;
  let approvedCents = 0n;
  let receivedCents = 0n;
  let reservedCents = 0n;
  reimbursements.forEach((reimbursement) => {
    if (
      reimbursement.storeId !== storeId ||
      ['rejected', 'cancelled'].includes(reimbursement.status)
    )
      return;
    reimbursement.items.forEach((item) => {
      if (item.purchaseId !== purchaseId || item.purchaseOrderId !== purchaseOrderId) return;
      requestedCents += moneyToCents(item.requestedAmount);
      approvedCents += moneyToCents(item.approvedAmount);
      receivedCents += moneyToCents(item.receivedAmount);
      reservedCents += ['approved', 'partial', 'received'].includes(reimbursement.status)
        ? moneyToCents(item.approvedAmount)
        : moneyToCents(item.requestedAmount);
    });
  });
  return { requestedCents, approvedCents, receivedCents, reservedCents };
}

export function buildFinanceStoreRows(
  purchases: PurchaseV2[],
  reimbursements: FinanceReimbursement[],
): FinanceStoreRow[] {
  const storeRows = new Map<string, FinanceStoreRow>();

  purchases.forEach((purchase) => {
    purchase.orders
      .filter((order) => order.status === 'active')
      .forEach((order) => {
        const costs = purchaseOrderStoreCosts(order);
        const costWeights = costs.rows.map((store) => ({
          key: store.storeId,
          weight: store.costCents > 0n ? store.costCents : 0n,
        }));
        const paidAllocations = new Map<string, bigint>();
        const plannedAllocations = new Map<string, bigint>();

        purchase.payments
          .filter(
            (payment) => payment.purchaseOrderId === order.id && payment.status !== 'cancelled',
          )
          .forEach((payment) => {
            const allocation = allocateCents(moneyToCents(payment.amount), costWeights);
            allocation.forEach((amount, storeId) => {
              const target = payment.status === 'paid' ? paidAllocations : plannedAllocations;
              target.set(storeId, (target.get(storeId) || 0n) + amount);
            });
          });

        costs.rows.forEach((cost) => {
          const store = purchase.stores.find((entry) => entry.storeId === cost.storeId);
          if (!store) return;
          const paidCents = paidAllocations.get(store.storeId) || 0n;
          const plannedCents = plannedAllocations.get(store.storeId) || 0n;
          const reimbursement = reimbursementAmounts(
            reimbursements,
            store.storeId,
            purchase.id,
            order.id,
          );
          const eligibleCents = paidCents < cost.costCents ? paidCents : cost.costCents;
          const availableCents =
            eligibleCents > reimbursement.reservedCents
              ? eligibleCents - reimbursement.reservedCents
              : 0n;
          const purchaseRow: FinanceStorePurchaseRow = {
            id: `${store.storeId}:${purchase.id}:${order.id}`,
            storeId: store.storeId,
            purchaseId: purchase.id,
            purchaseOrderId: order.id,
            purchaseCode: purchase.code,
            quoteCode: purchase.quoteCode,
            supplierName: purchase.supplierName,
            purchasedOn: order.purchasedOn,
            supplierOrderRef: order.supplierOrderRef,
            itemSummary: [...new Set(cost.lines.map((line) => line.itemName))].join(', '),
            quantityLabel: cost.lines
              .map((line) => `${formatQuantityV2(line.quantity)} ${line.unit}`)
              .join(' + '),
            realizedCents: cost.costCents,
            paidCents,
            plannedCents,
            requestedCents: reimbursement.requestedCents,
            approvedCents: reimbursement.approvedCents,
            receivedCents: reimbursement.receivedCents,
            eligibleCents,
            availableCents,
            attachments: scopedAttachments(purchase, order.id, store.storeId),
            purchase,
          };
          const current = storeRows.get(store.storeId) || {
            storeId: store.storeId,
            code: store.code,
            name: store.name,
            city: store.city,
            state: store.state,
            realizedCents: 0n,
            paidCents: 0n,
            plannedCents: 0n,
            requestedCents: 0n,
            approvedCents: 0n,
            receivedCents: 0n,
            eligibleCents: 0n,
            availableCents: 0n,
            purchases: [],
          };
          current.realizedCents += purchaseRow.realizedCents;
          current.paidCents += purchaseRow.paidCents;
          current.plannedCents += purchaseRow.plannedCents;
          current.requestedCents += purchaseRow.requestedCents;
          current.approvedCents += purchaseRow.approvedCents;
          current.receivedCents += purchaseRow.receivedCents;
          current.eligibleCents += purchaseRow.eligibleCents;
          current.availableCents += purchaseRow.availableCents;
          current.purchases.push(purchaseRow);
          storeRows.set(store.storeId, current);
        });
      });
  });

  return [...storeRows.values()]
    .map((row) => ({
      ...row,
      purchases: row.purchases.sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn)),
    }))
    .sort(
      (a, b) => a.state.localeCompare(b.state, 'pt-BR') || a.code.localeCompare(b.code, 'pt-BR'),
    );
}

export function reimbursementTotals(reimbursement: FinanceReimbursement) {
  return reimbursement.items.reduce(
    (totals, item) => {
      totals.eligibleCents += moneyToCents(item.eligibleAmount);
      totals.requestedCents += moneyToCents(item.requestedAmount);
      totals.approvedCents += moneyToCents(item.approvedAmount);
      totals.receivedCents += moneyToCents(item.receivedAmount);
      return totals;
    },
    { eligibleCents: 0n, requestedCents: 0n, approvedCents: 0n, receivedCents: 0n },
  );
}

export function paymentQuantityTotal(purchase: PurchaseV2, orderId: string): bigint {
  const order = purchase.orders.find((entry) => entry.id === orderId);
  return order?.lines.reduce((sum, line) => sum + quantityToThousandths(line.quantity), 0n) || 0n;
}
