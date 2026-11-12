import { supabase } from '../supabase/client';

export interface FinancePurchaseOriginEvent {
  id: string;
  purchaseId: string;
  orderId: string | null;
  referenceCode: string;
  status: 'paid' | 'planned';
  date: string;
  amountCents: bigint;
  equipmentCents: bigint;
  furnitureCents: bigint;
  worksCents: bigint;
  unallocatedOriginCents: bigint;
}
export interface FinancePurchaseOriginPage {
  page: number;
  pageSize: number;
  totalCount: number;
  unsupportedPurchaseCount: number;
  isComplete: boolean;
  pageAmountCents: bigint;
  pageAllocatedCents: bigint;
  rows: FinancePurchaseOriginEvent[];
}
interface RawOriginRow {
  id: string;
  purchase_id: string;
  order_id: string | null;
  reference_code: string;
  status: 'paid' | 'planned';
  event_date: string;
  amount_cents: string;
  equipment_cents: string;
  furniture_cents: string;
  works_cents: string;
  unallocated_origin_cents: string;
}
interface RawOriginPage {
  page: number;
  page_size: number;
  total_count: number;
  unsupported_purchase_count: number;
  is_complete: boolean;
  page_amount_cents: string;
  page_origin_allocated_cents: string;
  rows: RawOriginRow[];
}

/**
 * A diagnostic SQL split of each payment EVENT by equipment/furniture/works.
 * No per-store payment allocation yet. The original finance calculation owns
 * every displayed KPI, export and payment operation.
 */
export async function listFinancePurchasePaymentOriginsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseOriginPage> {
  const { data, error } = await supabase.rpc('finance_purchase_payment_origins_page_v1', {
    p_page: options.page ?? 1, p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RawOriginPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) ||
      !Number.isInteger(raw.unsupported_purchase_count) ||
      typeof raw.is_complete !== 'boolean' ||
      raw.total_count < 0 || raw.unsupported_purchase_count < 0) {
    throw new Error('RPC de origem financeira retornou contrato inválido.');
  }
  if (raw.is_complete !== (raw.unsupported_purchase_count === 0)) {
    throw new Error('Cobertura da classificação de origens financeiras é inconsistente.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error('Consulta SQL de origens incompleta para ' +
      raw.unsupported_purchase_count + ' compra(s) com ajustes ou custos desconhecidos.');
  }
  const rows = raw.rows.map((r): FinancePurchaseOriginEvent => ({
    id: r.id, purchaseId: r.purchase_id, orderId: r.order_id,
    referenceCode: r.reference_code, status: r.status, date: r.event_date,
    amountCents: BigInt(r.amount_cents),
    equipmentCents: BigInt(r.equipment_cents),
    furnitureCents: BigInt(r.furniture_cents),
    worksCents: BigInt(r.works_cents),
    unallocatedOriginCents: BigInt(r.unallocated_origin_cents),
  }));
  const amount = rows.reduce((sum, e) => sum + e.amountCents, 0n);
  const allocated = rows.reduce((sum, e) =>
    sum + e.equipmentCents + e.furnitureCents + e.worksCents, 0n);
  if (amount !== BigInt(raw.page_amount_cents) ||
      allocated !== BigInt(raw.page_origin_allocated_cents)) {
    throw new Error('Totais da página de origens financeiras divergem dos eventos.');
  }
  for (const e of rows) {
    if (e.amountCents !== e.equipmentCents + e.furnitureCents +
          e.worksCents + e.unallocatedOriginCents ||
        e.unallocatedOriginCents < 0n) {
      throw new Error('Rateio por origem do pagamento não fecha: '+e.id);
    }
  }
  return {
    page: raw.page, pageSize: raw.page_size,
    totalCount: raw.total_count,
    unsupportedPurchaseCount: raw.unsupported_purchase_count,
    isComplete: raw.is_complete,
    pageAmountCents: amount, pageAllocatedCents: allocated,
    rows,
  };
}
