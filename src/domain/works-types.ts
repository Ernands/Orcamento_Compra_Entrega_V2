export type WorkServiceStatus =
  | 'budget'
  | 'awaiting_approval'
  | 'approved'
  | 'contracted'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type WorkPaymentStatus = 'planned' | 'paid' | 'overdue' | 'cancelled';

export type WorkDocumentType = 'invoice' | 'receipt' | 'rpa' | 'other';

export type WorkDocumentStatus = 'pending' | 'verified';

export interface WorkServicePayment {
  id: string;
  serviceId: string;
  storeId: string;
  label: string;
  paymentMethod: string;
  sourceLabel: string | null;
  dueDate: string | null;
  amount: string;
  status: WorkPaymentStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkServiceDocument {
  id: string;
  serviceId: string;
  storeId: string;
  paymentId: string | null;
  documentType: WorkDocumentType;
  documentNumber: string | null;
  documentDate: string | null;
  documentAmount: string | null;
  originalName: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: WorkDocumentStatus;
  notes: string | null;
  createdAt: string;
}

export interface WorkService {
  id: string;
  code: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  storeCity: string;
  storeState: string;
  category: string;
  description: string;
  providerName: string | null;
  providerTaxId: string | null;
  providerPhone: string | null;
  budgetAmount: string;
  contractedAmount: string;
  status: WorkServiceStatus;
  progressPercent: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payments: WorkServicePayment[];
  documents: WorkServiceDocument[];
}

export interface WorkServiceValues {
  id?: string | null;
  storeId: string;
  category: string;
  description: string;
  providerName: string;
  providerTaxId: string;
  providerPhone: string;
  budgetAmount: string;
  contractedAmount: string;
  status: WorkServiceStatus;
  progressPercent: number;
  plannedStartDate: string;
  plannedEndDate: string;
  notes: string;
}

export interface WorkPaymentValues {
  id?: string | null;
  serviceId: string;
  storeId: string;
  label: string;
  paymentMethod: string;
  sourceLabel: string;
  dueDate: string;
  amount: string;
  status: WorkPaymentStatus;
  paidAt: string;
  notes: string;
}

export interface WorkDocumentValues {
  serviceId: string;
  storeId: string;
  paymentId: string;
  documentType: WorkDocumentType;
  documentNumber: string;
  documentDate: string;
  documentAmount: string;
  status: WorkDocumentStatus;
  notes: string;
  file: File | null;
}

export interface FinanceStoreBudget {
  storeId: string;
  budgetAmount: string;
  notes: string | null;
  updatedAt: string;
}
