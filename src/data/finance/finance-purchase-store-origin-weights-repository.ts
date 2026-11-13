import { supabase } from '../supabase/client';

export interface FinancePurchaseStoreOriginWeights {
  storeId: string;
  storeCode: string;
  equipmentCents: bigint;
  furnitureCents: bigint;
  allocatedCents: bigint;
}
export interface FinancePurchaseOrderOriginWeights {
  purchaseId: string;
  orderId: string;
  referenceCode: string;
  contractedCents: bigint;
  allocatedCents: bigint;
  unallocatedCents: bigint;
  stores: FinancePurchaseStoreOriginWeights[];
}
export interface FinancePurchaseStoreOriginPage {
  page: number;
  pageSize: number;
  totalCount: number;
  unsupportedPurchaseCount: number;
  isComplete: boolean;
  contractedCents: bigint;
  allocatedCents: bigint;
  unallocatedCents: bigint;
  rows: FinancePurchaseOrderOriginWeights[];
}
interface RawStore {
  store_id: string;
  store_code: string;
  equipment_cents: string;
  furniture_cents: string;
  allocated_cents: string;
}
interface RawOrder {
  purchase_id: string;
  order_id: string;
  reference_code: string;
  contracted_cents: string;
  allocated_cents: string;
  unallocated_cents: string;
  stores: RawStore[];
}
interface RawPage {
  page: number;
  page_size: number;
  total_count: number;
  unsupported_purchase_count: number;
  is_complete: boolean;
  total_contracted_cents: string;
  total_allocated_cents: string;
  total_unallocated_cents: string;
  rows: RawOrder[];
}

/**
 * Read-only cost WEIGHTS by store and origin; NOT event payment allocations.
 * Never use these weights as paid/plan/unscheduled official amounts.
 */
export async function listFinancePurchaseStoreOriginWeightsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePurchaseStoreOriginPage> {
  const { data, error } = await supabase.rpc('finance_purchase_store_origin_weights_page_v1', {
    p_page: options.page ?? 1, p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RawPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) ||
      !Number.isInteger(raw.unsupported_purchase_count) ||
      typeof raw.is_complete !== 'boolean' ||
      raw.page < 1 || raw.page_size < 1 || raw.page_size > 100 ||
      raw.total_count < 0 || raw.unsupported_purchase_count < 0 ||
      raw.is_complete !== (raw.unsupported_purchase_count === 0)) {
    throw new Error('Projeção SQL de pesos por loja/origem retornou contrato inválido.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error('Pesos SQL incompletos: '+raw.unsupported_purchase_count+
      ' compra(s) ajustadas, com custo indefinido ou distribuição ambígua.');
  }
  const contractedCents = BigInt(raw.total_contracted_cents);
  const allocatedCents = BigInt(raw.total_allocated_cents);
  const unallocatedCents = BigInt(raw.total_unallocated_cents);
  if (contractedCents !== allocatedCents + unallocatedCents ||
      allocatedCents < 0n || unallocatedCents < 0n) {
    throw new Error('Totais da projeção SQL por loja/origem não conservam centavos.');
  }
  const rows = raw.rows.map((r): FinancePurchaseOrderOriginWeights => {
    if (!Array.isArray(r.stores)) throw new Error('Lojas de pedido ausentes da projeção SQL.');
    const stores = r.stores.map((s): FinancePurchaseStoreOriginWeights => ({
      storeId: s.store_id,
      storeCode: s.store_code,
      equipmentCents: BigInt(s.equipment_cents),
      furnitureCents: BigInt(s.furniture_cents),
      allocatedCents: BigInt(s.allocated_cents),
    }));
    const order: FinancePurchaseOrderOriginWeights = {
      purchaseId: r.purchase_id,
      orderId: r.order_id,
      referenceCode: r.reference_code,
      contractedCents: BigInt(r.contracted_cents),
      allocatedCents: BigInt(r.allocated_cents),
      unallocatedCents: BigInt(r.unallocated_cents),
      stores,
    };
    const ids = new Set(stores.map(s => s.storeId));
    if (ids.size !== stores.length ||
        stores.some(s => !s.storeId || s.equipmentCents < 0n || s.furnitureCents < 0n ||
          s.equipmentCents + s.furnitureCents !== s.allocatedCents) ||
        stores.reduce((sum,s)=>sum+s.allocatedCents,0n) !== order.allocatedCents ||
        order.contractedCents !== order.allocatedCents + order.unallocatedCents ||
        order.unallocatedCents < 0n) {
      throw new Error('Pesos por loja/origem divergentes no pedido '+order.orderId);
    }
    return order;
  });
  if (new Set(rows.map(r => r.orderId)).size !== rows.length ||
      rows.length > raw.page_size) {
    throw new Error('Paginação SQL de pesos por loja/origem duplicou pedidos.');
  }
  return {
    page: raw.page, pageSize: raw.page_size, totalCount: raw.total_count,
    unsupportedPurchaseCount: raw.unsupported_purchase_count, isComplete: raw.is_complete,
    contractedCents, allocatedCents, unallocatedCents, rows,
  };
}
