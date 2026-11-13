import { supabase } from '../supabase/client';

/**
 * A single-adjustment-per-payment read-only reconciliation snapshot.
 * This does not replace the canonical paid, planned or store-level totals.
 * Always treat invalid/incomplete data as a blocking condition.
 */
export interface FinancePurchaseAdjustmentSnapshot {
  id: string;
  purchaseId: string;
  orderId: string;
  paymentId: string;
  referenceCode: string;
  reference: string;
  refundedOn: string;
  grossCents: bigint;
  netCents: bigint;
  refundedCents: bigint;
  cancelledCents: bigint;
  freightReductionCents: bigint;
  residualCents: bigint;
  refundEntryCents: bigint;
  entryCount: number;
  isValid: boolean;
}
export interface FinancePurchaseAdjustmentPage {
  page: number;
  pageSize: number;
  totalCount: number;
  invalidCount: number;
  isComplete: boolean;
  grossCents: bigint;
  netCents: bigint;
  refundedCents: bigint;
  rows: FinancePurchaseAdjustmentSnapshot[];
}
interface RawAdjustment {
  id: string;
  purchase_id: string;
  order_id: string;
  payment_id: string;
  reference_code: string;
  reference: string;
  refunded_on: string;
  original_cents: string;
  remaining_cents: string;
  refund_cents: string;
  cancelled_cents: string;
  freight_reduction_cents: string;
  residual_cents: string;
  refund_entry_cents: string;
  entry_count: number;
  is_valid: boolean;
}
interface RawPage {
  page: number;
  page_size: number;
  total_count: number;
  invalid_count: number;
  is_complete: boolean;
  original_cents_total: string;
  remaining_cents_total: string;
  refund_cents_total: string;
  rows: RawAdjustment[];
}

export async function listFinancePurchaseAdjustmentsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseAdjustmentPage> {
  const { data, error } = await supabase.rpc('finance_purchase_adjustment_reconciliation_v1', {
    p_page: options.page ?? 1,
    p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;

  const raw = data as unknown as RawPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
    !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
    !Number.isInteger(raw.total_count) || !Number.isInteger(raw.invalid_count) ||
    typeof raw.is_complete !== 'boolean') {
    throw new Error('Consulta de ajustes parciais retornou um contrato inválido.');
  }
  if (raw.is_complete !== (raw.invalid_count === 0)) {
    throw new Error('Indicador de integridade dos ajustes está inconsistente.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error('Histórico de ajustes parcialmente inconsistente: ' +
      raw.invalid_count + ' registro(s) precisam de conferência.');
  }
  const grossCents = BigInt(raw.original_cents_total);
  const netCents = BigInt(raw.remaining_cents_total);
  const refundedCents = BigInt(raw.refund_cents_total);
  const rows = raw.rows.map((r): FinancePurchaseAdjustmentSnapshot => ({
    id: r.id,
    purchaseId: r.purchase_id,
    orderId: r.order_id,
    paymentId: r.payment_id,
    referenceCode: r.reference_code,
    reference: r.reference,
    refundedOn: r.refunded_on,
    grossCents: BigInt(r.original_cents),
    netCents: BigInt(r.remaining_cents),
    refundedCents: BigInt(r.refund_cents),
    cancelledCents: BigInt(r.cancelled_cents),
    freightReductionCents: BigInt(r.freight_reduction_cents),
    residualCents: BigInt(r.residual_cents),
    refundEntryCents: BigInt(r.refund_entry_cents),
    entryCount: r.entry_count,
    isValid: r.is_valid,
  }));
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    invalidCount: raw.invalid_count,
    isComplete: raw.is_complete,
    grossCents,
    netCents,
    refundedCents,
    rows,
  };
}
