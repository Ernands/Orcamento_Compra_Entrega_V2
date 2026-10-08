import { buildFinancePaymentEvents } from './finance-calculations';
import { financeItemCompositionGroup } from './finance-overview';
import { moneyToCents, quantityToThousandths } from './supply-calculations';
import type { PurchaseOrderV2, PurchasePaymentV2, PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';

export type FinancePaymentsView = 'paid' | 'planned' | 'unscheduled';
export type FinancePaymentOrigin = 'equipment' | 'furniture' | 'works';

export const FINANCE_PAYMENT_ORIGIN_LABELS: Record<FinancePaymentOrigin, string> = {
  equipment: 'Equipamentos',
  furniture: 'Mobiliário',
  works: 'Obras e Serviços',
};

export interface UnifiedFinancePaymentStoreAllocation {
  storeId: string;
  storeCode: string;
  state: string;
  amountCents: bigint;
  originAllocations: Record<FinancePaymentOrigin, bigint>;
}

export interface UnifiedFinancePaymentRow {
  id: string;
  status: FinancePaymentsView;
  date: string | null;
  originAllocations: Record<FinancePaymentOrigin, bigint>;
  referenceCodes: string[];
  purchaseIds: string[];
  purchaseOrderIds: string[];
  paymentIds: string[];
  workServiceId: string | null;
  supplyItemIds: string[];
  supplierName: string;
  description: string;
  paymentMethod: string | null;
  sourceLabel: string | null;
  installmentLabel: string;
  forwardedToFinance: boolean | null;
  amountCents: bigint;
  storeIds: string[];
  storeCodes: string[];
  states: string[];
  storeAllocations: UnifiedFinancePaymentStoreAllocation[];
  unallocatedCents: bigint;
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

const ORIGINS: FinancePaymentOrigin[] = ['equipment', 'furniture', 'works'];
const UNALLOCATED_KEY = '__unallocated__';

function emptyAllocations(): Record<FinancePaymentOrigin, bigint> {
  return { equipment: 0n, furniture: 0n, works: 0n };
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

function allocateWeightedCents(
  totalCents: bigint,
  entries: Array<{ key: string; weight: bigint }>,
): Map<string, bigint> {
  const positive = entries.filter((entry) => entry.weight > 0n);
  if (totalCents <= 0n || positive.length === 0) return new Map();

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
  const result = new Map<string, bigint>();
  interim
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.key.localeCompare(b.key)
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .forEach((entry) => {
      result.set(entry.key, entry.base + (remaining > 0n ? 1n : 0n));
      if (remaining > 0n) remaining -= 1n;
    });
  return result;
}

function allocateOrigins(
  totalCents: bigint,
  weights: Map<FinancePaymentOrigin, bigint>,
): Record<FinancePaymentOrigin, bigint> {
  const allocated = allocateWeightedCents(
    totalCents,
    [...weights.entries()].map(([key, weight]) => ({ key, weight })),
  );
  return {
    equipment: allocated.get('equipment') || 0n,
    furniture: allocated.get('furniture') || 0n,
    works: allocated.get('works') || 0n,
  };
}

interface StoreMeta {
  storeId: string;
  storeCode: string;
  state: string;
}

interface StoreOriginWeight extends StoreMeta {
  origin: FinancePaymentOrigin;
  weight: bigint;
}

interface PurchaseCostContext {
  totalCents: bigint;
  originWeights: Map<FinancePaymentOrigin, bigint>;
  supplyItemIds: string[];
  storeOriginWeights: Map<string, StoreOriginWeight>;
  storeMeta: Map<string, StoreMeta>;
}

interface PurchasePaymentContext {
  activeOrders: Array<{ order: PurchaseOrderV2; cost: PurchaseCostContext }>;
  orderById: Map<string, PurchaseCostContext>;
  combined: PurchaseCostContext;
}

function lineOrigin(
  itemById: Map<string, PurchaseV2['items'][number]>,
  line: PurchaseOrderV2['lines'][number],
): FinancePaymentOrigin {
  const item = line.purchaseItemId ? itemById.get(line.purchaseItemId) || null : null;
  return financeItemCompositionGroup(
    item?.itemCategory || null,
    item?.catalogSubcategory || null,
    item?.catalogGroupName || null,
    item?.itemName || line.itemName,
    item?.catalogFinancialGroup || null,
  );
}

function buildOrderCostContext(
  order: PurchaseOrderV2,
  itemById: Map<string, PurchaseV2['items'][number]>,
): PurchaseCostContext {
  const originWeights = new Map<FinancePaymentOrigin, bigint>();
  const supplyItemIds = new Set<string>();
  const storeOriginWeights = new Map<string, StoreOriginWeight>();
  const storeMeta = new Map<string, StoreMeta>();
  let totalCents = 0n;

  order.lines.forEach((line) => {
    const total = orderLineTotalCents(line);
    totalCents += total;
    const origin = lineOrigin(itemById, line);
    originWeights.set(origin, (originWeights.get(origin) || 0n) + total);

    const item = line.purchaseItemId ? itemById.get(line.purchaseItemId) || null : null;
    if (item?.supplyItemId) supplyItemIds.add(item.supplyItemId);

    if (line.storeDistributionStatus !== 'confirmed' || !line.stores.length) return;
    const allocation = allocateWeightedCents(
      total,
      line.stores.map((store) => ({
        key: store.storeId,
        weight: quantityToThousandths(store.quantity),
      })),
    );
    const distributed = [...allocation.values()].reduce((sum, value) => sum + value, 0n);
    if (distributed !== total) return;

    line.stores.forEach((store) => {
      storeMeta.set(store.storeId, {
        storeId: store.storeId,
        storeCode: store.code,
        state: store.state,
      });
      const key = `${store.storeId}|${origin}`;
      const current = storeOriginWeights.get(key);
      storeOriginWeights.set(key, {
        storeId: store.storeId,
        storeCode: store.code,
        state: store.state,
        origin,
        weight: (current?.weight || 0n) + (allocation.get(store.storeId) || 0n),
      });
    });
  });

  return {
    totalCents,
    originWeights,
    supplyItemIds: [...supplyItemIds],
    storeOriginWeights,
    storeMeta,
  };
}

function combineCostContexts(contexts: PurchaseCostContext[]): PurchaseCostContext {
  const originWeights = new Map<FinancePaymentOrigin, bigint>();
  const supplyItemIds = new Set<string>();
  const storeOriginWeights = new Map<string, StoreOriginWeight>();
  const storeMeta = new Map<string, StoreMeta>();
  let totalCents = 0n;

  contexts.forEach((context) => {
    totalCents += context.totalCents;
    context.originWeights.forEach((weight, origin) => {
      originWeights.set(origin, (originWeights.get(origin) || 0n) + weight);
    });
    context.supplyItemIds.forEach((id) => supplyItemIds.add(id));
    context.storeMeta.forEach((meta, storeId) => storeMeta.set(storeId, meta));
    context.storeOriginWeights.forEach((entry, key) => {
      const current = storeOriginWeights.get(key);
      storeOriginWeights.set(key, {
        ...entry,
        weight: (current?.weight || 0n) + entry.weight,
      });
    });
  });

  return {
    totalCents,
    originWeights,
    supplyItemIds: [...supplyItemIds],
    storeOriginWeights,
    storeMeta,
  };
}

function buildPurchasePaymentContext(purchase: PurchaseV2): PurchasePaymentContext {
  const itemById = new Map(purchase.items.map((item) => [item.id, item]));
  const activeOrders = purchase.orders
    .filter((order) => order.status === 'active')
    .map((order) => ({ order, cost: buildOrderCostContext(order, itemById) }));
  return {
    activeOrders,
    orderById: new Map(activeOrders.map((entry) => [entry.order.id, entry.cost])),
    combined: combineCostContexts(activeOrders.map((entry) => entry.cost)),
  };
}

function allocatePaymentToStores(
  totalCents: bigint,
  context: PurchaseCostContext,
): { allocations: UnifiedFinancePaymentStoreAllocation[]; unallocatedCents: bigint } {
  const storeWeights = [...context.storeOriginWeights.entries()].map(([key, entry]) => ({
    key,
    weight: entry.weight,
  }));
  const knownWeight = storeWeights.reduce((sum, entry) => sum + entry.weight, 0n);
  const unallocatedWeight = context.totalCents > knownWeight ? context.totalCents - knownWeight : 0n;
  if (unallocatedWeight > 0n) storeWeights.push({ key: UNALLOCATED_KEY, weight: unallocatedWeight });

  const allocated = allocateWeightedCents(totalCents, storeWeights);
  const byStore = new Map<string, UnifiedFinancePaymentStoreAllocation>();
  context.storeOriginWeights.forEach((entry, key) => {
    const amount = allocated.get(key) || 0n;
    if (amount <= 0n) return;
    const current = byStore.get(entry.storeId) || {
      storeId: entry.storeId,
      storeCode: entry.storeCode,
      state: entry.state,
      amountCents: 0n,
      originAllocations: emptyAllocations(),
    };
    current.amountCents += amount;
    current.originAllocations[entry.origin] += amount;
    byStore.set(entry.storeId, current);
  });

  const allocations = [...byStore.values()].sort((a, b) => a.storeCode.localeCompare(b.storeCode, 'pt-BR'));
  const allocatedCents = allocations.reduce((sum, entry) => sum + entry.amountCents, 0n);
  return {
    allocations,
    unallocatedCents: totalCents > allocatedCents ? totalCents - allocatedCents : 0n,
  };
}

function paymentNotes(purchase: PurchaseV2, paymentId: string): string | null {
  return purchase.payments.find((payment) => payment.id === paymentId)?.notes || null;
}

function paymentForwardedToFinance(purchase: PurchaseV2, paymentId: string): boolean {
  return Boolean(purchase.payments.find((payment) => payment.id === paymentId)?.forwardedToFinanceAt);
}

function purchasePaymentRow(
  purchase: PurchaseV2,
  event: ReturnType<typeof buildFinancePaymentEvents>[number],
  paymentContext: PurchasePaymentContext,
): UnifiedFinancePaymentRow {
  const context = event.purchaseOrderId
    ? paymentContext.orderById.get(event.purchaseOrderId) || paymentContext.combined
    : paymentContext.combined;
  const storeResult = allocatePaymentToStores(event.amountCents, context);
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
    originAllocations: allocateOrigins(event.amountCents, context.originWeights),
    referenceCodes: [event.purchaseCode],
    purchaseIds: [purchase.id],
    purchaseOrderIds: event.purchaseOrderId ? [event.purchaseOrderId] : [],
    paymentIds: [event.paymentId],
    workServiceId: null,
    supplyItemIds: context.supplyItemIds,
    supplierName: event.supplierName,
    description: event.itemSummary,
    paymentMethod: event.paymentMethod,
    sourceLabel: event.sourceLabel,
    installmentLabel: sourceInstallment,
    forwardedToFinance: paymentForwardedToFinance(purchase, event.paymentId),
    amountCents: event.amountCents,
    storeIds: unique(storeIds),
    storeCodes,
    states: unique(states),
    storeAllocations: storeResult.allocations,
    unallocatedCents: storeResult.unallocatedCents,
    notes,
  };
}

function isCombinedPurchasePayment(row: UnifiedFinancePaymentRow): boolean {
  const normalized = (row.notes || '').toLocaleLowerCase('pt-BR');
  return normalized.includes('compra única') || normalized.includes('parcela combinada');
}

function mergeStoreAllocations(rows: UnifiedFinancePaymentRow[]): UnifiedFinancePaymentStoreAllocation[] {
  const result = new Map<string, UnifiedFinancePaymentStoreAllocation>();
  rows.flatMap((row) => row.storeAllocations).forEach((entry) => {
    const current = result.get(entry.storeId) || {
      storeId: entry.storeId,
      storeCode: entry.storeCode,
      state: entry.state,
      amountCents: 0n,
      originAllocations: emptyAllocations(),
    };
    current.amountCents += entry.amountCents;
    ORIGINS.forEach((origin) => {
      current.originAllocations[origin] += entry.originAllocations[origin];
    });
    result.set(entry.storeId, current);
  });
  return [...result.values()].sort((a, b) => a.storeCode.localeCompare(b.storeCode, 'pt-BR'));
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
    purchaseOrderIds: unique(rows.flatMap((row) => row.purchaseOrderIds)),
    paymentIds: unique(rows.flatMap((row) => row.paymentIds)),
    supplyItemIds: unique(rows.flatMap((row) => row.supplyItemIds)),
    forwardedToFinance: rows.every((row) => row.forwardedToFinance === true)
      ? true
      : rows.every((row) => row.forwardedToFinance === false)
        ? false
        : null,
    description: unique(rows.map((row) => row.description)).join(' + '),
    amountCents: rows.reduce((sum, row) => sum + row.amountCents, 0n),
    storeIds: unique(rows.flatMap((row) => row.storeIds)),
    storeCodes: unique(rows.flatMap((row) => row.storeCodes)).sort(),
    states: unique(rows.flatMap((row) => row.states)).sort(),
    storeAllocations: mergeStoreAllocations(rows),
    unallocatedCents: rows.reduce((sum, row) => sum + row.unallocatedCents, 0n),
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

function genericPaymentAllocations(
  payments: PurchasePaymentV2[],
  orders: Array<{ order: PurchaseOrderV2; cost: PurchaseCostContext }>,
) {
  const activeGeneralCents = payments
    .filter((payment) => payment.status !== 'cancelled' && !payment.purchaseOrderId)
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  if (activeGeneralCents <= 0n) return new Map<string, bigint>();

  return allocateWeightedCents(
    activeGeneralCents,
    orders.map((entry) => ({ key: entry.order.id, weight: entry.cost.totalCents })),
  );
}

function purchaseUnscheduledRows(
  purchase: PurchaseV2,
  paymentContext: PurchasePaymentContext,
): UnifiedFinancePaymentRow[] {
  if (['returned', 'cancelled'].includes(purchase.status)) return [];
  const genericAllocations = genericPaymentAllocations(purchase.payments, paymentContext.activeOrders);

  return paymentContext.activeOrders.flatMap(({ order, cost }) => {
    const totalCents = cost.totalCents;
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

    const storeResult = allocatePaymentToStores(residual, cost);
    const exactStoreIds = storeResult.allocations.map((entry) => entry.storeId);
    const fallbackStores = purchase.stores;
    const storeIds = exactStoreIds.length
      ? exactStoreIds
      : unique(order.lines.flatMap((line) => line.stores.map((store) => store.storeId)));
    const storeCodes = exactStoreIds.length
      ? storeResult.allocations.map((entry) => entry.storeCode)
      : unique(order.lines.flatMap((line) => line.stores.map((store) => store.code)));
    const states = exactStoreIds.length
      ? unique(storeResult.allocations.map((entry) => entry.state))
      : unique(order.lines.flatMap((line) => line.stores.map((store) => store.state)));

    return [
      {
        id: `purchase-unscheduled:${purchase.id}:${order.id}`,
        status: 'unscheduled' as const,
        date: null,
        originAllocations: allocateOrigins(residual, cost.originWeights),
        referenceCodes: [purchase.code],
        purchaseIds: [purchase.id],
        purchaseOrderIds: [order.id],
        paymentIds: [],
        workServiceId: null,
        supplyItemIds: cost.supplyItemIds,
        supplierName: purchase.supplierName,
        description:
          unique(order.lines.map((line) => line.itemName)).join(', ') || 'Itens da compra',
        paymentMethod: null,
        sourceLabel: null,
        installmentLabel: 'Saldo sem programação',
        forwardedToFinance: null,
        amountCents: residual,
        storeIds: storeIds.length ? storeIds : fallbackStores.map((store) => store.storeId),
        storeCodes: storeCodes.length ? storeCodes : fallbackStores.map((store) => store.code),
        states: states.length ? states : unique(fallbackStores.map((store) => store.state)),
        storeAllocations: storeResult.allocations,
        unallocatedCents: storeResult.unallocatedCents,
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
    const originAllocations = { equipment: 0n, furniture: 0n, works: amountCents };
    return [
      {
        id: `work:${payment.id}`,
        status: paid ? ('paid' as const) : ('planned' as const),
        date,
        originAllocations,
        referenceCodes: [work.code],
        purchaseIds: [],
        purchaseOrderIds: [],
        paymentIds: [payment.id],
        workServiceId: work.id,
        supplyItemIds: [],
        supplierName: work.providerName || 'Prestador não informado',
        description: `${work.category} · ${work.description}`,
        paymentMethod: payment.paymentMethod,
        sourceLabel: payment.sourceLabel || payment.label,
        installmentLabel: payment.label || (paid ? 'Pagamento realizado' : 'Pagamento previsto'),
        forwardedToFinance: paid ? null : Boolean(payment.forwardedToFinanceAt),
        amountCents,
        storeIds: [work.storeId],
        storeCodes: [work.storeCode],
        states: [work.storeState],
        storeAllocations: [
          {
            storeId: work.storeId,
            storeCode: work.storeCode,
            state: work.storeState,
            amountCents,
            originAllocations: { ...originAllocations },
          },
        ],
        unallocatedCents: 0n,
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
    const originAllocations = { equipment: 0n, furniture: 0n, works: residual };
    paymentRows.push({
      id: `work-unscheduled:${work.id}`,
      status: 'unscheduled',
      date: null,
      originAllocations,
      referenceCodes: [work.code],
      purchaseIds: [],
      purchaseOrderIds: [],
      paymentIds: [],
      workServiceId: work.id,
      supplyItemIds: [],
      supplierName: work.providerName || 'Prestador não informado',
      description: `${work.category} · ${work.description}`,
      paymentMethod: null,
      sourceLabel: null,
      installmentLabel: 'Saldo sem programação',
      forwardedToFinance: null,
      amountCents: residual,
      storeIds: [work.storeId],
      storeCodes: [work.storeCode],
      states: [work.storeState],
      storeAllocations: [
        {
          storeId: work.storeId,
          storeCode: work.storeCode,
          state: work.storeState,
          amountCents: residual,
          originAllocations: { ...originAllocations },
        },
      ],
      unallocatedCents: 0n,
      notes: 'Saldo contratado ainda sem pagamento programado.',
    });
  }

  return paymentRows;
}

export function buildUnifiedFinancePayments(
  purchases: PurchaseV2[],
  works: WorkService[],
): UnifiedFinancePaymentRow[] {
  const purchaseRows: UnifiedFinancePaymentRow[] = [];
  const purchaseResiduals: UnifiedFinancePaymentRow[] = [];

  purchases.forEach((purchase) => {
    const paymentContext = buildPurchasePaymentContext(purchase);
    buildFinancePaymentEvents([purchase]).forEach((event) => {
      purchaseRows.push(purchasePaymentRow(purchase, event, paymentContext));
    });
    purchaseResiduals.push(...purchaseUnscheduledRows(purchase, paymentContext));
  });

  const workRows = works.flatMap(workPaymentRows);
  return [...consolidatePurchaseRows(purchaseRows), ...purchaseResiduals, ...workRows].sort((a, b) => {
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

export function scopeFinancePaymentsByStores(
  rows: UnifiedFinancePaymentRow[],
  storeIds: string[],
): UnifiedFinancePaymentRow[] {
  const selected = new Set(storeIds);
  if (!selected.size) return [];

  return rows.flatMap((row) => {
    const storeAllocations = row.storeAllocations.filter((entry) => selected.has(entry.storeId));
    if (!storeAllocations.length) return [];
    const amountCents = storeAllocations.reduce((sum, entry) => sum + entry.amountCents, 0n);
    if (amountCents <= 0n) return [];
    const originAllocations = emptyAllocations();
    storeAllocations.forEach((entry) => {
      ORIGINS.forEach((origin) => {
        originAllocations[origin] += entry.originAllocations[origin];
      });
    });
    return [
      {
        ...row,
        amountCents,
        originAllocations,
        storeIds: storeAllocations.map((entry) => entry.storeId),
        storeCodes: unique(storeAllocations.map((entry) => entry.storeCode)).sort(),
        states: unique(storeAllocations.map((entry) => entry.state)).sort(),
        storeAllocations,
        unallocatedCents: 0n,
      },
    ];
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
