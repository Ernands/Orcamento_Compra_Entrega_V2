import { supabase } from '../supabase/client';

export type PaymentMethod =
  | 'pix'
  | 'boleto'
  | 'bank_transfer'
  | 'credit_card'
  | 'debit_card'
  | 'cash'
  | 'invoiced'
  | 'other';
export type PurchaseStatus =
  | 'approved'
  | 'in_progress'
  | 'partially_purchased'
  | 'purchased'
  | 'returned'
  | 'cancelled';
export type ReimbursementStatus =
  | 'not_applicable'
  | 'documents_pending'
  | 'ready'
  | 'requested'
  | 'reimbursed';
export type PurchaseDocumentType =
  | 'invoice'
  | 'receipt'
  | 'payment_proof'
  | 'boleto'
  | 'purchase_order'
  | 'reimbursement'
  | 'photo'
  | 'other';

export interface PurchaseStore {
  id: string;
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  supplyItemId: string;
  itemCode: string;
  itemName: string;
  storeId: string | null;
  storeCode: string | null;
  quantityApproved: string;
  purchasedQuantity: string;
  unit: string;
  quotedUnitPrice: string;
  approvedLineTotal: string;
  actualUnitPrice: string;
  actualDiscountAmount: string;
  actualShippingAmount: string;
  actualOtherCosts: string;
  notes: string | null;
}

export interface PurchasePayment {
  id: string;
  purchaseId: string;
  paymentMethod: PaymentMethod;
  sourceLabel: string | null;
  amount: string;
  entryAmount: string | null;
  installmentCount: number | null;
  firstDueDate: string | null;
  status: 'planned' | 'paid' | 'cancelled';
  paidAt: string | null;
  notes: string | null;
}

export interface PurchaseAttachment {
  id: string;
  purchaseId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  documentType: PurchaseDocumentType;
  createdAt: string;
}

export interface Purchase {
  id: string;
  code: string;
  quoteId: string;
  quoteCode: string;
  supplierId: string;
  supplierName: string;
  quoteDate: string;
  approvedTotal: string;
  hasPendingShipping: boolean;
  paymentMethodSnapshot: PaymentMethod | null;
  entryAmountSnapshot: string | null;
  installmentCountSnapshot: number | null;
  paymentNotesSnapshot: string | null;
  status: PurchaseStatus;
  reimbursementStatus: ReimbursementStatus;
  notes: string | null;
  approvedAt: string;
  returnedAt: string | null;
  stores: PurchaseStore[];
  items: PurchaseItem[];
  payments: PurchasePayment[];
  attachments: PurchaseAttachment[];
}

type PurchaseRow = {
  id: string;
  codigo_negocio: string;
  quote_id: string;
  quote_code_snapshot: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  quote_date_snapshot: string;
  approved_total: number | string;
  has_pending_shipping: boolean;
  payment_method_snapshot: PaymentMethod | null;
  entry_amount_snapshot: number | string | null;
  installment_count_snapshot: number | null;
  payment_notes_snapshot: string | null;
  status: PurchaseStatus;
  reimbursement_status: ReimbursementStatus;
  notes: string | null;
  approved_at: string;
  returned_at: string | null;
};

type StoreRow = {
  id: string;
  purchase_id: string;
  store_id: string;
  store_code_snapshot: string;
  store_name_snapshot: string;
  store_city_snapshot: string;
  store_state_snapshot: string;
};

type ItemRow = {
  id: string;
  purchase_id: string;
  supply_item_id: string;
  item_code_snapshot: string;
  item_name_snapshot: string;
  store_id: string | null;
  store_code_snapshot: string | null;
  quantity_approved: number | string;
  purchased_quantity: number | string;
  unit: string;
  quoted_unit_price: number | string;
  approved_line_total: number | string;
  actual_unit_price: number | string | null;
  actual_discount_amount: number | string;
  actual_shipping_amount: number | string;
  actual_other_costs: number | string;
  notes: string | null;
};

type PaymentRow = {
  id: string;
  purchase_id: string;
  payment_method: PaymentMethod;
  source_label: string | null;
  amount: number | string;
  entry_amount: number | string | null;
  installment_count: number | null;
  first_due_date: string | null;
  status: 'planned' | 'paid' | 'cancelled';
  paid_at: string | null;
  notes: string | null;
};

type AttachmentRow = {
  id: string;
  purchase_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  document_type: PurchaseDocumentType;
  created_at: string;
};

function stringValue(value: number | string | null): string {
  return value === null ? '0' : String(value);
}

export async function listSupplyPurchases(): Promise<Purchase[]> {
  const [purchaseResult, storeResult, itemResult, paymentResult, attachmentResult] = await Promise.all([
    supabase.from('supply_purchases' as never).select('*').order('approved_at', { ascending: false }),
    supabase.from('supply_purchase_stores' as never).select('*').order('store_code_snapshot'),
    supabase.from('supply_purchase_items' as never).select('*').order('created_at'),
    supabase.from('supply_purchase_payments' as never).select('*').order('created_at'),
    supabase
      .from('supply_purchase_attachments' as never)
      .select('*')
      .order('created_at', { ascending: false }),
  ]);
  const error =
    purchaseResult.error ||
    storeResult.error ||
    itemResult.error ||
    paymentResult.error ||
    attachmentResult.error;
  if (error) throw error;

  const purchaseRows = purchaseResult.data as unknown as PurchaseRow[];
  const storeRows = storeResult.data as unknown as StoreRow[];
  const itemRows = itemResult.data as unknown as ItemRow[];
  const paymentRows = paymentResult.data as unknown as PaymentRow[];
  const attachmentRows = attachmentResult.data as unknown as AttachmentRow[];

  return purchaseRows.map((row) => ({
    id: row.id,
    code: row.codigo_negocio,
    quoteId: row.quote_id,
    quoteCode: row.quote_code_snapshot,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name_snapshot,
    quoteDate: row.quote_date_snapshot,
    approvedTotal: stringValue(row.approved_total),
    hasPendingShipping: row.has_pending_shipping,
    paymentMethodSnapshot: row.payment_method_snapshot,
    entryAmountSnapshot:
      row.entry_amount_snapshot === null ? null : stringValue(row.entry_amount_snapshot),
    installmentCountSnapshot: row.installment_count_snapshot,
    paymentNotesSnapshot: row.payment_notes_snapshot,
    status: row.status,
    reimbursementStatus: row.reimbursement_status,
    notes: row.notes,
    approvedAt: row.approved_at,
    returnedAt: row.returned_at,
    stores: storeRows
      .filter((store) => store.purchase_id === row.id)
      .map((store) => ({
        id: store.id,
        storeId: store.store_id,
        code: store.store_code_snapshot,
        name: store.store_name_snapshot,
        city: store.store_city_snapshot,
        state: store.store_state_snapshot,
      })),
    items: itemRows
      .filter((item) => item.purchase_id === row.id)
      .map((item) => ({
        id: item.id,
        purchaseId: item.purchase_id,
        supplyItemId: item.supply_item_id,
        itemCode: item.item_code_snapshot,
        itemName: item.item_name_snapshot,
        storeId: item.store_id,
        storeCode: item.store_code_snapshot,
        quantityApproved: stringValue(item.quantity_approved),
        purchasedQuantity: stringValue(item.purchased_quantity),
        unit: item.unit,
        quotedUnitPrice: stringValue(item.quoted_unit_price),
        approvedLineTotal: stringValue(item.approved_line_total),
        actualUnitPrice: stringValue(item.actual_unit_price ?? item.quoted_unit_price),
        actualDiscountAmount: stringValue(item.actual_discount_amount),
        actualShippingAmount: stringValue(item.actual_shipping_amount),
        actualOtherCosts: stringValue(item.actual_other_costs),
        notes: item.notes,
      })),
    payments: paymentRows
      .filter((payment) => payment.purchase_id === row.id)
      .map((payment) => ({
        id: payment.id,
        purchaseId: payment.purchase_id,
        paymentMethod: payment.payment_method,
        sourceLabel: payment.source_label,
        amount: stringValue(payment.amount),
        entryAmount: payment.entry_amount === null ? null : stringValue(payment.entry_amount),
        installmentCount: payment.installment_count,
        firstDueDate: payment.first_due_date,
        status: payment.status,
        paidAt: payment.paid_at,
        notes: payment.notes,
      })),
    attachments: attachmentRows
      .filter((attachment) => attachment.purchase_id === row.id)
      .map((attachment) => ({
        id: attachment.id,
        purchaseId: attachment.purchase_id,
        originalName: attachment.original_name,
        storagePath: attachment.storage_path,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        description: attachment.description,
        documentType: attachment.document_type,
        createdAt: attachment.created_at,
      })),
  }));
}

export async function approveSupplyQuoteForPurchase(quoteId: string): Promise<string> {
  const { data, error } = await supabase.rpc('approve_supply_quote_for_purchase' as never, {
    p_quote_id: quoteId,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function savePurchaseItem(values: {
  id: string;
  purchasedQuantity: string;
  actualUnitPrice: string;
  actualDiscountAmount: string;
  actualShippingAmount: string;
  actualOtherCosts: string;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc('save_supply_purchase_item' as never, {
    p_purchase_item_id: values.id,
    p_purchased_quantity: values.purchasedQuantity,
    p_actual_unit_price: values.actualUnitPrice,
    p_actual_discount_amount: values.actualDiscountAmount || '0',
    p_actual_shipping_amount: values.actualShippingAmount || '0',
    p_actual_other_costs: values.actualOtherCosts || '0',
    p_notes: values.notes,
  } as never);
  if (error) throw error;
}

export async function savePurchasePayment(values: {
  id: string | null;
  purchaseId: string;
  paymentMethod: PaymentMethod;
  sourceLabel: string;
  amount: string;
  entryAmount: string;
  installmentCount: string;
  firstDueDate: string;
  status: 'planned' | 'paid' | 'cancelled';
  paidAt: string;
  notes: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_supply_purchase_payment' as never, {
    p_payment_id: values.id,
    p_purchase_id: values.purchaseId,
    p_payment_method: values.paymentMethod,
    p_source_label: values.sourceLabel,
    p_amount: values.amount,
    p_entry_amount: values.entryAmount || null,
    p_installment_count: values.installmentCount ? Number(values.installmentCount) : null,
    p_first_due_date: values.firstDueDate || null,
    p_status: values.status,
    p_paid_at: values.paidAt ? new Date(values.paidAt).toISOString() : null,
    p_notes: values.notes,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function setPurchaseReimbursementStatus(
  purchaseId: string,
  status: ReimbursementStatus,
): Promise<void> {
  const { error } = await supabase.rpc('set_supply_purchase_reimbursement_status' as never, {
    p_purchase_id: purchaseId,
    p_status: status,
  } as never);
  if (error) throw error;
}

export async function returnPurchaseToQuote(purchaseId: string): Promise<void> {
  const { error } = await supabase.rpc('return_supply_purchase_to_quote' as never, {
    p_purchase_id: purchaseId,
  } as never);
  if (error) throw error;
}

const PURCHASE_BUCKET = 'purchase-attachments';
const MAX_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function safeFileName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(-120) || 'arquivo'
  );
}

export function validatePurchaseAttachment(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) return `Formato nao permitido: ${file.name}`;
  if (file.size <= 0) return `Arquivo vazio: ${file.name}`;
  if (file.size > MAX_SIZE) return `Arquivo acima de 100 MB: ${file.name}`;
  return null;
}

export async function uploadPurchaseAttachment(
  purchaseId: string,
  file: File,
  description: string,
  documentType: PurchaseDocumentType,
): Promise<void> {
  const validation = validatePurchaseAttachment(file);
  if (validation) throw new Error(validation);
  const id = crypto.randomUUID();
  const path = `compras/${purchaseId}/${id}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(PURCHASE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc('register_supply_purchase_attachment' as never, {
    p_purchase_id: purchaseId,
    p_original_name: file.name,
    p_storage_path: path,
    p_mime_type: file.type,
    p_size_bytes: file.size,
    p_description: description,
    p_document_type: documentType,
  } as never);
  if (error) {
    await supabase.storage.from(PURCHASE_BUCKET).remove([path]);
    throw error;
  }
}

export async function createPurchaseAttachmentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PURCHASE_BUCKET).createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

export async function deletePurchaseAttachment(attachmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_supply_purchase_attachment' as never, {
    p_attachment_id: attachmentId,
  } as never);
  if (error) throw error;
  const path = data as unknown as string;
  const { error: storageError } = await supabase.storage.from(PURCHASE_BUCKET).remove([path]);
  if (storageError) throw storageError;
}
