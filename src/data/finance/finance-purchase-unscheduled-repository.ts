import { supabase } from '../supabase/client';

export interface FinancePurchaseUnscheduledRow {
  id: string;
  purchaseId: string;
  orderId: string;
  referenceCode: string;
  contractedCents: bigint;
  linkedCents: bigint;
  generalAllocatedCents: bigint;
  amountCents: bigint;
}

export interface FinancePurchaseUnscheduledPage {
  page: number;
  pageSize: number;
  totalCount: number;
  unscheduledCents: bigint;
  unsupportedPurchaseCount: number;
  isComplete: boolean;
  rows: FinancePurchaseUnscheduledRow[];
}

interface RpcRow {
  id: string;
  purchase_id: string;
  order_id: string;
  reference_code: string;
  contracted_cents: string;
  linked_cents: string;
  general_allocated_cents: string;
  amount_cents: string;
}
interface RpcPage {
  page: number;
  page_size: number;
  total_count: number;
  unscheduled_cents: string;
  unsupported_purchase_count: number;
  is_complete: boolean;
  rows: RpcRow[];
}

/**
 * RLS-scoped and READ ONLY; never use as official financial balance before
 * full parity of adjusted purchases and allocation by financial origin/store.
 */
export async function listFinancePurchaseUnscheduledPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseUnscheduledPage> {
  const { data, error } = await supabase.rpc('finance_purchase_unscheduled_page_v1', {
    p_page: options.page ?? 1,
    p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RpcPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
    !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
    !Number.isInteger(raw.total_count) || !Number.isInteger(raw.unsupported_purchase_count) ||
    typeof raw.is_complete !== 'boolean' ||
    raw.total_count < 0 || raw.unsupported_purchase_count < 0) {
    throw new Error('Consulta de saldos sem programação retornou contrato inválido.');
  }
  if (raw.is_complete !== (raw.unsupported_purchase_count === 0)) {
    throw new Error('Indicador de cobertura dos saldos SQL está inconsistente.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error(
      'Saldos SQL incompletos: ' + raw.unsupported_purchase_count +
      ' compra(s) com ajustes ou linhas sem valor precisam do cálculo legado.',
    );
  }
  const rows = raw.rows.map((row): FinancePurchaseUnscheduledRow => ({
    id: row.id,
    purchaseId: row.purchase_id,
    orderId: row.order_id,
    referenceCode: row.reference_code,
    contractedCents: BigInt(row.contracted_cents),
    linkedCents: BigInt(row.linked_cents),
    generalAllocatedCents: BigInt(row.general_allocated_cents),
    amountCents: BigInt(row.amount_cents),
  }));
  for (const row of rows) {
    if (row.amountCents <= 0n ||
        row.amountCents !== row.contractedCents - row.linkedCents - row.generalAllocatedCents) {
      throw new Error('Saldo sem programação SQL com diferença de centavos: ' + row.id);
    }
  }
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    unscheduledCents: BigInt(raw.unscheduled_cents),
    unsupportedPurchaseCount: raw.unsupported_purchase_count,
    isComplete: raw.is_complete,
    rows,
  };
}
