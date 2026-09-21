import { buildFinancePaymentEvents } from './finance-calculations';
import { financeItemCompositionGroup } from './finance-overview';
import { moneyToCents, quantityToThousandths } from './supply-calculations';
import type { PurchaseOrderV2, PurchasePaymentV2, PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';

export type FinancePaymentsView = 'paid' | 'planned' | 'unscheduled';
export type FinancePaymentOrigin = 'equipment' | 'furniture' | 'general' | 'works';

export const FINANCE_PAYMENT_ORIGIN_LABELS: Record<FinancePaymentOrigin, string> = {
  equipment: 'Equipamentos',
  furniture: 'Mobiliário',
  general: 'Itens gerais',
  works: 'Obras e Serviços',
};

export interface UnifiedFinancePaymentRow {
  id: string;
  status: FinancePaymentsView;
  date: string | null;
  originAllocations: Record<FinancePaymentOrigin, bigint>;
  referenceCodes: string[];
  purchaseIds: string[];
  workServiceId: string | null;
  supplyItemIds: string[];
  supplierName: string;
  description: string;
  paymentMethod: string | null;
  sourceLabel: string | null;
  installmentLabel: string;
  amountCents: bigint;
  storeIds: string[];
  storeCodes: string[];
  states: string[];
  notes: string | null;
}

export interface FinancePaymentOriginSummary {
  origin: FinancePaymentOrigin;
  label: string;
  paidCents: bigint;
  plannedCents: bigint;
  unscheduledCents: bigint;
  commitmentCents: bigint;
}

export interface FinancePaymentTotals {
  paidCents: bigint;
  plannedCents: bigint;
  unscheduledCents: bigint;
  commitmentCents: bigint;
}

const ORIGINS: FinancePaymentOrigin[] = ['equipment', 'furniture', 'general', 'works'];

function emptyAllocations(): Record<FinancePaymentOrigin, bigint> {
  return { equipment: 0n, furniture: 0n, general: 0n, works: 0n };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function orderLineTotalCents(line: PurchaseOrderV2['lines'][number]): bigint {
  if (line.lineTotal !== null) return moneyToCents(line.lineTotal);
  const quantity = quantityToThousandths(line.quantity);
  const subtotal = (quantity * moneyToCents(line.unitPrice) + 500n) / 1000n;
  return (
    subtotal -
    moneyToCents(line.discountAmount || '0') +
    moneyToCents(line.shippingAmount || '0') +
    moneyToCents(line.otherCosts || '0')
  );
}

function allocateCents(
  totalCents: bigint,
  weights: Array<{ key: FinancePaymentOrigin; weight: bigint }>,
): Record<FinancePaymentOrigin, bigint> {
  const result = emptyAllocations();
  const positive = weights.filter((entry) => entry.weight > 0n);
  if (totalCents <= 0n || positive.length === 0) return result;

  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const interim = positive.map((entry) => {
    const numerator = totalCents * entry.weight;
    return {
      ...entry,
      base: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  let remaining = totalCents - interim.reduce((sum, entry) => sum + entry.base, 0n);
  interim
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.key.localeCompare(b.key)
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .forEach((entry) => {
      result[entry.key] += entry.base + (remaining > 0n ? 1n : 0n);
      if (remaining > 0n) remaining -= 1n;
    });
  return result;
}

function groupWeightsForOrders(purchase: PurchaseV2, orders: PurchaseOrderV2[]) {
  const weights = new Map<FinancePaymentOrigin, bigint>();
  const itemIds = new Set<string>();

  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const item = line.purchaseItemId
        ? purchase.items.find((entry) => entry.id === line.purchaseItemId)
        : null;
      if (item?.supplyItemId) itemIds.add(item.supplyItemId);
      const group = financeItemCompositionGroup(
        item?.itemCategory || null,
        item?.catalogSubcategory || null,
        item?.catalogGroupName || null,
        item?.itemName || line.itemName,
        item?.catalogFinancialGroup || null,
      );
      weights.set(group, (weights.get(group) || 0n) + orderLineTotalCents(line));
    });
  });

  return {
    weights: [...weights.entries()].map(([key, weight]) => ({ key, weight })),
    supplyItemIds: [...itemIds],
  };
}

function paymentNotes(purchase: PurchaseV2, paymentId: string): string | null {
  return purchase.payments.find((payment) => payment.id === paymentId)?.notes || null;
}

function purchasePaymentRow(
  purchase: PurchaseV2,
  event: ReturnType<typeof buildFinancePaymentEvents>[number],
): UnifiedFinancePaymentRow {
  const orders = event.purchaseOrderId
    ? purchase.orders.filter((order) => order.id === event.purchaseOrderId)
    : purchase.orders.filter((order) => order.status === 'active');
  const groupContext = groupWeightsForOrders(purchase, orders);
  const notes = paymentNotes(purchase, event.paymentId);
  const fallbackStores = purchase.stores;
  const storeIds = event.storeIds.length ? event.storeIds : fallbackStores.map((store) => store.storeId);
  const states = event.states.length ? event.states : unique(fallbackStores.map((store) => store.state));
  const storeCodes = unique(
    fallbackStores.filter((store) => storeIds.includes(store.storeId)).map((store) => store.code),
  );
  const sourceInstallment =
    event.sourceLabel && /\b\d+\s*\/\s*\d+\b/.test(event.sourceLabel)
      ? event.sourceLabel
      : event.installmentLabel;

  return {
    id: `purchase:${event.id}`,
    status: event.status,
    date: event.date,
    originAllocations: allocateCents(event.amountCents, groupContext.weights),
    referenceCodes: [event.purchaseCode],
    purchaseIds: [purchase.id],
    workServiceId: null,
    supplyItemIds: groupContext.supplyItemIds,
    supplierName: event.supplierName,
    description: event.itemSummary,
    paymentMethod: event.paymentMethod,
    sourceLabel: event.sourceLabel,
    installmentLabel: sourceInstallment,
    amountCents: event.amountCents,
    storeIds: unique(storeIds),
    storeCodes,
    states: unique(states),
    notes,
  };
}

function isCombinedPurchasePayment(row: UnifiedFinancePaymentRow): boolean {
  const normalized = (row.notes || '').toLocaleLowerCase('pt-BR');
  return normalized.includes('compra única') || normalized.includes('parcela combinada');
}

function mergeRows(rows: UnifiedFinancePaymentRow[]): UnifiedFinancePaymentRow {
  const first = rows[0];
  const allocations = emptyAllocations();
  rows.forEach((row) => {
    ORIGINS.forEach((origin) => {
      allocations[origin] += row.originAllocations[origin];
    });
  });
  return {
    ...first,
    id: `combined:${rows.map((row) => row.id).sort().join('|')}`,
    originAllocations: allocations,
    referenceCodes: unique(rows.flatMap((row) => row.referenceCodes)).sort(),
    purchaseIds: unique(rows.flatMap((row) => row.purchaseIds)),
    supplyItemIds: unique(rows.flatMap((row) => row.supplyItemIds)),
    description: unique(rows.map((row) => row.description)).join(' + '),
    amountCents: rows.reduce((sum, row) => sum + row.amountCents, 0n),
    storeIds: unique(rows.flatMap((row) => row.storeIds)),
    storeCodes: unique(rows.flatMap((row) => row.storeCodes)).sort(),
    states: unique(rows.flatMap((row) => row.states)).sort(),
  };
}

function consolidatePurchaseRows(rows: UnifiedFinancePaymentRow[]): UnifiedFinancePaymentRow[] {
  const result: UnifiedFinancePaymentRow[] = [];
  const grouped = new Map<string, UnifiedFinancePaymentRow[]>();

  rows.forEach((row) => {
    if (!isCombinedPurchasePayment(row)) {
      result.push(row);
      return;
    }
    const key = [
      row.status,
      row.date || '',
      row.supplierName,
      row.paymentMethod || '',
      row.sourceLabel || '',
    ].join('|');
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  grouped.forEach((entries) => result.push(entries.length > 1 ? mergeRows(entries) : entries[0]));
  return result;
}

function activeOrderTotals(purchase: PurchaseV2) {
  const orders = purchase.orders.filter((order) => order.status === 'active');
  return orders.map((order) => ({
    order,
    totalCents: order.lines.reduce((sum, line) => sum + orderLineTotalCents(line), 0n),
  }));
}

function genericPaymentAllocations(
  payments: PurchasePaymentV2[],
  orders: Array<{ order: PurchaseOrderV2; totalCents: bigint }>,
) {
  const activeGeneralCents = payments
    .filter((payment) => payment.status !== 'cancelled' && !payment.purchaseOrderId)
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  if (activeGeneralCents <= 0n) return new Map<string, bigint>();

  const weights = orders.filter((entry) => entry.totalCents > 0n);
  const totalWeight = weights.reduce((sum, entry) => sum + entry.totalCents, 0n);
  const result = new Map<string, bigint>();
  if (totalWeight <= 0n) return result;

  const interim = weights.map((entry) => {
    const numerator = activeGeneralCents * entry.totalCents;
    return {
      id: entry.order.id,
      base: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  let remaining = activeGeneralCents - interim.reduce((sum, entry) => sum + entry.base, 0n);
  interim
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id.localeCompare(b.id)
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .forEach((entry) => {
      result.set(entry.id, entry.base + (remaining > 0n ? 1n : 0n));
      if (remaining > 0n) remaining -= 1n;
    });
  return result;
}

function purchaseUnscheduledRows(purchase: PurchaseV2): UnifiedFinancePaymentRow[] {
  if (['returned', 'cancelled'].includes(purchase.status)) return [];
  const orders = activeOrderTotals(purchase);
  const genericAllocations = genericPaymentAllocations(purchase.payments, orders);

  return orders.flatMap(({ order, totalCents }) => {
    if (totalCents <= 0n) return [];
    const linkedPayments = purchase.payments
      .filter(
        (payment) =>
          payment.status !== 'cancelled' && payment.purchaseOrderId === order.id,
      )
      .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
    const registered = linkedPayments + (genericAllocations.get(order.id) || 0n);
    const residual = totalCents > registered ? totalCents - registered : 0n;
    if (residual <= 0n) return [];

    const context = groupWeightsForOrders(purchase, [order]);
    const stores = unique(order.lines.flatMap((line) => line.stores.map((store) => store.storeId)));
    const fallbackStores = purchase.stores;
    const storeIds = stores.length ? stores : fallbackStores.map((store) => store.storeId);
    const storeCodes = unique(
      order.lines.flatMap((line) => line.stores.map((store) => store.code)),
    );
    const states = unique(
      order.lines.flatMap((line) => line.stores.map((store) => store.state)),
    );

    return [
      {
        id: `purchase-unscheduled:${purchase.id}:${order.id}`,
        status: 'unscheduled' as const,
        date: null,
        originAllocations: allocateCents(residual, context.weights),
        referenceCodes: [purchase.code],
        purchaseIds: [purchase.id],
        workServiceId: null,
        supplyItemIds: context.supplyItemIds,
        supplierName: purchase.supplierName,
        description:
          unique(order.lines.map((line) => line.itemName)).join(', ') || 'Itens da compra',
        paymentMethod: null,
        sourceLabel: null,
        installmentLabel: 'Saldo sem programação',
        amountCents: residual,
        storeIds: unique(storeIds),
        storeCodes: storeCodes.length
          ? storeCodes
          : unique(fallbackStores.filter((store) => storeIds.includes(store.storeId)).map((store) => store.code)),
        states: states.length
          ? states
          : unique(fallbackStores.filter((store) => storeIds.includes(store.storeId)).map((store) => store.state)),
        notes: 'Saldo da compra ainda sem pagamento programado.',
      },
    ];
  });
}

function workPaymentRows(work: WorkService): UnifiedFinancePaymentRow[] {
  if (work.status === 'cancelled') return [];

  const paymentRows: UnifiedFinancePaymentRow[] = work.payments.flatMap((payment) => {
    if (payment.status === 'cancelled') return [];
    const paid = payment.status === 'paid';
    const date = (paid ? payment.paidAt : payment.dueDate)?.slice(0, 10) || null;
    const amountCents = moneyToCents(payment.amount);
    return [
      {
        id: `work:${payment.id}`,
        status: paid ? ('paid' as const) : ('planned' as const),
        date,
        originAllocations: {
          equipment: 0n,
          furniture: 0n,
          general: 0n,
          works: amountCents,
        },
        referenceCodes: [work.code],
        purchaseIds: [],
        workServiceId: work.id,
        supplyItemIds: [],
        supplierName: work.providerName || 'Prestador não informado',
        description: `${work.category} · ${work.description}`,
        paymentMethod: payment.paymentMethod,
        sourceLabel: payment.sourceLabel || payment.label,
        installmentLabel: payment.label || (paid ? 'Pagamento realizado' : 'Pagamento previsto'),
        amountCents,
        storeIds: [work.storeId],
        storeCodes: [work.storeCode],
        states: [work.storeState],
        notes: payment.notes,
      },
    ];
  });

  const registered = work.payments
    .filter((payment) => payment.status !== 'cancelled')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const contracted = moneyToCents(work.contractedAmount);
  const residual = contracted > registered ? contracted - registered : 0n;

  if (residual > 0n) {
    paymentRows.push({
      id: `work-unscheduled:${work.id}`,
      status: 'unscheduled',
      date: null,
      originAllocations: {
        equipment: 0n,
        furniture: 0n,
        general: 0n,
        works: residual,
      },
      referenceCodes: [work.code],
      purchaseIds: [],
      workServiceId: work.id,
      supplyItemIds: [],
      supplierName: work.providerName || 'Prestador não informado',
      description: `${work.category} · ${work.description}`,
      paymentMethod: null,
      sourceLabel: null,
      installmentLabel: 'Saldo sem programação',
      amountCents: residual,
      storeIds: [work.storeId],
      storeCodes: [work.storeCode],
      states: [work.storeState],
      notes: 'Saldo contratado ainda sem pagamento programado.',
    });
  }

  return paymentRows;
}

export function buildUnifiedFinancePayments(
  purchases: PurchaseV2[],
  works: WorkService[],
): UnifiedFinancePaymentRow[] {
  const purchaseRows = consolidatePurchaseRows(
    purchases.flatMap((purchase) =>
      buildFinancePaymentEvents([purchase]).map((event) => purchasePaymentRow(purchase, event)),
    ),
  );
  const purchaseResiduals = purchases.flatMap(purchaseUnscheduledRows);
  const workRows = works.flatMap(workPaymentRows);

  return [...purchaseRows, ...purchaseResiduals, ...workRows].sort((a, b) => {
    if (a.status === 'unscheduled' && b.status !== 'unscheduled') return 1;
    if (a.status !== 'unscheduled' && b.status === 'unscheduled') return -1;
    const aDate = a.date || '9999-12-31';
    const bDate = b.date || '9999-12-31';
    return (
      aDate.localeCompare(bDate) ||
      a.referenceCodes.join(' ').localeCompare(b.referenceCodes.join(' '), 'pt-BR')
    );
  });
}

export function financePaymentTotals(rows: UnifiedFinancePaymentRow[]): FinancePaymentTotals {
  const totals: FinancePaymentTotals = {
    paidCents: 0n,
    plannedCents: 0n,
    unscheduledCents: 0n,
    commitmentCents: 0n,
  };
  rows.forEach((row) => {
    if (row.status === 'paid') totals.paidCents += row.amountCents;
    else if (row.status === 'planned') totals.plannedCents += row.amountCents;
    else totals.unscheduledCents += row.amountCents;
    totals.commitmentCents += row.amountCents;
  });
  return totals;
}

export function financePaymentOriginSummary(
  rows: UnifiedFinancePaymentRow[],
): FinancePaymentOriginSummary[] {
  return ORIGINS.map((origin) => {
    let paidCents = 0n;
    let plannedCents = 0n;
    let unscheduledCents = 0n;
    rows.forEach((row) => {
      const amount = row.originAllocations[origin];
      if (row.status === 'paid') paidCents += amount;
      else if (row.status === 'planned') plannedCents += amount;
      else unscheduledCents += amount;
    });
    return {
      origin,
      label: FINANCE_PAYMENT_ORIGIN_LABELS[origin],
      paidCents,
      plannedCents,
      unscheduledCents,
      commitmentCents: paidCents + plannedCents + unscheduledCents,
    };
  });
}

export function financePaymentPrimaryOrigin(row: UnifiedFinancePaymentRow): FinancePaymentOrigin {
  return ORIGINS.reduce((best, origin) =>
    row.originAllocations[origin] > row.originAllocations[best] ? origin : best,
  );
}
