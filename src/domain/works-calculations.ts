import { moneyToCents } from './supply-calculations';
import type { WorkDocumentationStatus, WorkService } from './works-types';

/** Attached invoices OR receipts, plus proof of the fully paid contract, count as documentation. */
export function serviceTotals(service: WorkService) {
  const contractedCents = moneyToCents(service.contractedAmount);
  const paidCents = service.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const payableCents = contractedCents > paidCents ? contractedCents - paidCents : 0n;
  const hasScheduledPayment = service.payments.some(
    (payment) =>
      (payment.status === 'planned' || payment.status === 'overdue') &&
      moneyToCents(payment.amount) > 0n,
  );

  // Quotes do not count as invoices or receipts; document metadata without a file is not an attachment.
  const attachments = service.documents.filter((doc) => Boolean(doc.storagePath?.trim()));
  const fiscalDocuments = attachments.filter(
    (doc) => doc.documentType === 'invoice' || doc.documentType === 'receipt',
  );
  const proofs = attachments.filter((doc) => doc.documentType === 'payment_proof');
  const hasInvoice = fiscalDocuments.some((doc) => doc.documentType === 'invoice');
  const hasReceipt = fiscalDocuments.some((doc) => doc.documentType === 'receipt');
  const hasFiscalDocument = hasInvoice || hasReceipt;
  const hasPaymentProof = proofs.length > 0;
  const fiscalDocumentedCents = fiscalDocuments.reduce(
    (sum, doc) => sum + (doc.documentAmount ? moneyToCents(doc.documentAmount) : 0n), 0n,
  );
  const paymentProofCents = proofs.reduce(
    (sum, doc) => sum + (doc.documentAmount ? moneyToCents(doc.documentAmount) : 0n), 0n,
  );

  // Invoice/receipt amount may be omitted (the file suffices); proof values must cover paid amounts.
  const supportedPaidCents = hasFiscalDocument && hasPaymentProof
    ? (paymentProofCents < paidCents ? paymentProofCents : paidCents)
    : 0n;
  const documentedCents = supportedPaidCents < contractedCents
    ? supportedPaidCents : contractedCents;
  const documentationStatus: WorkDocumentationStatus =
    !hasFiscalDocument && !hasPaymentProof ? 'none'
      : hasFiscalDocument && hasPaymentProof && contractedCents > 0n &&
        paidCents >= contractedCents && paymentProofCents >= paidCents &&
        !hasScheduledPayment ? 'complete' : 'incomplete';

  return {
    budgetCents: moneyToCents(service.budgetAmount),
    contractedCents,
    paidCents,
    payableCents,
    fiscalDocumentedCents,
    paymentProofCents,
    documentedCents,
    missingDocumentsCents:
      contractedCents > documentedCents ? contractedCents - documentedCents : 0n,
    documentationStatus,
    hasInvoice,
    hasReceipt,
    hasFiscalDocument,
    hasPaymentProof,
  };
}
