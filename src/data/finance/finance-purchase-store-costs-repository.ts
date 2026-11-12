import { supabase } from '../supabase/client';

export interface FinancePurchaseOrderCostRow {
  purchaseId: string;
  orderId: string;
  referenceCode: string;
  contractedCents: bigint;
  allocatedCents: bigint;
  unallocatedCents: bigint;
  stores: Array<{ storeId: string; storeCode: string; costCents: bigint }>;
}

export interface FinancePurchaseOrderCostPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalContractedCents: bigint;
  totalAllocatedCents: bigint;
  unsupportedPurchaseCount: number;
  isComplete: boolean;
  rows: FinancePurchaseOrderCostRow[];
}

interface RawOrder {
  purchase_id: string;
  order_id: string;
  reference_code: string;
  contracted_cents: string;
  allocated_cents: string;
  unallocated_cents: string;
  stores: Array<{ store_id: string; store_code: string; cost_cents: string }>;
}
interface RawPage {
  page: number;
  page_size: number;
  total_count: number;
  total_contracted_cents: string;
  total_allocated_cents: string;
  unsupported_purchase_count: number;
  is_complete: boolean;
  rows: RawOrder[];
}

/**
 * Diagnostic, read-only contracted cost weights by store, not the official
 * paid/planed allocations or a substitute for financial KPIs.
 */
export async function listFinancePurchaseStoreCostsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseOrderCostPage> {
  const { data, error } = await supabase.rpc('finance_purchase_store_costs_page_v1', {
    p_page: options.page ?? 1,
    p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RawPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) || !Number.isInteger(raw.unsupported_purchase_count) ||
      typeof raw.is_complete !== 'boolean' ||
      raw.total_count < 0 || raw.unsupported_purchase_count < 0) {
    throw new Error('Projeção de custos por loja retornou contrato inválido.');
  }
  if (raw.is_complete !== (raw.unsupported_purchase_count === 0)) {
    throw new Error('Indicador de cobertura dos custos por loja não confere.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error(
      'Rateio SQL incompleto: ' + raw.unsupported_purchase_count +
      ' compra(s) com ajustes, custo desconhecido ou duplicação de lojas.',
    );
  }
  const rows = raw.rows.map((r): FinancePurchaseOrderCostRow => ({
    purchaseId: r.purchase_id,
    orderId: r.order_id,
    referenceCode: r.reference_code,
    contractedCents: BigInt(r.contracted_cents),
    allocatedCents: BigInt(r.allocated_cents),
    unallocatedCents: BigInt(r.unallocated_cents),
    stores: r.stores.map((s) => ({
      storeId: s.store_id,
      storeCode: s.store_code,
      costCents: BigInt(s.cost_cents),
    })),
  }));
  for (const order of rows) {
    const storeIds = new Set(order.stores.map((s) => s.storeId));
    const distributed = order.stores.reduce((total, s) => total + s.costCents, 0n);
    if (order.allocatedCents !== distributed ||
        order.contractedCents !== order.allocatedCents + order.unallocatedCents ||
        order.unallocatedCents < 0n ||
        storeIds.size !== order.stores.length) {
      throw new Error('Custo de pedido SQL com rateio divergente: ' + order.orderId);
    }
  }
  return {
    page: raw.page,
    pageSize: raw.page_size,
    totalCount: raw.total_count,
    totalContractedCents: BigInt(raw.total_contracted_cents),
    totalAllocatedCents: BigInt(raw.total_allocated_cents),
    unsupportedPurchaseCount: raw.unsupported_purchase_count,
    isComplete: raw.is_complete,
    rows,
  };
}
