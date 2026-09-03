import { supabase } from '../supabase/client';
import type {
  AllocationSource,
  DistributionStatus,
  PaymentMethod,
  PurchaseAttachmentStoreV2,
  PurchaseAttachmentV2,
  PurchaseDestinationStoreV2,
  PurchaseDestinationV2,
  PurchaseDocumentType,
  PurchaseItemV2,
  PurchaseOrderLineStoreV2,
  PurchaseOrderLineV2,
  PurchaseOrderSource,
  PurchaseOrderStatus,
  PurchaseOrderV2,
  PurchasePaymentStatus,
  PurchasePaymentV2,
  PurchaseStatus,
  PurchaseStoreV2,
  PurchaseV2,
  QuoteAttachmentReadOnlyV2,
  RegisterPurchaseOrderInputV2,
  SavePurchasePaymentInputV2,
  ShippingType,
  StoreAllocationInputV2,
  SupplierChannelType,
} from '../../domain/purchase-v2-types';

const PURCHASE_BUCKET = 'purchase-attachments';
const QUOTE_BUCKET = 'quote-attachments';
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

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

type Numeric = number | string;

function stringValue(value: Numeric | null): string {
  return value === null ? '0' : String(value);
}
function nullableStringValue(value: Numeric | null): string | null {
  return value === null ? null : String(value);
}
function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120) || 'arquivo';
}
function attachmentMime(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('pt-BR') || '';
  return MIME_BY_EXTENSION[extension] || null;
}

export function validatePurchaseAttachmentV2(file: File): string | null {
  if (!attachmentMime(file)) return `Formato nao permitido: ${file.name}`;
  if (file.size <= 0) return `Arquivo vazio: ${file.name}`;
  if (file.size > MAX_SIZE) return `Arquivo acima de 100 MB: ${file.name}`;
  return null;
}

type PurchaseRow = {
  id: string; codigo_negocio: string; quote_id: string; quote_code_snapshot: string; supplier_id: string;
  supplier_name_snapshot: string; quote_date_snapshot: string; approved_total: Numeric; has_pending_shipping: boolean;
  payment_method_snapshot: PaymentMethod | null; entry_amount_snapshot: Numeric | null;
  installment_count_snapshot: number | null; payment_notes_snapshot: string | null;
  status: PurchaseStatus; notes: string | null; approved_at: string; returned_at: string | null;
  supplier_channel_id_snapshot: string | null; channel_type_snapshot: SupplierChannelType | null;
  origin_city_snapshot: string | null; origin_state_snapshot: string | null; contact_snapshot: string | null;
  quote_context_snapshot_source: string | null;
};
type PurchaseStoreRow = {
  id: string; purchase_id: string; store_id: string; store_code_snapshot: string; store_name_snapshot: string;
  store_city_snapshot: string; store_state_snapshot: string; store_address_snapshot: string | null;
  store_address_snapshot_source: string | null;
};
type PurchaseItemRow = {
  id: string; purchase_id: string; source_quote_item_id: string | null; supply_item_id: string;
  item_code_snapshot: string; item_name_snapshot: string; item_description_snapshot: string | null;
  item_category_snapshot: string | null; item_area_snapshot: string | null; brand_reference_snapshot: string | null;
  technical_specification_snapshot: string | null; offered_brand_model_snapshot: string | null;
  product_url_snapshot: string | null; store_id: string | null; store_code_snapshot: string | null;
  quantity_approved: Numeric; purchased_quantity: Numeric; unit: string; quoted_unit_price: Numeric;
  quoted_discount_amount: Numeric; quoted_shipping_type: ShippingType; quoted_shipping_amount: Numeric | null;
  quoted_other_costs: Numeric; quoted_delivery_days: number | null; approved_line_total: Numeric; actual_total: Numeric;
  item_context_snapshot_source: string | null; quote_item_notes_snapshot: string | null;
};
type DestinationRow = {
  id: string; purchase_item_id: string; source_quote_destination_id: string | null; destination_type: 'profile' | 'store';
  profile_id: string | null; store_id: string | null; label_snapshot: string; state_snapshot: string; destination_count: number;
  quantity: Numeric; unit: string; quoted_shipping_type: ShippingType; quoted_shipping_amount: Numeric | null;
  quoted_delivery_days: number | null; notes_snapshot: string | null; position: number; distribution_status: DistributionStatus;
  snapshot_source: string;
};
type DestinationStoreRow = {
  id: string; purchase_destination_id: string; store_id: string; store_code_snapshot: string; store_name_snapshot: string;
  store_city_snapshot: string; store_state_snapshot: string; allocated_quantity: Numeric | null; allocation_source: AllocationSource;
};
type OrderRow = {
  id: string; purchase_id: string; purchased_on: string; supplier_order_ref: string | null; expected_delivery_date: string | null;
  status: PurchaseOrderStatus; source: PurchaseOrderSource; notes: string | null; created_by: string | null; created_at: string;
  cancelled_by: string | null; cancelled_at: string | null; cancellation_reason: string | null;
  created_by_name_snapshot: string | null; cancelled_by_name_snapshot: string | null;
};
type OrderLineRow = {
  id: string; order_id: string; purchase_item_id: string | null; purchase_destination_id: string | null;
  item_code_snapshot: string; item_name_snapshot: string; destination_label_snapshot: string | null;
  destination_state_snapshot: string | null; quantity: Numeric; unit: string; unit_price: Numeric; discount_amount: Numeric;
  shipping_type: ShippingType; actual_shipping_type: ShippingType; shipping_amount: Numeric | null; other_costs: Numeric;
  line_total: Numeric | null; expected_delivery_date: string | null; notes: string | null; store_distribution_status: DistributionStatus;
};
type OrderLineStoreRow = {
  id: string; order_line_id: string; purchase_destination_store_id: string | null; store_id: string;
  store_code_snapshot: string; store_name_snapshot: string; store_city_snapshot: string; store_state_snapshot: string;
  quantity: Numeric; allocation_source: 'direct' | 'manual';
};
type PaymentRow = {
  id: string; purchase_id: string; purchase_order_id: string | null; payment_method: PaymentMethod; source_label: string | null; amount: Numeric;
  entry_amount: Numeric | null; installment_count: number | null; first_due_date: string | null;
  status: PurchasePaymentStatus; paid_at: string | null; notes: string | null; created_at: string;
};
type AttachmentRow = {
  id: string; purchase_id: string; purchase_order_id: string | null; original_name: string; storage_path: string;
  mime_type: string; size_bytes: number; description: string | null; document_type: PurchaseDocumentType;
  document_number: string | null; document_date: string | null; document_amount: Numeric | null; created_at: string; deleted_at: string | null;
};
type AttachmentStoreRow = {
  id: string; attachment_id: string; store_id: string; store_code_snapshot: string; store_name_snapshot: string;
  store_city_snapshot: string; store_state_snapshot: string;
};
type QuoteAttachmentRow = {
  id: string; quote_id: string; original_name: string; storage_path: string; mime_type: string; size_bytes: number;
  description: string | null; document_type: string; created_at: string; deleted_at: string | null;
};

function mapStore(row: PurchaseStoreRow): PurchaseStoreV2 {
  return { id: row.id, storeId: row.store_id, code: row.store_code_snapshot, name: row.store_name_snapshot,
    city: row.store_city_snapshot, state: row.store_state_snapshot, address: row.store_address_snapshot,
    addressSnapshotSource: row.store_address_snapshot_source };
}
function mapDestinationStore(row: DestinationStoreRow): PurchaseDestinationStoreV2 {
  return { id: row.id, purchaseDestinationId: row.purchase_destination_id, storeId: row.store_id,
    code: row.store_code_snapshot, name: row.store_name_snapshot, city: row.store_city_snapshot, state: row.store_state_snapshot,
    allocatedQuantity: nullableStringValue(row.allocated_quantity), allocationSource: row.allocation_source };
}
function mapLineStore(row: OrderLineStoreRow): PurchaseOrderLineStoreV2 {
  return { id: row.id, orderLineId: row.order_line_id, purchaseDestinationStoreId: row.purchase_destination_store_id,
    storeId: row.store_id, code: row.store_code_snapshot, name: row.store_name_snapshot, city: row.store_city_snapshot,
    state: row.store_state_snapshot, quantity: stringValue(row.quantity), allocationSource: row.allocation_source };
}
function mapAttachmentStore(row: AttachmentStoreRow): PurchaseAttachmentStoreV2 {
  return { id: row.id, attachmentId: row.attachment_id, storeId: row.store_id, code: row.store_code_snapshot,
    name: row.store_name_snapshot, city: row.store_city_snapshot, state: row.store_state_snapshot };
}

export async function listSupplyPurchasesV2(): Promise<PurchaseV2[]> {
  const [purchaseResult, storeResult, itemResult, destinationResult, destinationStoreResult, orderResult,
    orderLineResult, orderLineStoreResult, paymentResult, attachmentResult, attachmentStoreResult, quoteAttachmentResult] = await Promise.all([
    supabase.from('supply_purchases' as never).select('*').order('approved_at', { ascending: false }),
    supabase.from('supply_purchase_stores' as never).select('*').order('store_code_snapshot'),
    supabase.from('supply_purchase_items' as never).select('*').order('created_at'),
    supabase.from('supply_purchase_destinations' as never).select('*').order('position'),
    supabase.from('supply_purchase_destination_stores' as never).select('*').order('store_code_snapshot'),
    supabase.from('supply_purchase_orders' as never).select('*').order('created_at', { ascending: false }),
    supabase.from('supply_purchase_order_items' as never).select('*').order('created_at'),
    supabase.from('supply_purchase_order_line_stores' as never).select('*').order('store_code_snapshot'),
    supabase.from('supply_purchase_payments' as never).select('*').order('created_at', { ascending: false }),
    supabase.from('supply_purchase_attachments' as never).select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('supply_purchase_attachment_stores' as never).select('*').order('store_code_snapshot'),
    supabase.from('supply_quote_attachments' as never).select('*').is('deleted_at', null).order('created_at', { ascending: false }),
  ]);
  const resultWithError = [purchaseResult, storeResult, itemResult, destinationResult, destinationStoreResult, orderResult,
    orderLineResult, orderLineStoreResult, paymentResult, attachmentResult, attachmentStoreResult, quoteAttachmentResult].find((result) => result.error);
  if (resultWithError?.error) throw resultWithError.error;

  const purchases = purchaseResult.data as unknown as PurchaseRow[];
  const stores = storeResult.data as unknown as PurchaseStoreRow[];
  const items = itemResult.data as unknown as PurchaseItemRow[];
  const destinations = destinationResult.data as unknown as DestinationRow[];
  const destinationStores = destinationStoreResult.data as unknown as DestinationStoreRow[];
  const orders = orderResult.data as unknown as OrderRow[];
  const lines = orderLineResult.data as unknown as OrderLineRow[];
  const lineStores = orderLineStoreResult.data as unknown as OrderLineStoreRow[];
  const payments = paymentResult.data as unknown as PaymentRow[];
  const attachments = attachmentResult.data as unknown as AttachmentRow[];
  const attachmentStores = attachmentStoreResult.data as unknown as AttachmentStoreRow[];
  const quoteAttachments = quoteAttachmentResult.data as unknown as QuoteAttachmentRow[];

  return purchases.map((purchase): PurchaseV2 => ({
    id: purchase.id, code: purchase.codigo_negocio, quoteId: purchase.quote_id, quoteCode: purchase.quote_code_snapshot,
    supplierId: purchase.supplier_id, supplierName: purchase.supplier_name_snapshot, quoteDate: purchase.quote_date_snapshot,
    approvedTotal: stringValue(purchase.approved_total), hasPendingShipping: purchase.has_pending_shipping, status: purchase.status,
    paymentMethodSnapshot: purchase.payment_method_snapshot, entryAmountSnapshot: nullableStringValue(purchase.entry_amount_snapshot),
    installmentCountSnapshot: purchase.installment_count_snapshot, paymentNotesSnapshot: purchase.payment_notes_snapshot,
    notes: purchase.notes, approvedAt: purchase.approved_at, returnedAt: purchase.returned_at,
    supplierChannelId: purchase.supplier_channel_id_snapshot, channelType: purchase.channel_type_snapshot,
    originCity: purchase.origin_city_snapshot, originState: purchase.origin_state_snapshot, contact: purchase.contact_snapshot,
    quoteContextSnapshotSource: purchase.quote_context_snapshot_source,
    stores: stores.filter((row) => row.purchase_id === purchase.id).map(mapStore),
    items: items.filter((item) => item.purchase_id === purchase.id).map((item): PurchaseItemV2 => ({
      id: item.id, purchaseId: item.purchase_id, sourceQuoteItemId: item.source_quote_item_id, supplyItemId: item.supply_item_id,
      itemCode: item.item_code_snapshot, itemName: item.item_name_snapshot, itemDescription: item.item_description_snapshot,
      itemCategory: item.item_category_snapshot, itemArea: item.item_area_snapshot, brandReference: item.brand_reference_snapshot,
      technicalSpecification: item.technical_specification_snapshot, offeredBrandModel: item.offered_brand_model_snapshot,
      productUrl: item.product_url_snapshot, storeId: item.store_id, storeCode: item.store_code_snapshot,
      quantityApproved: stringValue(item.quantity_approved), purchasedQuantity: stringValue(item.purchased_quantity), unit: item.unit,
      quotedUnitPrice: stringValue(item.quoted_unit_price), quotedDiscountAmount: stringValue(item.quoted_discount_amount),
      quotedShippingType: item.quoted_shipping_type, quotedShippingAmount: nullableStringValue(item.quoted_shipping_amount),
      quotedOtherCosts: stringValue(item.quoted_other_costs), quotedDeliveryDays: item.quoted_delivery_days,
      approvedLineTotal: stringValue(item.approved_line_total), actualTotal: stringValue(item.actual_total),
      itemContextSnapshotSource: item.item_context_snapshot_source, quoteItemNotes: item.quote_item_notes_snapshot,
      destinations: destinations.filter((destination) => destination.purchase_item_id === item.id).map((destination): PurchaseDestinationV2 => ({
        id: destination.id, purchaseItemId: destination.purchase_item_id, sourceQuoteDestinationId: destination.source_quote_destination_id,
        destinationType: destination.destination_type, profileId: destination.profile_id, storeId: destination.store_id,
        label: destination.label_snapshot, state: destination.state_snapshot, destinationCount: destination.destination_count,
        quantity: stringValue(destination.quantity), unit: destination.unit, quotedShippingType: destination.quoted_shipping_type,
        quotedShippingAmount: nullableStringValue(destination.quoted_shipping_amount), quotedDeliveryDays: destination.quoted_delivery_days,
        notes: destination.notes_snapshot, position: destination.position, distributionStatus: destination.distribution_status,
        snapshotSource: destination.snapshot_source,
        stores: destinationStores.filter((store) => store.purchase_destination_id === destination.id).map(mapDestinationStore),
      })),
    })),
    orders: orders.filter((order) => order.purchase_id === purchase.id).map((order): PurchaseOrderV2 => ({
      id: order.id, purchaseId: order.purchase_id, purchasedOn: order.purchased_on, supplierOrderRef: order.supplier_order_ref,
      expectedDeliveryDate: order.expected_delivery_date, status: order.status, source: order.source, notes: order.notes,
      createdBy: order.created_by, createdByName: order.created_by_name_snapshot, createdAt: order.created_at,
      cancelledBy: order.cancelled_by, cancelledByName: order.cancelled_by_name_snapshot, cancelledAt: order.cancelled_at,
      cancellationReason: order.cancellation_reason,
      lines: lines.filter((line) => line.order_id === order.id).map((line): PurchaseOrderLineV2 => ({
        id: line.id, orderId: line.order_id, purchaseItemId: line.purchase_item_id, purchaseDestinationId: line.purchase_destination_id,
        itemCode: line.item_code_snapshot, itemName: line.item_name_snapshot, destinationLabel: line.destination_label_snapshot,
        destinationState: line.destination_state_snapshot, quantity: stringValue(line.quantity), unit: line.unit,
        unitPrice: stringValue(line.unit_price), discountAmount: stringValue(line.discount_amount), shippingType: line.shipping_type,
        actualShippingType: line.actual_shipping_type, shippingAmount: nullableStringValue(line.shipping_amount),
        otherCosts: stringValue(line.other_costs), lineTotal: nullableStringValue(line.line_total),
        expectedDeliveryDate: line.expected_delivery_date, notes: line.notes, storeDistributionStatus: line.store_distribution_status,
        stores: lineStores.filter((store) => store.order_line_id === line.id).map(mapLineStore),
      })),
    })),
    payments: payments.filter((payment) => payment.purchase_id === purchase.id).map((payment): PurchasePaymentV2 => ({
      id: payment.id, purchaseId: payment.purchase_id, purchaseOrderId: payment.purchase_order_id,
      paymentMethod: payment.payment_method,
      sourceLabel: payment.source_label, amount: stringValue(payment.amount), entryAmount: nullableStringValue(payment.entry_amount),
      installmentCount: payment.installment_count, firstDueDate: payment.first_due_date, status: payment.status,
      paidAt: payment.paid_at, notes: payment.notes, createdAt: payment.created_at,
    })),
    attachments: attachments.filter((attachment) => attachment.purchase_id === purchase.id).map((attachment): PurchaseAttachmentV2 => ({
      id: attachment.id, purchaseId: attachment.purchase_id, purchaseOrderId: attachment.purchase_order_id,
      originalName: attachment.original_name, storagePath: attachment.storage_path, mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes, description: attachment.description, documentType: attachment.document_type,
      documentNumber: attachment.document_number, documentDate: attachment.document_date,
      documentAmount: nullableStringValue(attachment.document_amount), createdAt: attachment.created_at,
      stores: attachmentStores.filter((store) => store.attachment_id === attachment.id).map(mapAttachmentStore),
    })),
    quoteAttachments: quoteAttachments.filter((attachment) => attachment.quote_id === purchase.quote_id).map((attachment): QuoteAttachmentReadOnlyV2 => ({
      id: attachment.id, quoteId: attachment.quote_id, originalName: attachment.original_name, storagePath: attachment.storage_path,
      mimeType: attachment.mime_type, sizeBytes: attachment.size_bytes, description: attachment.description,
      documentType: attachment.document_type, createdAt: attachment.created_at,
    })),
  }));
}

export function buildPurchaseOrderRpcPayloadV2(values: RegisterPurchaseOrderInputV2) {
  return {
    p_purchase_id: values.purchaseId,
    p_purchased_on: values.purchasedOn,
    p_supplier_order_ref: values.supplierOrderRef.trim() || null,
    p_expected_delivery_date: values.expectedDeliveryDate || null,
    p_notes: values.notes.trim() || null,
    p_lines: values.lines.map((line) => ({
      purchase_item_id: line.purchaseItemId,
      purchase_destination_id: line.purchaseDestinationId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      discount_amount: line.discountAmount || '0',
      // Nao usar `|| '0'` aqui: vazio significa frete ainda nao informado (pending/null).
      shipping_amount: line.shippingAmount,
      other_costs: line.otherCosts || '0',
      expected_delivery_date: line.expectedDeliveryDate || null,
      notes: line.notes.trim() || null,
    })),
  };
}

export async function createSupplyPurchaseOrderV2(values: RegisterPurchaseOrderInputV2): Promise<string> {
  const { data, error } = await supabase.rpc(
    'create_supply_purchase_order_v2' as never,
    buildPurchaseOrderRpcPayloadV2(values) as never,
  );
  if (error) throw new Error(error.message);
  return data;
}

export function buildPurchasePaymentRpcPayloadV2(values: SavePurchasePaymentInputV2) {
  return {
    p_payment_id: values.id,
    p_purchase_id: values.purchaseId,
    p_purchase_order_id: values.purchaseOrderId,
    p_payment_method: values.paymentMethod,
    p_source_label: values.sourceLabel.trim() || null,
    p_amount: values.amount,
    p_entry_amount: values.entryAmount || null,
    p_installment_count: values.installmentCount ? Number(values.installmentCount) : null,
    p_first_due_date: values.firstDueDate || null,
    p_status: values.status,
    p_paid_at: values.paidAt ? new Date(values.paidAt).toISOString() : null,
    p_notes: values.notes.trim() || null,
  };
}

export async function savePurchasePaymentV2(values: SavePurchasePaymentInputV2): Promise<string> {
  const { data, error } = await supabase.rpc(
    'save_supply_purchase_payment' as never,
    buildPurchasePaymentRpcPayloadV2(values) as never,
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelSupplyPurchaseOrderV2(orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_supply_purchase_order' as never, {
    p_order_id: orderId,
    p_reason: reason.trim(),
  } as never);
  if (error) throw new Error(error.message);
}

export async function savePurchaseDestinationDistributionV2(
  destinationId: string,
  allocations: StoreAllocationInputV2[],
): Promise<DistributionStatus> {
  const { data, error } = await supabase.rpc('save_supply_purchase_destination_distribution' as never, {
    p_purchase_destination_id: destinationId,
    p_allocations: allocations.map((allocation) => ({ store_id: allocation.storeId, quantity: allocation.quantity })),
  } as never);
  if (error) throw new Error(error.message);
  return data;
}

export async function savePurchaseOrderLineDistributionV2(
  orderLineId: string,
  allocations: StoreAllocationInputV2[],
): Promise<DistributionStatus> {
  const { data, error } = await supabase.rpc('save_supply_purchase_order_line_distribution' as never, {
    p_order_line_id: orderLineId,
    p_allocations: allocations.map((allocation) => ({ store_id: allocation.storeId, quantity: allocation.quantity })),
  } as never);
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadPurchaseAttachmentV3(values: {
  purchaseId: string;
  purchaseOrderId: string | null;
  file: File;
  description: string;
  documentType: PurchaseDocumentType;
  documentNumber: string;
  documentDate: string;
  documentAmount: string;
  storeIds: string[];
}): Promise<void> {
  const validation = validatePurchaseAttachmentV2(values.file);
  if (validation) throw new Error(validation);
  const mimeType = attachmentMime(values.file);
  if (!mimeType) throw new Error('Formato de arquivo nao permitido.');
  const attachmentId = crypto.randomUUID();
  const path = `compras/${values.purchaseId}/${attachmentId}/${safeFileName(values.file.name)}`;
  const { error: uploadError } = await supabase.storage.from(PURCHASE_BUCKET).upload(path, values.file, {
    contentType: mimeType, upsert: false,
  });
  if (uploadError) throw uploadError;
  const { error } = await supabase.rpc('register_supply_purchase_attachment_v3' as never, {
    p_purchase_id: values.purchaseId,
    p_purchase_order_id: values.purchaseOrderId,
    p_original_name: values.file.name,
    p_storage_path: path,
    p_mime_type: mimeType,
    p_size_bytes: values.file.size,
    p_description: values.description.trim() || null,
    p_document_type: values.documentType,
    p_document_number: values.documentNumber.trim() || null,
    p_document_date: values.documentDate || null,
    p_document_amount: values.documentAmount.trim() || null,
    p_store_ids: values.storeIds,
  } as never);
  if (error) {
    await supabase.storage.from(PURCHASE_BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

export async function createPurchaseAttachmentSignedUrlV2(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PURCHASE_BUCKET).createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}
export async function createQuoteAttachmentSignedUrlReadOnlyV2(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(QUOTE_BUCKET).createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}
export async function deletePurchaseAttachmentV2(attachmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_supply_purchase_attachment' as never, { p_attachment_id: attachmentId } as never);
  if (error) throw new Error(error.message);
  const path = data;
  if (!path) throw new Error('Storage path ausente para o documento.');
  const { error: storageError } = await supabase.storage.from(PURCHASE_BUCKET).remove([path]);
  if (storageError) throw storageError;
}
export async function returnPurchaseToQuoteV2(purchaseId: string): Promise<void> {
  const { error } = await supabase.rpc('return_supply_purchase_to_quote' as never, { p_purchase_id: purchaseId } as never);
  if (error) throw new Error(error.message);
}
