import { supabase } from '../supabase/client';

export interface FinancePurchaseCombinedGroup {
  id: string;
  status: 'paid' | 'planned';
  date: string;
  supplierName: string;
  paymentMethod: string | null;
  sourceLabel: string | null;
  eventCount: number;
  purchaseCount: number;
  sourceEventIds: string[];
  referenceCodes: string[];
  amountCents: bigint;
}
export interface FinancePurchaseCombinedPage {
  page: number;
  pageSize: number;
  totalCount: number;
  amountCentsTotal: bigint;
  unsupportedPaymentCount: number;
  isComplete: boolean;
  rows: FinancePurchaseCombinedGroup[];
}
interface RawRow {
  id: string;
  status: 'paid' | 'planned';
  event_date: string;
  supplier_name: string;
  payment_method: string | null;
  source_label: string | null;
  event_count: number;
  purchase_count: number;
  source_event_ids: string[];
  reference_codes: string[];
  amount_cents: string;
}
interface RawPage {
  page: number;
  page_size: number;
  total_count: number;
  amount_cents_total: string;
  unsupported_payment_count: number;
  is_complete: boolean;
  rows: RawRow[];
}
/**
 * Read-only cross-CMP groups for the Preview parity audit, not a
 * replacement for the original combined payment engine.
 */
export async function listFinancePurchaseCombinedGroupsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseCombinedPage> {
  const { data, error } = await supabase.rpc('finance_purchase_combined_groups_page_v1', {
    p_page: options.page ?? 1,
    p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RawPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) || !Number.isInteger(raw.unsupported_payment_count) ||
      typeof raw.is_complete !== 'boolean' ||
      raw.total_count < 0 || raw.unsupported_payment_count < 0) {
    throw new Error('RPC de consolidação entre CMPs retornou contrato inválido.');
  }
  if (raw.is_complete !== (raw.unsupported_payment_count === 0)) {
    throw new Error('Cobertura de consolidação entre CMPs é inconsistente.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error(raw.unsupported_payment_count +
      ' pagamento(s) de compra combinada não podem ser consolidados pelo SQL.');
  }
  const rows = raw.rows.map((r): FinancePurchaseCombinedGroup => {
    if (!Array.isArray(r.source_event_ids) || !Array.isArray(r.reference_codes) ||
        !Number.isInteger(r.event_count) || !Number.isInteger(r.purchase_count) ||
        !['paid', 'planned'].includes(r.status)) {
      throw new Error('Grupo SQL de Compras com campos inválidos.');
    }
    return {
      id: r.id, status: r.status, date: r.event_date,
      supplierName: r.supplier_name, paymentMethod: r.payment_method,
      sourceLabel: r.source_label, eventCount: r.event_count,
      purchaseCount: r.purchase_count,
      sourceEventIds: r.source_event_ids,
      referenceCodes: r.reference_codes,
      amountCents: BigInt(r.amount_cents),
    };
  });
  for (const row of rows) {
    const expectedId = 'combined:' + [...row.sourceEventIds].sort().join('|');
    if (row.id !== expectedId || row.eventCount !== row.sourceEventIds.length ||
        row.eventCount < 2 || new Set(row.sourceEventIds).size !== row.eventCount ||
        row.purchaseCount < 1 || row.referenceCodes.length < 1 ||
        new Set(row.referenceCodes).size !== row.referenceCodes.length) {
      throw new Error('Consolidação de CMPs inválida: ' + row.id);
    }
  }
  return {
    page: raw.page, pageSize: raw.page_size,
    totalCount: raw.total_count,
    amountCentsTotal: BigInt(raw.amount_cents_total),
    unsupportedPaymentCount: raw.unsupported_payment_count,
    isComplete: raw.is_complete,
    rows,
  };
}
