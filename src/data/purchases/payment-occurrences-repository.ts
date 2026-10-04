import { supabase } from '../supabase/client';
import { buildPurchaseOrderRpcPayloadV2 } from './purchases-v2-repository';
import type {
  PurchaseBatchOperationResultV2,
  RegisterPurchaseOperationResultV2,
} from './purchases-v2-repository';
import type {
  PurchasePaymentOccurrenceInputV2,
  PurchasePaymentOccurrenceV2,
  RegisterPurchaseOperationWithOccurrencesInputV2,
} from '../../domain/payment-occurrences';

function stringValue(value: number | string): string {
  return String(value);
}

export function buildOccurrencePayload(occurrences: PurchasePaymentOccurrenceInputV2[]) {
  return occurrences.map((occurrence) => ({
    occurred_on: occurrence.occurredOn,
    amount: occurrence.amount,
    payment_method: occurrence.paymentMethod,
    reference_label: occurrence.referenceLabel.trim() || null,
    attachment_id: occurrence.attachmentId || null,
    source: occurrence.source || 'manual',
    notes: occurrence.notes?.trim() || null,
  }));
}

function paymentPayload(values: RegisterPurchaseOperationWithOccurrencesInputV2['payments'][number]) {
  return {
    payment_method: values.paymentMethod,
    source_label: values.sourceLabel.trim() || null,
    amount: values.amount,
    entry_amount: values.entryAmount || null,
    installment_count: values.installmentCount ? Number(values.installmentCount) : null,
    first_due_date: values.firstDueDate || null,
    status: values.status,
    paid_at: values.paidAt ? new Date(values.paidAt).toISOString() : null,
    notes: values.notes.trim() || null,
    occurrences: buildOccurrencePayload(values.occurrences || []),
  };
}

export async function listSupplyPurchasePaymentOccurrencesV2(): Promise<PurchasePaymentOccurrenceV2[]> {
  const { data, error } = await supabase
    .from('supply_purchase_payment_occurrences' as never)
    .select('*')
    .order('payment_id')
    .order('position')
    .order('occurred_on');
  if (error) throw error;
  return (data as unknown as Array<{
    id: string;
    payment_id: string;
    attachment_id: string | null;
    occurred_on: string;
    amount: number | string;
    payment_method: PurchasePaymentOccurrenceV2['paymentMethod'];
    reference_label: string | null;
    source: PurchasePaymentOccurrenceV2['source'];
    notes: string | null;
    position: number;
  }>).map((row) => ({
    id: row.id,
    paymentId: row.payment_id,
    attachmentId: row.attachment_id,
    occurredOn: row.occurred_on,
    amount: stringValue(row.amount),
    paymentMethod: row.payment_method,
    referenceLabel: row.reference_label,
    source: row.source,
    notes: row.notes,
    position: row.position,
  }));
}

export async function replaceSupplyPurchasePaymentOccurrencesV2(
  paymentId: string,
  occurrences: PurchasePaymentOccurrenceInputV2[],
): Promise<void> {
  const { error } = await supabase.rpc('replace_supply_purchase_payment_occurrences' as never, {
    p_payment_id: paymentId,
    p_occurrences: buildOccurrencePayload(occurrences),
  } as never);
  if (error) throw new Error(error.message);
}

function operationPayload(values: RegisterPurchaseOperationWithOccurrencesInputV2) {
  const order = buildPurchaseOrderRpcPayloadV2(values);
  return {
    ...order,
    p_payments: values.payments.map(paymentPayload),
  };
}

export async function createSupplyPurchaseOperationWithOccurrencesV2(
  values: RegisterPurchaseOperationWithOccurrencesInputV2,
): Promise<RegisterPurchaseOperationResultV2> {
  const { data, error } = await supabase.rpc(
    'create_supply_purchase_operation_v2' as never,
    operationPayload(values) as never,
  );
  if (error) throw new Error(error.message);
  const result = data as unknown as { order_id: string; payment_ids: string[] };
  return { orderId: result.order_id, paymentIds: result.payment_ids || [] };
}

export async function createSupplyPurchaseBatchOperationWithOccurrencesV2(
  operations: RegisterPurchaseOperationWithOccurrencesInputV2[],
): Promise<PurchaseBatchOperationResultV2[]> {
  const payload = operations.map((values) => {
    const operation = operationPayload(values);
    return {
      purchase_id: operation.p_purchase_id,
      purchased_on: operation.p_purchased_on,
      supplier_order_ref: operation.p_supplier_order_ref,
      expected_delivery_date: operation.p_expected_delivery_date,
      notes: operation.p_notes,
      lines: operation.p_lines,
      payments: operation.p_payments,
    };
  });
  const { data, error } = await supabase.rpc(
    'create_supply_purchase_batch_operation_v2' as never,
    { p_operations: payload } as never,
  );
  if (error) throw new Error(error.message);
  const result = data as unknown as {
    operations?: Array<{ purchase_id: string; order_id: string; payment_ids?: string[] }>;
  };
  return (result.operations || []).map((entry) => ({
    purchaseId: entry.purchase_id,
    orderId: entry.order_id,
    paymentIds: entry.payment_ids || [],
  }));
}
