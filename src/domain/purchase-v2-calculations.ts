import { moneyToCents, quantityToThousandths } from './supply-calculations';
import type {
  PurchaseDestinationV2,
  PurchaseItemV2,
  PurchaseOrderLineV2,
  PurchaseOrderV2,
  PurchaseV2,
} from './purchase-v2-types';

function roundedDivide(value: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return 0n;
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const result = (absolute + divisor / 2n) / divisor;
  return negative ? -result : result;
}

export function formatQuantityV2(value: string): string {
  const thousandths = quantityToThousandths(value);
  const negative = thousandths < 0n;
  const absolute = negative ? -thousandths : thousandths;
  const whole = absolute / 1000n;
  const fraction = String(absolute % 1000n).padStart(3, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `,${fraction}` : ''}`;
}

export function activeOrders(purchase: Pick<PurchaseV2, 'orders'>): PurchaseOrderV2[] {
  return purchase.orders.filter((order) => order.status === 'active');
}

export function activeLines(purchase: Pick<PurchaseV2, 'orders'>): PurchaseOrderLineV2[] {
  return activeOrders(purchase).flatMap((order) => order.lines);
}

export function lineHasPendingShipping(line: PurchaseOrderLineV2): boolean {
  return line.shippingType === 'pending' || line.actualShippingType === 'pending' || line.shippingAmount === null;
}

export function lineTotalCents(line: PurchaseOrderLineV2): bigint | null {
  return line.lineTotal === null ? null : moneyToCents(line.lineTotal);
}

export function itemExecution(item: PurchaseItemV2, purchase: Pick<PurchaseV2, 'orders'>) {
  const lines = activeLines(purchase).filter((line) => line.purchaseItemId === item.id);
  const purchasedQuantity = lines.reduce((sum, line) => sum + quantityToThousandths(line.quantity), 0n);
  const approvedQuantity = quantityToThousandths(item.quantityApproved);
  const realizedCents = lines.reduce((sum, line) => sum + (lineTotalCents(line) ?? 0n), 0n);
  const hasPendingShipping = lines.some(lineHasPendingShipping);
  const completed = purchasedQuantity >= approvedQuantity;
  return {
    lines,
    approvedQuantity,
    purchasedQuantity,
    missingQuantity: approvedQuantity > purchasedQuantity ? approvedQuantity - purchasedQuantity : 0n,
    realizedCents,
    hasPendingShipping,
    completed,
    variationCents: completed && !hasPendingShipping ? realizedCents - moneyToCents(item.approvedLineTotal) : null,
  };
}

export function purchaseExecutionSummary(purchase: PurchaseV2) {
  const lines = activeLines(purchase);
  const realizedCents = lines.reduce((sum, line) => sum + (lineTotalCents(line) ?? 0n), 0n);
  const approvedCents = moneyToCents(purchase.approvedTotal);
  const itemStates = purchase.items.map((item) => itemExecution(item, purchase));
  const completed = itemStates.length > 0 && itemStates.every((item) => item.completed);
  const pendingShippingLines = lines.filter(lineHasPendingShipping).length;
  const pendingDestinationDistributions = purchase.items
    .flatMap((item) => item.destinations)
    .filter((destination) => destination.destinationType === 'profile' && destination.distributionStatus !== 'confirmed').length;
  const pendingLineDistributions = lines.filter((line) => line.storeDistributionStatus !== 'confirmed').length;
  return {
    approvedCents,
    realizedCents,
    balanceCents: approvedCents - realizedCents,
    completed,
    completedItems: itemStates.filter((state) => state.completed).length,
    activeOrderCount: activeOrders(purchase).length,
    pendingShippingLines,
    pendingDestinationDistributions,
    pendingLineDistributions,
    variationCents: completed && pendingShippingLines === 0 ? realizedCents - approvedCents : null,
  };
}

export function destinationExecution(
  destination: PurchaseDestinationV2,
  purchase: Pick<PurchaseV2, 'orders'>,
) {
  const lines = activeLines(purchase).filter((line) => line.purchaseDestinationId === destination.id);
  const purchasedQuantity = lines.reduce((sum, line) => sum + quantityToThousandths(line.quantity), 0n);
  const realizedCents = lines.reduce((sum, line) => sum + (lineTotalCents(line) ?? 0n), 0n);
  return {
    lines,
    purchasedQuantity,
    realizedCents,
    hasPendingShipping: lines.some(lineHasPendingShipping),
  };
}

export function destinationPurchasedQuantity(
  destination: PurchaseDestinationV2,
  purchase: Pick<PurchaseV2, 'orders'>,
): bigint {
  return destinationExecution(destination, purchase).purchasedQuantity;
}

export function remainingItemQuantity(item: PurchaseItemV2, purchase: Pick<PurchaseV2, 'orders'>): bigint {
  return itemExecution(item, purchase).missingQuantity;
}

export function remainingDestinationQuantity(
  destination: PurchaseDestinationV2,
  purchase: Pick<PurchaseV2, 'orders'>,
): bigint {
  const approved = quantityToThousandths(destination.quantity);
  const purchased = destinationPurchasedQuantity(destination, purchase);
  return approved > purchased ? approved - purchased : 0n;
}

export function suggestedDeliveryDate(purchasedOn: string, deliveryDays: number | null): string {
  if (!purchasedOn || deliveryDays === null || !Number.isFinite(deliveryDays)) return '';
  const base = new Date(`${purchasedOn}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deliveryDays);
  return base.toISOString().slice(0, 10);
}

function allocateCentsByWeights(totalCents: bigint, entries: Array<{ key: string; weight: bigint }>) {
  const positive = entries.filter((entry) => entry.weight > 0n);
  if (!positive.length) return new Map<string, bigint>();
  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0n);
  const allocations = new Map<string, bigint>();
  let allocated = 0n;
  const remainders: Array<{ key: string; remainder: bigint }> = [];
  for (const entry of positive) {
    const numerator = totalCents * entry.weight;
    const base = numerator / totalWeight;
    allocations.set(entry.key, base);
    allocated += base;
    remainders.push({ key: entry.key, remainder: numerator % totalWeight });
  }
  let remaining = totalCents - allocated;
  remainders.sort((a, b) => (a.remainder === b.remainder ? a.key.localeCompare(b.key) : a.remainder > b.remainder ? -1 : 1));
  let index = 0;
  while (remaining > 0n && remainders.length) {
    const key = remainders[index % remainders.length].key;
    allocations.set(key, (allocations.get(key) ?? 0n) + 1n);
    remaining -= 1n;
    index += 1;
  }
  return allocations;
}

function allocateSignedCentsByWeights(totalCents: bigint, entries: Array<{ key: string; weight: bigint }>) {
  if (totalCents >= 0n) return allocateCentsByWeights(totalCents, entries);
  const positive = allocateCentsByWeights(-totalCents, entries);
  return new Map([...positive.entries()].map(([key, value]) => [key, -value]));
}

export function approvedDestinationAllocations(item: PurchaseItemV2): Map<string, bigint> {
  if (!item.destinations.length) return new Map();
  const approvedLineCents = moneyToCents(item.approvedLineTotal);
  const destinationWeights = item.destinations.map((destination) => ({
    key: destination.id,
    weight: quantityToThousandths(destination.quantity),
  }));
  const shippingByDestination = new Map(
    item.destinations.map((destination) => [
      destination.id,
      destination.quotedShippingType === 'informed'
        ? moneyToCents(destination.quotedShippingAmount || '0')
        : 0n,
    ]),
  );
  const destinationShippingCents = [...shippingByDestination.values()].reduce((sum, value) => sum + value, 0n);
  const commonApprovedCents = approvedLineCents - destinationShippingCents;
  const commonAllocation = allocateSignedCentsByWeights(commonApprovedCents, destinationWeights);
  return new Map(
    item.destinations.map((destination) => [
      destination.id,
      (commonAllocation.get(destination.id) ?? 0n) + (shippingByDestination.get(destination.id) ?? 0n),
    ]),
  );
}

export function purchaseAllocationCoverage(purchase: PurchaseV2) {
  return purchase.items.reduce(
    (coverage, item) => {
      if (item.destinations.length > 0) coverage.destinationItems += 1;
      else if (item.storeId) coverage.directStoreItems += 1;
      else if (item.sourceQuoteItemId === null && purchase.stores.length > 0) coverage.legacyFallbackItems += 1;
      else coverage.unallocatedItems += 1;
      return coverage;
    },
    { destinationItems: 0, directStoreItems: 0, legacyFallbackItems: 0, unallocatedItems: 0 },
  );
}

export interface StoreCostRowV2 {
  storeId: string;
  code: string;
  name: string;
  state: string;
  approvedCents: bigint;
  realizedCents: bigint;
}

function emptyStoreRows(purchase: PurchaseV2) {
  return new Map(
    purchase.stores.map((store) => [
      store.storeId,
      {
        storeId: store.storeId,
        code: store.code,
        name: store.name,
        state: store.state,
        approvedCents: 0n,
        realizedCents: 0n,
      } satisfies StoreCostRowV2,
    ]),
  );
}

export function purchaseStoreCosts(purchase: PurchaseV2) {
  const rows = emptyStoreRows(purchase);
  let approvedUnallocatedCents = 0n;
  let realizedUnallocatedCents = 0n;

  for (const item of purchase.items) {
    const approvedLineCents = moneyToCents(item.approvedLineTotal);
    const destinations = item.destinations;
    if (!destinations.length) {
      if (item.storeId && rows.has(item.storeId)) {
        rows.get(item.storeId)!.approvedCents += approvedLineCents;
      } else if (item.sourceQuoteItemId === null && purchase.stores.length > 0) {
        // Compatibilidade historica: compras antigas podem nao ter snapshot de destinos.
        // Somente nesses registros o aprovado e dividido igualmente entre as lojas da compra.
        const fallbackAllocation = allocateCentsByWeights(
          approvedLineCents,
          purchase.stores.map((store) => ({ key: store.storeId, weight: 1n })),
        );
        for (const [storeId, cents] of fallbackAllocation) {
          if (rows.has(storeId)) rows.get(storeId)!.approvedCents += cents;
          else approvedUnallocatedCents += cents;
        }
      } else {
        // Item V2 sem destino deve permanecer explicitamente nao alocado; nao inventar destino/rateio.
        approvedUnallocatedCents += approvedLineCents;
      }
      continue;
    }

    const destinationAllocation = approvedDestinationAllocations(item);

    for (const destination of destinations) {
      const destinationCents = destinationAllocation.get(destination.id) ?? 0n;
      if (destination.distributionStatus !== 'confirmed') {
        approvedUnallocatedCents += destinationCents;
        continue;
      }
      const storeWeights = destination.stores
        .filter((store) => store.allocatedQuantity !== null)
        .map((store) => ({ key: store.storeId, weight: quantityToThousandths(store.allocatedQuantity || '0') }));
      const storeAllocation = allocateCentsByWeights(destinationCents, storeWeights);
      const distributedCents = [...storeAllocation.values()].reduce((sum, value) => sum + value, 0n);
      if (distributedCents !== destinationCents) {
        approvedUnallocatedCents += destinationCents;
        continue;
      }
      for (const [storeId, cents] of storeAllocation) {
        if (rows.has(storeId)) rows.get(storeId)!.approvedCents += cents;
        else approvedUnallocatedCents += cents;
      }
    }
  }

  for (const line of activeLines(purchase)) {
    const total = lineTotalCents(line);
    if (total === null || line.storeDistributionStatus !== 'confirmed') {
      realizedUnallocatedCents += total ?? 0n;
      continue;
    }
    const storeWeights = line.stores.map((store) => ({
      key: store.storeId,
      weight: quantityToThousandths(store.quantity),
    }));
    const allocation = allocateSignedCentsByWeights(total, storeWeights);
    const distributedCents = [...allocation.values()].reduce((sum, value) => sum + value, 0n);
    if (distributedCents !== total) {
      realizedUnallocatedCents += total;
      continue;
    }
    for (const [storeId, cents] of allocation) {
      if (rows.has(storeId)) rows.get(storeId)!.realizedCents += cents;
      else realizedUnallocatedCents += cents;
    }
  }

  return {
    rows: [...rows.values()],
    approvedUnallocatedCents,
    realizedUnallocatedCents,
  };
}

export function calculateRegistrationTotal(values: {
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  shippingAmount: string;
  otherCosts: string;
}): bigint {
  const quantity = quantityToThousandths(values.quantity);
  const unit = moneyToCents(values.unitPrice);
  const subtotal = roundedDivide(quantity * unit, 1000n);
  const discount = moneyToCents(values.discountAmount || '0');
  const shipping = moneyToCents(values.shippingAmount);
  const other = moneyToCents(values.otherCosts || '0');
  return subtotal - discount + shipping + other;
}
