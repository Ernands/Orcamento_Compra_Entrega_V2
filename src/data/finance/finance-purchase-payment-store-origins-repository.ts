import { supabase } from '../supabase/client';

export interface FinancePaymentStoreAllocationSql {
  storeId: string;
  storeCode: string;
  amountCents: bigint;
  equipmentCents: bigint;
  furnitureCents: bigint;
  worksCents: bigint;
}
export interface FinancePaymentStoreOriginSqlEvent {
  id: string;
  purchaseId: string;
  orderId: string | null;
  referenceCode: string;
  status: 'paid' | 'planned';
  date: string;
  amountCents: bigint;
  allocatedCents: bigint;
  unallocatedCents: bigint;
  stores: FinancePaymentStoreAllocationSql[];
}
export interface FinancePaymentStoreOriginSqlPage {
  page: number;
  pageSize: number;
  totalCount: number;
  unsupportedPurchaseCount: number;
  unsupportedPaymentCount: number;
  isComplete: boolean;
  pageAmountCents: bigint;
  pageAllocatedCents: bigint;
  rows: FinancePaymentStoreOriginSqlEvent[];
}
interface RawStore {
  store_id: string;
  store_code: string;
  amount_cents: string;
  equipment_cents: string;
  furniture_cents: string;
  works_cents: string;
}
interface RawEvent {
  id: string;
  purchase_id: string;
  order_id: string | null;
  reference_code: string;
  event_date: string;
  status: 'paid' | 'planned';
  amount_cents: string;
  allocated_cents: string;
  unallocated_cents: string;
  stores: RawStore[];
}
interface RawPage {
  page: number;
  page_size: number;
  total_count: number;
  unsupported_purchase_count: number;
  unsupported_payment_count: number;
  is_complete: boolean;
  page_amount_cents: string;
  page_allocated_cents: string;
  rows: RawEvent[];
}

/** Only for parity in Preview #85; never use as an official financial source. */
export async function listFinancePaymentStoreOriginsPage(options: {
  page?: number;
  pageSize?: number;
  allowIncomplete?: boolean;
} = {}): Promise<FinancePaymentStoreOriginSqlPage> {
  const { data, error } = await supabase.rpc('finance_purchase_payment_store_origins_page_v1', {
    p_page: options.page ?? 1,
    p_page_size: options.pageSize ?? 50,
  });
  if (error) throw error;
  const raw = data as unknown as RawPage | null;
  if (!raw || !Array.isArray(raw.rows) ||
      !Number.isInteger(raw.page) || !Number.isInteger(raw.page_size) ||
      !Number.isInteger(raw.total_count) ||
      !Number.isInteger(raw.unsupported_purchase_count) ||
      !Number.isInteger(raw.unsupported_payment_count) ||
      typeof raw.is_complete !== 'boolean' ||
      raw.page < 1 || raw.page_size < 1 || raw.page_size > 100 ||
      raw.total_count < 0 || raw.unsupported_purchase_count < 0 ||
      raw.unsupported_payment_count < 0 ||
      (raw.is_complete &&
        (raw.unsupported_purchase_count > 0 || raw.unsupported_payment_count > 0))) {
    throw new Error('Contrato inválido da projeção de pagamentos por loja/origem.');
  }
  if (!raw.is_complete && !options.allowIncomplete) {
    throw new Error('Rateio SQL por loja/origem incompleto: pagamentos ou compras excluídos.');
  }
  const rows = raw.rows.map((r): FinancePaymentStoreOriginSqlEvent => {
    if (!Array.isArray(r.stores) || !r.id || !r.purchase_id ||
        !r.reference_code || !['paid', 'planned'].includes(r.status)) {
      throw new Error('Evento inválido na projeção SQL por loja/origem.');
    }
    const stores = r.stores.map((s): FinancePaymentStoreAllocationSql => ({
      storeId: s.store_id,
      storeCode: s.store_code,
      amountCents: BigInt(s.amount_cents),
      equipmentCents: BigInt(s.equipment_cents),
      furnitureCents: BigInt(s.furniture_cents),
      worksCents: BigInt(s.works_cents),
    }));
    const item: FinancePaymentStoreOriginSqlEvent = {
      id: r.id,
      purchaseId: r.purchase_id,
      orderId: r.order_id,
      referenceCode: r.reference_code,
      status: r.status,
      date: r.event_date,
      amountCents: BigInt(r.amount_cents),
      allocatedCents: BigInt(r.allocated_cents),
      unallocatedCents: BigInt(r.unallocated_cents),
      stores,
    };
    if (item.amountCents < 0n || item.allocatedCents < 0n || item.unallocatedCents < 0n ||
        item.amountCents !== item.allocatedCents + item.unallocatedCents ||
        new Set(stores.map(s => s.storeId)).size !== stores.length ||
        stores.some(s => !s.storeId || s.amountCents <= 0n ||
          s.equipmentCents < 0n || s.furnitureCents < 0n || s.worksCents < 0n ||
          s.amountCents !== s.equipmentCents + s.furnitureCents + s.worksCents) ||
        stores.reduce((total,s)=>total+s.amountCents,0n) !== item.allocatedCents) {
      throw new Error('Centavos ou lojas inconsistentes no evento '+r.id);
    }
    return item;
  });
  if (rows.length > raw.page_size || rows.length > raw.total_count ||
      new Set(rows.map(r => r.id)).size !== rows.length) {
    throw new Error('Paginação SQL de pagamentos por loja/origem duplicou eventos.');
  }
  const pageAmountCents = BigInt(raw.page_amount_cents);
  const pageAllocatedCents = BigInt(raw.page_allocated_cents);
  if (rows.reduce((sum,r)=>sum+r.amountCents,0n) !== pageAmountCents ||
      rows.reduce((sum,r)=>sum+r.allocatedCents,0n) !== pageAllocatedCents) {
    throw new Error('Soma da página de pagamentos por loja/origem divergente.');
  }
  return {
    page: raw.page, pageSize: raw.page_size, totalCount: raw.total_count,
    unsupportedPurchaseCount: raw.unsupported_purchase_count,
    unsupportedPaymentCount: raw.unsupported_payment_count,
    isComplete: raw.is_complete, pageAmountCents, pageAllocatedCents, rows,
  };
}
