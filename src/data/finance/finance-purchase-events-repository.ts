import { supabase } from '../supabase/client';

export type PurchaseEventStatus = 'paid' | 'planned';

/**
 * A purchase PAYMENT EVENT read model, not the complete Financeiro ledger.
 * Never use it as an official balance: store allocation, CMP consolidation,
 * unscheduled residuals, occurrences and refund credits need further parity.
 */
export interface FinancePurchaseEvent {
  id: string;
  paymentId: string;
  purchaseId: string;
  orderId: string | null;
  referenceCode: string;
  counterpart: string;
  status: PurchaseEventStatus;
  date: string;
  amountCents: bigint;
  paymentMethod: string;
  sourceLabel: string | null;
  installmentLabel: string;
}

export interface FinancePurchaseEventsPage {
  page: number;
  pageSize: number;
  totalCount: number;
  paidCents: bigint;
  plannedCents: bigint;
  unsupportedPurchaseCount: number;
  unsupportedPaymentCount: number;
  isComplete: boolean;
  rows: FinancePurchaseEvent[];
}
interface RawFinancePurchaseEvent {
  id: string;
  payment_id: string;
  purchase_id: string;
  order_id: string | null;
  reference_code: string;
  counterpart: string;
  status: PurchaseEventStatus;
  event_date: string;
  amount_cents: string;
  payment_method: string;
  source_label: string | null;
  installment_label: string;
}
interface RawFinancePurchaseEventsPage {
  page: number;
  page_size: number;
  total_count: number;
  paid_cents: string;
  planned_cents: string;
  unsupported_purchase_count: number;
  unsupported_payment_count: number;
  is_complete: boolean;
  rows: RawFinancePurchaseEvent[];
}

/** Fail closed on partial responses by default.
 * allowIncomplete is exclusively for diagnostic reporting of exclusions.
 */
export async function listFinancePurchaseEventsPage(filters: {
  page?: number;
  pageSize?: number;
  status?: PurchaseEventStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  query?: string | null;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseEventsPage> {
  const { data, error } = await supabase.rpc('finance_purchase_events_page_v1', {
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 50,
    p_status: filters.status ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_query: filters.query || null,
  });
  if (error) throw error;

  const raw = data as unknown as RawFinancePurchaseEventsPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) ||
      !Number.isInteger(raw.unsupported_payment_count) ||
      !Number.isInteger(raw.unsupported_purchase_count) ||
      typeof raw.is_complete !== 'boolean') {
    throw new Error('A projeção financeira de Compras retornou um contrato inválido.');
  }
  if (raw.is_complete !== (raw.unsupported_payment_count === 0)) {
    throw new Error('O indicador de integridade da projeção financeira é inconsistente.');
  }
  if (!raw.is_complete && !filters.allowIncomplete) {
    throw new Error(
      'Projeção financeira incompleta: ' + raw.unsupported_purchase_count +
      ' compra(s) e ' + raw.unsupported_payment_count +
      ' pagamento(s) requerem a conciliação financeira legada.',
    );
  }

  const paidCents = BigInt(raw.paid_cents);
  const plannedCents = BigInt(raw.planned_cents);
  const rows = raw.rows.map((row): FinancePurchaseEvent => ({
    id: row.id,
    paymentId: row.payment_id,
    purchaseId: row.purchase_id,
    orderId: row.order_id,
    referenceCode: row.reference_code,
    counterpart: row.counterpart,
    status: row.status,
    date: row.event_date,
    amountCents: BigInt(row.amount_cents),
    paymentMethod: row.payment_method,
    sourceLabel: row.source_label,
    installmentLabel: row.installment_label,
  }));
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    paidCents,
    plannedCents,
    unsupportedPurchaseCount: raw.unsupported_purchase_count,
    unsupportedPaymentCount: raw.unsupported_payment_count,
    isComplete: raw.is_complete,
    rows,
  };
}
