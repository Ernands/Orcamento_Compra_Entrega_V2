import { supabase } from '../supabase/client';

/** Raw source payments only; do not use these gross cents as official
 * paid/planned/unscheduled totals or reconciliation balances.
 * Those require installments, occurrence-level dates, refunds and store rates.
 */
export interface FinancePaymentSource {
  source: 'purchase' | 'work';
  paymentId: string;
  sourceId: string;
  referenceCode: string;
  counterpart: string;
  status: string;
  eventDate: string | null;
  grossAmountCents: bigint;
  storeId: string | null;
}

export interface FinancePaymentSourcesPage {
  page: number;
  pageSize: number;
  totalCount: number;
  rawTotalCents: bigint;
  rawPaidCents: bigint;
  rawPlannedCents: bigint;
  rows: FinancePaymentSource[];
}

interface RawFinanceSource {
  source: 'purchase' | 'work';
  payment_id: string;
  source_id: string;
  reference_code: string;
  counterpart: string;
  status: string;
  event_date: string | null;
  gross_amount_cents: string;
  store_id: string | null;
}

interface RawFinanceSourcePage {
  page: number;
  page_size: number;
  total_count: number;
  raw_total_cents: string;
  raw_paid_cents: string;
  raw_planned_cents: string;
  rows: RawFinanceSource[];
}

export async function listFinancePaymentSourcesPage(filters: {
  page?: number;
  pageSize?: number;
  status?: string | null;
  source?: 'purchase' | 'work' | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  query?: string | null;
} = {}): Promise<FinancePaymentSourcesPage> {
  const { data, error } = await supabase.rpc('finance_payment_sources_page_v1', {
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 50,
    p_status: filters.status || null,
    p_source: filters.source || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_query: filters.query || null,
  });

  if (error) throw error;
  const raw = data as unknown as RawFinanceSourcePage | null;
  if (!raw || !Array.isArray(raw.rows) || !Number.isInteger(raw.total_count)) {
    throw new Error('A consulta financeira retornou um contrato de dados inválido.');
  }
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    rawTotalCents: BigInt(raw.raw_total_cents),
    rawPaidCents: BigInt(raw.raw_paid_cents),
    rawPlannedCents: BigInt(raw.raw_planned_cents),
    rows: raw.rows.map((row) => ({
      source: row.source,
      paymentId: row.payment_id,
      sourceId: row.source_id,
      referenceCode: row.reference_code,
      counterpart: row.counterpart,
      status: row.status,
      eventDate: row.event_date,
      grossAmountCents: BigInt(row.gross_amount_cents),
      storeId: row.store_id,
    })),
  };
}
