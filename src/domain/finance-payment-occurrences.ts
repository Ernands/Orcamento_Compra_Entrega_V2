import { scopeFinancePaymentsByStores, type UnifiedFinancePaymentRow } from './finance-payments';
import { moneyToCents } from './supply-calculations';
import type { PurchasePaymentOccurrenceV2 } from './payment-occurrences';

export interface FinancePaymentOccurrenceDisplay {
  id: string;
  paymentId: string | null;
  attachmentId: string | null;
  date: string;
  amountCents: bigint;
  paymentMethod: string | null;
  referenceLabel: string | null;
  source: 'manual' | 'proof_backfill' | 'payment_record' | 'fallback';
  notes: string | null;
}

export interface UnifiedFinancePaymentRowWithOccurrences extends UnifiedFinancePaymentRow {
  officialAmountCents: bigint;
  paymentOccurrences: FinancePaymentOccurrenceDisplay[];
  paymentDates: string[];
  occurrenceSumCents: bigint;
  occurrenceDifferenceCents: bigint;
  occurrenceDetailsSource: 'structured' | 'fallback' | 'none';
}

function uniqueDates(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
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

function occurrenceInRange(
  occurrence: FinancePaymentOccurrenceDisplay,
  dateFrom: string,
  dateTo: string,
): boolean {
  return (!dateFrom || occurrence.date >= dateFrom) && (!dateTo || occurrence.date <= dateTo);
}

export function decorateFinancePaymentsWithOccurrences(
  rows: UnifiedFinancePaymentRow[],
  occurrences: PurchasePaymentOccurrenceV2[],
): UnifiedFinancePaymentRowWithOccurrences[] {
  const byPayment = new Map<string, PurchasePaymentOccurrenceV2[]>();
  occurrences.forEach((occurrence) => {
    const list = byPayment.get(occurrence.paymentId);
    if (list) list.push(occurrence);
    else byPayment.set(occurrence.paymentId, [occurrence]);
  });
  byPayment.forEach((list) => list.sort((a, b) =>
    a.position - b.position || a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id),
  ));

  return rows.map((row) => {
    const structured = row.paymentIds.flatMap((paymentId) =>
      (byPayment.get(paymentId) || []).map((occurrence): FinancePaymentOccurrenceDisplay => ({
        id: occurrence.id,
        paymentId: occurrence.paymentId,
        attachmentId: occurrence.attachmentId,
        date: occurrence.occurredOn,
        amountCents: moneyToCents(occurrence.amount),
        paymentMethod: occurrence.paymentMethod,
        referenceLabel: occurrence.referenceLabel,
        source: occurrence.source,
        notes: occurrence.notes,
      })),
    );

    const fallback: FinancePaymentOccurrenceDisplay[] =
      row.status === 'paid' && row.date
        ? [{
            id: `fallback:${row.id}`,
            paymentId: row.paymentIds[0] || null,
            attachmentId: null,
            date: row.date,
            amountCents: row.amountCents,
            paymentMethod: row.paymentMethod,
            referenceLabel: row.sourceLabel || row.installmentLabel || null,
            source: 'fallback',
            notes: row.notes,
          }]
        : [];

    const paymentOccurrences = structured.length ? structured : fallback;
    const officialAmountCents = row.amountCents;
    const occurrenceSumCents = paymentOccurrences.reduce((sum, item) => sum + item.amountCents, 0n);
    const occurrenceDifferenceCents = occurrenceSumCents - officialAmountCents;

    return {
      ...row,
      officialAmountCents,
      paymentOccurrences,
      paymentDates: uniqueDates(paymentOccurrences.map((item) => item.date)),
      occurrenceSumCents,
      occurrenceDifferenceCents,
      occurrenceDetailsSource: structured.length ? 'structured' : fallback.length ? 'fallback' : 'none',
    };
  });
}

export function scopeFinancePaymentsWithOccurrencesByStores(
  rows: UnifiedFinancePaymentRowWithOccurrences[],
  storeIds: string[],
): UnifiedFinancePaymentRowWithOccurrences[] {
  return scopeFinancePaymentsByStores(rows, storeIds) as UnifiedFinancePaymentRowWithOccurrences[];
}

export function financePaymentMatchesDateRange(
  row: UnifiedFinancePaymentRowWithOccurrences,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom && !dateTo) return true;
  const dates = row.status === 'paid'
    ? row.paymentDates
    : row.date
      ? [row.date]
      : [];
  return dates.some((date) => (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo));
}

export function scopeFinancePaymentToOccurrenceDateRange(
  row: UnifiedFinancePaymentRowWithOccurrences,
  dateFrom: string,
  dateTo: string,
): UnifiedFinancePaymentRowWithOccurrences {
  if (row.status !== 'paid' || (!dateFrom && !dateTo)) return row;

  const matchingOccurrences = row.paymentOccurrences.filter((occurrence) =>
    occurrenceInRange(occurrence, dateFrom, dateTo),
  );
  const scopedAmountCents = matchingOccurrences.reduce((sum, occurrence) => sum + occurrence.amountCents, 0n);

  const originAllocationMap = allocateWeightedCents(
    scopedAmountCents,
    Object.entries(row.originAllocations).map(([key, weight]) => ({ key, weight })),
  );
  const originAllocations = {
    equipment: originAllocationMap.get('equipment') || 0n,
    furniture: originAllocationMap.get('furniture') || 0n,
    works: originAllocationMap.get('works') || 0n,
  };

  const storeWeights = row.storeAllocations.map((allocation) => ({
    key: allocation.storeId,
    weight: allocation.amountCents,
  }));
  if (row.unallocatedCents > 0n) {
    storeWeights.push({ key: '__unallocated__', weight: row.unallocatedCents });
  }
  const scopedStoreAmounts = allocateWeightedCents(scopedAmountCents, storeWeights);
  const storeAllocations = row.storeAllocations.map((allocation) => {
    const amountCents = scopedStoreAmounts.get(allocation.storeId) || 0n;
    const storeOriginMap = allocateWeightedCents(
      amountCents,
      Object.entries(allocation.originAllocations).map(([key, weight]) => ({ key, weight })),
    );
    return {
      ...allocation,
      amountCents,
      originAllocations: {
        equipment: storeOriginMap.get('equipment') || 0n,
        furniture: storeOriginMap.get('furniture') || 0n,
        works: storeOriginMap.get('works') || 0n,
      },
    };
  });

  return {
    ...row,
    amountCents: scopedAmountCents,
    originAllocations,
    storeAllocations,
    unallocatedCents: scopedStoreAmounts.get('__unallocated__') || 0n,
    paymentOccurrences: matchingOccurrences,
    paymentDates: uniqueDates(matchingOccurrences.map((occurrence) => occurrence.date)),
    occurrenceSumCents: scopedAmountCents,
  };
}

export function financePaymentLatestDate(row: UnifiedFinancePaymentRowWithOccurrences): string | null {
  if (row.status !== 'paid') return row.date;
  return row.paymentDates.length ? row.paymentDates[row.paymentDates.length - 1] : row.date;
}

export function financePaymentHasOccurrenceDivergence(row: UnifiedFinancePaymentRow): boolean {
  const enriched = row as Partial<UnifiedFinancePaymentRowWithOccurrences>;
  return typeof enriched.occurrenceDifferenceCents === 'bigint' && enriched.occurrenceDifferenceCents !== 0n;
}

export function financePaymentOccurrences(row: UnifiedFinancePaymentRow): FinancePaymentOccurrenceDisplay[] {
  const enriched = row as Partial<UnifiedFinancePaymentRowWithOccurrences>;
  if (Array.isArray(enriched.paymentOccurrences)) return enriched.paymentOccurrences;
  if (row.status === 'paid' && row.date) {
    return [{
      id: `fallback:${row.id}`,
      paymentId: row.paymentIds[0] || null,
      attachmentId: null,
      date: row.date,
      amountCents: row.amountCents,
      paymentMethod: row.paymentMethod,
      referenceLabel: row.sourceLabel || row.installmentLabel || null,
      source: 'fallback',
      notes: row.notes,
    }];
  }
  return [];
}

export function financePaymentOfficialAmount(row: UnifiedFinancePaymentRow): bigint {
  const enriched = row as Partial<UnifiedFinancePaymentRowWithOccurrences>;
  return typeof enriched.officialAmountCents === 'bigint' ? enriched.officialAmountCents : row.amountCents;
}

export function financePaymentOccurrenceDifference(row: UnifiedFinancePaymentRow): bigint {
  const enriched = row as Partial<UnifiedFinancePaymentRowWithOccurrences>;
  if (typeof enriched.occurrenceDifferenceCents === 'bigint') return enriched.occurrenceDifferenceCents;
  return 0n;
}
