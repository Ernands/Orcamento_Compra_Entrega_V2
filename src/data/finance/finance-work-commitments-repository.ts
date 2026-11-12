import { supabase } from '../supabase/client';
import type { FinancePaymentsView } from '../../domain/finance-payments';

/**
 * A server-side projection of the WORKS part of buildUnifiedFinancePayments.
 * It is not the consolidated financial model: do not silently merge its
 * totals with existing finance totals (purchases and refunds are separate).
 */
export interface FinanceWorkCommitmentRow {
  id: string;
  paymentId: string | null;
  workId: string;
  referenceCode: string;
  counterpart: string;
  description: string;
  storeId: string;
  storeCode: string;
  state: string;
  status: FinancePaymentsView;
  date: string | null;
  amountCents: bigint;
  paymentMethod: string | null;
  sourceLabel: string | null;
  installmentLabel: string;
  forwardedToFinance: boolean | null;
  notes: string | null;
}
export interface FinanceWorkCommitmentsPage {
  page: number;
  pageSize: number;
  totalCount: number;
  paidCents: bigint;
  plannedCents: bigint;
  unscheduledCents: bigint;
  commitmentCents: bigint;
  rows: FinanceWorkCommitmentRow[];
}
interface RawWorkRow {
  id: string;
  payment_id: string | null;
  work_id: string;
  reference_code: string;
  counterpart: string;
  description: string;
  store_id: string;
  store_code: string;
  state: string;
  status: FinancePaymentsView;
  event_date: string | null;
  amount_cents: string;
  payment_method: string | null;
  source_label: string | null;
  installment_label: string;
  forwarded_to_finance: boolean | null;
  notes: string | null;
}
interface RawWorkPage {
  page: number;
  page_size: number;
  total_count: number;
  paid_cents: string;
  planned_cents: string;
  unscheduled_cents: string;
  commitment_cents: string;
  rows: RawWorkRow[];
}
export async function listFinanceWorkCommitmentsPage(filters: {
  page?: number;
  pageSize?: number;
  status?: FinancePaymentsView | null;
  storeIds?: string[] | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  query?: string | null;
} = {}): Promise<FinanceWorkCommitmentsPage> {
  const { data, error } = await supabase.rpc('finance_work_commitments_page_v1', {
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 50,
    p_status: filters.status ?? null,
    p_store_ids: filters.storeIds ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_query: filters.query || null,
  });
  if (error) throw error;
  const raw = data as unknown as RawWorkPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.total_count) || !Number.isInteger(raw.page) ||
      !Number.isInteger(raw.page_size)) {
    throw new Error('A consulta de Obras retornou um contrato de dados inválido.');
  }
  const totals = {
    paidCents: BigInt(raw.paid_cents),
    plannedCents: BigInt(raw.planned_cents),
    unscheduledCents: BigInt(raw.unscheduled_cents),
    commitmentCents: BigInt(raw.commitment_cents),
  };
  if (totals.paidCents + totals.plannedCents + totals.unscheduledCents !== totals.commitmentCents) {
    throw new Error('Totais de Obras inconsistentes entre situações financeiras.');
  }
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    ...totals,
    rows: raw.rows.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      workId: row.work_id,
      referenceCode: row.reference_code,
      counterpart: row.counterpart,
      description: row.description,
      storeId: row.store_id,
      storeCode: row.store_code,
      state: row.state,
      status: row.status,
      date: row.event_date,
      amountCents: BigInt(row.amount_cents),
      paymentMethod: row.payment_method,
      sourceLabel: row.source_label,
      installmentLabel: row.installment_label,
      forwardedToFinance: row.forwarded_to_finance,
      notes: row.notes,
    })),
  };
}
