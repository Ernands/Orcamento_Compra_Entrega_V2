export type ShippingType = 'free' | 'informed' | 'pending';
export type SupplierChannelType =
  | 'local_city'
  | 'state_capital'
  | 'regional'
  | 'national'
  | 'ecommerce';

export type PurchaseStatus =
  | 'approved'
  | 'in_progress'
  | 'partially_purchased'
  | 'purchased'
  | 'returned'
  | 'cancelled';

export type DistributionStatus = 'pending' | 'confirmed';
export type AllocationSource = 'pending' | 'snapshot' | 'manual' | 'direct' | 'legacy';
export type PurchaseOrderStatus = 'active' | 'cancelled';
export type PurchaseOrderSource = 'manual' | 'legacy_backfill';

export type PaymentMethod =
  | 'pix'
  | 'boleto'
  | 'bank_transfer'
  | 'credit_card'
  | 'debit_card'
  | 'cash'
  | 'invoiced'
  | 'other';

export type PurchasePaymentStatus = 'planned' | 'paid' | 'cancelled';

export type PurchaseDocumentType =
  | 'invoice'
  | 'receipt'
  | 'payment_proof'
  | 'boleto'
  | 'purchase_order'
  | 'reimbursement'
  | 'photo'
  | 'other';

export interface PurchaseStoreV2 {
  id: string;
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  addressSnapshotSource: string | null;
}

export interface PurchaseDestinationStoreV2 {
  id: string;
  purchaseDestinationId: string;
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  allocatedQuantity: string | null;
  allocationSource: AllocationSource;
}

export interface PurchaseDestinationV2 {
  id: string;
  purchaseItemId: string;
  sourceQuoteDestinationId: string | null;
  destinationType: 'profile' | 'store';
  profileId: string | null;
  storeId: string | null;
  label: string;
  state: string;
  destinationCount: number;
  quantity: string;
  unit: string;
  quotedShippingType: ShippingType;
  quotedShippingAmount: string | null;
  quotedDeliveryDays: number | null;
  notes: string | null;
  position: number;
  distributionStatus: DistributionStatus;
  snapshotSource: string;
  stores: PurchaseDestinationStoreV2[];
}

export interface PurchaseItemV2 {
  id: string;
  purchaseId: string;
  sourceQuoteItemId: string | null;
  supplyItemId: string;
  itemCode: string;
  itemName: string;
  itemDescription: string | null;
  itemCategory: string | null;
  itemArea: string | null;
  brandReference: string | null;
  technicalSpecification: string | null;
  offeredBrandModel: string | null;
  productUrl: string | null;
  storeId: string | null;
  storeCode: string | null;
  quantityApproved: string;
  purchasedQuantity: string;
  unit: string;
  quotedUnitPrice: string;
  quotedDiscountAmount: string;
  quotedShippingType: ShippingType;
  quotedShippingAmount: string | null;
  quotedOtherCosts: string;
  quotedDeliveryDays: number | null;
  approvedLineTotal: string;
  actualTotal: string;
  itemContextSnapshotSource: string | null;
  quoteItemNotes: string | null;
  destinations: PurchaseDestinationV2[];
}

export interface PurchaseOrderLineStoreV2 {
  id: string;
  orderLineId: string;
  purchaseDestinationStoreId: string | null;
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  quantity: string;
  allocationSource: 'direct' | 'manual';
}

export interface PurchaseOrderLineV2 {
  id: string;
  orderId: string;
  purchaseItemId: string | null;
  purchaseDestinationId: string | null;
  itemCode: string;
  itemName: string;
  destinationLabel: string | null;
  destinationState: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount: string;
  shippingType: ShippingType;
  actualShippingType: ShippingType;
  shippingAmount: string | null;
  otherCosts: string;
  lineTotal: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  storeDistributionStatus: DistributionStatus;
  stores: PurchaseOrderLineStoreV2[];
}

export interface PurchaseOrderV2 {
  id: string;
  purchaseId: string;
  purchasedOn: string;
  supplierOrderRef: string | null;
  expectedDeliveryDate: string | null;
  status: PurchaseOrderStatus;
  source: PurchaseOrderSource;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  lines: PurchaseOrderLineV2[];
}

export interface PurchasePaymentV2 {
  id: string;
  purchaseId: string;
  purchaseOrderId: string | null;
  paymentMethod: PaymentMethod;
  sourceLabel: string | null;
  amount: string;
  entryAmount: string | null;
  installmentCount: number | null;
  firstDueDate: string | null;
  status: PurchasePaymentStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PurchaseAttachmentStoreV2 {
  id: string;
  attachmentId: string;
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
}

export interface PurchaseAttachmentV2 {
  id: string;
  purchaseId: string;
  purchaseOrderId: string | null;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  documentType: PurchaseDocumentType;
  documentNumber: string | null;
  documentDate: string | null;
  documentAmount: string | null;
  createdAt: string;
  stores: PurchaseAttachmentStoreV2[];
}

export interface QuoteAttachmentReadOnlyV2 {
  id: string;
  quoteId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  documentType: string;
  createdAt: string;
}

export interface PurchaseV2 {
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
  notes: string | null;
  approvedAt: string;
  returnedAt: string | null;
  supplierChannelId: string | null;
  channelType: SupplierChannelType | null;
  originCity: string | null;
  originState: string | null;
  contact: string | null;
  quoteContextSnapshotSource: string | null;
  stores: PurchaseStoreV2[];
  items: PurchaseItemV2[];
  orders: PurchaseOrderV2[];
  payments: PurchasePaymentV2[];
  attachments: PurchaseAttachmentV2[];
  quoteAttachments: QuoteAttachmentReadOnlyV2[];
}

export interface StoreAllocationInputV2 {
  storeId: string;
  quantity: string;
}

export interface RegisterPurchaseOrderLineInputV2 {
  purchaseItemId: string;
  purchaseDestinationId: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  shippingAmount: string;
  otherCosts: string;
  expectedDeliveryDate: string;
  notes: string;
}

export interface RegisterPurchaseOrderInputV2 {
  purchaseId: string;
  purchasedOn: string;
  supplierOrderRef: string;
  expectedDeliveryDate: string;
  notes: string;
  lines: RegisterPurchaseOrderLineInputV2[];
}

export interface SavePurchasePaymentInputV2 {
  id: string | null;
  purchaseId: string;
  purchaseOrderId: string | null;
  paymentMethod: PaymentMethod;
  sourceLabel: string;
  amount: string;
  entryAmount: string;
  installmentCount: string;
  firstDueDate: string;
  status: Exclude<PurchasePaymentStatus, 'cancelled'>;
  paidAt: string;
  notes: string;
}
