import { supabase } from '../supabase/client';
import type {
  FinanceReimbursement,
  FinanceReimbursementItem,
  FinanceReimbursementStatus,
  SaveFinanceReimbursementInput,
} from '../../domain/finance-types';

type Numeric = number | string;

type ReimbursementRow = {
  id: string;
  codigo_negocio: string;
  store_id: string;
  store_code_snapshot: string;
  store_name_snapshot: string;
  store_city_snapshot: string;
  store_state_snapshot: string;
  status: FinanceReimbursementStatus;
  protocol: string | null;
  notes: string | null;
  requested_at: string | null;
  decided_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReimbursementItemRow = {
  id: string;
  reimbursement_id: string;
  store_id: string;
  purchase_id: string;
  purchase_order_id: string;
  purchase_code_snapshot: string;
  supplier_name_snapshot: string;
  eligible_amount_snapshot: Numeric;
  requested_amount: Numeric;
  approved_amount: Numeric;
  received_amount: Numeric;
  notes: string | null;
  created_at: string;
};

function stringValue(value: Numeric): string {
  return String(value);
}

function mapItem(row: ReimbursementItemRow): FinanceReimbursementItem {
  return {
    id: row.id,
    reimbursementId: row.reimbursement_id,
    storeId: row.store_id,
    purchaseId: row.purchase_id,
    purchaseOrderId: row.purchase_order_id,
    purchaseCode: row.purchase_code_snapshot,
    supplierName: row.supplier_name_snapshot,
    eligibleAmount: stringValue(row.eligible_amount_snapshot),
    requestedAmount: stringValue(row.requested_amount),
    approvedAmount: stringValue(row.approved_amount),
    receivedAmount: stringValue(row.received_amount),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function listFinanceReimbursements(): Promise<FinanceReimbursement[]> {
  const [reimbursementResult, itemResult] = await Promise.all([
    supabase
      .from('finance_reimbursements' as never)
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('finance_reimbursement_items' as never)
      .select('*')
      .order('created_at'),
  ]);

  if (reimbursementResult.error) throw reimbursementResult.error;
  if (itemResult.error) throw itemResult.error;

  const reimbursements = reimbursementResult.data as unknown as ReimbursementRow[];
  const items = itemResult.data as unknown as ReimbursementItemRow[];
  return reimbursements.map((row): FinanceReimbursement => ({
    id: row.id,
    code: row.codigo_negocio,
    storeId: row.store_id,
    storeCode: row.store_code_snapshot,
    storeName: row.store_name_snapshot,
    storeCity: row.store_city_snapshot,
    storeState: row.store_state_snapshot,
    status: row.status,
    protocol: row.protocol,
    notes: row.notes,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.filter((item) => item.reimbursement_id === row.id).map(mapItem),
  }));
}

export function buildFinanceReimbursementRpcPayload(values: SaveFinanceReimbursementInput) {
  return {
    p_reimbursement_id: values.id,
    p_store_id: values.storeId,
    p_status: values.status,
    p_protocol: values.protocol.trim() || null,
    p_notes: values.notes.trim() || null,
    p_items: values.items.map((item) => ({
      purchase_id: item.purchaseId,
      purchase_order_id: item.purchaseOrderId,
      eligible_amount: item.eligibleAmount,
      requested_amount: item.requestedAmount,
      approved_amount: item.approvedAmount || '0',
      received_amount: item.receivedAmount || '0',
      notes: item.notes.trim() || null,
    })),
  };
}

export async function saveFinanceReimbursement(
  values: SaveFinanceReimbursementInput,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'save_finance_reimbursement_v1' as never,
    buildFinanceReimbursementRpcPayload(values) as never,
  );
  if (error) throw new Error(error.message);
  return data;
}
