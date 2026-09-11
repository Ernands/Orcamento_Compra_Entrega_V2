import type { PurchaseAttachmentV2, PurchaseV2 } from './purchase-v2-types';

export type FinanceReimbursementStatus =
  'draft' | 'requested' | 'approved' | 'partial' | 'rejected' | 'received' | 'cancelled';

export interface FinanceReimbursementItem {
  id: string;
  reimbursementId: string;
  storeId: string;
  purchaseId: string;
  purchaseOrderId: string;
  purchaseCode: string;
  supplierName: string;
  eligibleAmount: string;
  requestedAmount: string;
  approvedAmount: string;
  receivedAmount: string;
  notes: string | null;
  createdAt: string;
}

export interface FinanceReimbursement {
  id: string;
  code: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  storeCity: string;
  storeState: string;
  status: FinanceReimbursementStatus;
  protocol: string | null;
  notes: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: FinanceReimbursementItem[];
}

export interface SaveFinanceReimbursementItemInput {
  purchaseId: string;
  purchaseOrderId: string;
  eligibleAmount: string;
  requestedAmount: string;
  approvedAmount: string;
  receivedAmount: string;
  notes: string;
}

export interface SaveFinanceReimbursementInput {
  id: string | null;
  storeId: string;
  status: FinanceReimbursementStatus;
  protocol: string;
  notes: string;
  items: SaveFinanceReimbursementItemInput[];
}

export type FinancePaymentAllocationStatus =
  | 'assigned'
  | 'pending_distribution'
  | 'unlinked';

export interface FinancePaymentEvent {
  id: string;
  paymentId: string;
  purchaseId: string;
  purchaseOrderId: string | null;
  purchaseCode: string;
  quoteCode: string;
  supplierName: string;
  itemSummary: string;
  allocationStatus: FinancePaymentAllocationStatus;
  storeIds: string[];
  states: string[];
  paymentMethod: string;
  sourceLabel: string | null;
  status: 'paid' | 'planned';
  date: string;
  month: string;
  amountCents: bigint;
  installmentLabel: string;
  attachments: PurchaseAttachmentV2[];
}

export interface FinanceStorePurchaseRow {
  id: string;
  storeId: string;
  purchaseId: string;
  purchaseOrderId: string;
  purchaseCode: string;
  quoteCode: string;
  supplierName: string;
  purchasedOn: string;
  supplierOrderRef: string | null;
  itemSummary: string;
  quantityLabel: string;
  realizedCents: bigint;
  paidCents: bigint;
  plannedCents: bigint;
  requestedCents: bigint;
  approvedCents: bigint;
  receivedCents: bigint;
  eligibleCents: bigint;
  availableCents: bigint;
  attachments: PurchaseAttachmentV2[];
  purchase: PurchaseV2;
}

export interface FinanceStoreRow {
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  realizedCents: bigint;
  paidCents: bigint;
  plannedCents: bigint;
  requestedCents: bigint;
  approvedCents: bigint;
  receivedCents: bigint;
  eligibleCents: bigint;
  availableCents: bigint;
  purchases: FinanceStorePurchaseRow[];
}
