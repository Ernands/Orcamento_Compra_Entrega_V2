import type {
  PaymentMethod,
  RegisterPurchaseOperationInputV2,
  RegisterPurchasePaymentInputV2,
} from './purchase-v2-types';

export type PaymentOccurrenceSource = 'manual' | 'proof_backfill' | 'payment_record';

export interface PurchasePaymentOccurrenceV2 {
  id: string;
  paymentId: string;
  attachmentId: string | null;
  occurredOn: string;
  amount: string;
  paymentMethod: PaymentMethod;
  referenceLabel: string | null;
  source: PaymentOccurrenceSource;
  notes: string | null;
  position: number;
}

export interface PurchasePaymentOccurrenceInputV2 {
  occurredOn: string;
  amount: string;
  paymentMethod: PaymentMethod;
  referenceLabel: string;
  attachmentId?: string | null;
  source?: PaymentOccurrenceSource;
  notes?: string;
}

export interface RegisterPurchasePaymentWithOccurrencesInputV2
  extends RegisterPurchasePaymentInputV2 {
  occurrences?: PurchasePaymentOccurrenceInputV2[];
}

export interface RegisterPurchaseOperationWithOccurrencesInputV2
  extends Omit<RegisterPurchaseOperationInputV2, 'payments'> {
  payments: RegisterPurchasePaymentWithOccurrencesInputV2[];
}
