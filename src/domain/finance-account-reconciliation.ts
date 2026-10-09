export type FinanceAccountEntryType =
  | 'investment'
  | 'adjustment_credit'
  | 'adjustment_debit';

export type FinanceAccountEntryStatus = 'active' | 'cancelled';
export type FinanceAccountDayStatus = 'reconciled' | 'divergent' | 'pending';

export interface FinanceAccountAttachment {
  id: string;
  entryId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface FinanceAccountManualEntry {
  id: string;
  date: string;
  type: FinanceAccountEntryType;
  amountCents: bigint;
  reason: string;
  notes: string | null;
  status: FinanceAccountEntryStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: FinanceAccountAttachment[];
}

export interface FinanceAccountDayRecord {
  id: string;
  date: string;
  bankPaymentsCents: bigint | null;
  bankBalanceCents: bigint | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceAccountPaymentEvent {
  id: string;
  date: string;
  amountCents: bigint;
  reference: string;
  counterpart: string;
  description: string;
  paymentMethod: string | null;
  sourceLabel: string | null;
  storeIds: string[];
  storeCodes: string[];
  states: string[];
  sourceHref: string;
}

export interface FinanceAccountDaySummary {
  date: string;
  investmentCents: bigint;
  systemPaymentsCents: bigint;
  bankPaymentsCents: bigint | null;
  adjustmentCreditCents: bigint;
  adjustmentDebitCents: bigint;
  differenceCents: bigint | null;
  expectedBalanceCents: bigint;
  bankBalanceCents: bigint | null;
  balanceDifferenceCents: bigint | null;
  status: FinanceAccountDayStatus;
  record: FinanceAccountDayRecord | null;
  payments: FinanceAccountPaymentEvent[];
  entries: FinanceAccountManualEntry[];
}

export interface FinanceAccountConsolidated {
  investmentCents: bigint;
  systemPaymentsCents: bigint;
  adjustmentCreditCents: bigint;
  adjustmentDebitCents: bigint;
  expectedBalanceCents: bigint;
  actualBalanceCents: bigint | null;
  balanceDifferenceCents: bigint | null;
  actualBalanceDate: string | null;
  reconciledDays: number;
  divergentDays: number;
  pendingDays: number;
}

function sum(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

export function buildFinanceAccountDaySummaries(
  payments: FinanceAccountPaymentEvent[],
  records: FinanceAccountDayRecord[],
  entries: FinanceAccountManualEntry[],
): FinanceAccountDaySummary[] {
  const activeEntries = entries.filter((entry) => entry.status === 'active');
  const dates = new Set<string>([
    ...payments.map((payment) => payment.date),
    ...records.map((record) => record.date),
    ...activeEntries.map((entry) => entry.date),
  ]);
  const recordByDate = new Map(records.map((record) => [record.date, record]));
  let expectedBalanceCents = 0n;

  return [...dates].sort().map((date) => {
    const dayPayments = payments.filter((payment) => payment.date === date);
    const dayEntries = activeEntries.filter((entry) => entry.date === date);
    const record = recordByDate.get(date) || null;
    const investmentCents = sum(
      dayEntries.filter((entry) => entry.type === 'investment').map((entry) => entry.amountCents),
    );
    const systemPaymentsCents = sum(dayPayments.map((payment) => payment.amountCents));
    const adjustmentCreditCents = sum(
      dayEntries.filter((entry) => entry.type === 'adjustment_credit').map((entry) => entry.amountCents),
    );
    const adjustmentDebitCents = sum(
      dayEntries.filter((entry) => entry.type === 'adjustment_debit').map((entry) => entry.amountCents),
    );

    expectedBalanceCents +=
      investmentCents -
      systemPaymentsCents +
      adjustmentCreditCents -
      adjustmentDebitCents;

    const differenceCents =
      record?.bankPaymentsCents === null || record?.bankPaymentsCents === undefined
        ? null
        : record.bankPaymentsCents -
          systemPaymentsCents +
          adjustmentCreditCents -
          adjustmentDebitCents;
    const balanceDifferenceCents =
      record?.bankBalanceCents === null || record?.bankBalanceCents === undefined
        ? null
        : record.bankBalanceCents - expectedBalanceCents;
    const status: FinanceAccountDayStatus =
      differenceCents === null
        ? 'pending'
        : differenceCents === 0n
          ? 'reconciled'
          : 'divergent';

    return {
      date,
      investmentCents,
      systemPaymentsCents,
      bankPaymentsCents: record?.bankPaymentsCents ?? null,
      adjustmentCreditCents,
      adjustmentDebitCents,
      differenceCents,
      expectedBalanceCents,
      bankBalanceCents: record?.bankBalanceCents ?? null,
      balanceDifferenceCents,
      status,
      record,
      payments: dayPayments,
      entries: dayEntries,
    };
  });
}

export function buildFinanceAccountConsolidated(
  days: FinanceAccountDaySummary[],
): FinanceAccountConsolidated {
  const latestWithBalance = [...days]
    .filter((day) => day.bankBalanceCents !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const investmentCents = sum(days.map((day) => day.investmentCents));
  const systemPaymentsCents = sum(days.map((day) => day.systemPaymentsCents));
  const adjustmentCreditCents = sum(days.map((day) => day.adjustmentCreditCents));
  const adjustmentDebitCents = sum(days.map((day) => day.adjustmentDebitCents));
  const expectedBalanceCents =
    investmentCents - systemPaymentsCents + adjustmentCreditCents - adjustmentDebitCents;
  const actualBalanceCents = latestWithBalance?.bankBalanceCents ?? null;

  return {
    investmentCents,
    systemPaymentsCents,
    adjustmentCreditCents,
    adjustmentDebitCents,
    expectedBalanceCents,
    actualBalanceCents,
    balanceDifferenceCents:
      actualBalanceCents === null ? null : actualBalanceCents - expectedBalanceCents,
    actualBalanceDate: latestWithBalance?.date ?? null,
    reconciledDays: days.filter((day) => day.status === 'reconciled').length,
    divergentDays: days.filter((day) => day.status === 'divergent').length,
    pendingDays: days.filter((day) => day.status === 'pending').length,
  };
}
