import { moneyToCents } from './supply-calculations';
import type { WorkService } from './works-types';

export function serviceTotals(service: WorkService) {
  const contractedCents = moneyToCents(service.contractedAmount);
  const paidCents = service.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);

  const fiscalDocumentedCents = service.documents
    .filter(
      (document) =>
        document.documentType !== 'quote' &&
        document.documentType !== 'payment_proof',
    )
    .reduce(
      (sum, document) =>
        sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
      0n,
    );

  const paymentProofCents = service.documents
    .filter((document) => document.documentType === 'payment_proof')
    .reduce(
      (sum, document) =>
        sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
      0n,
    );

  const coveredDocumentationCents =
    fiscalDocumentedCents > paymentProofCents ? fiscalDocumentedCents : paymentProofCents;
  const documentedCents =
    coveredDocumentationCents > contractedCents ? contractedCents : coveredDocumentationCents;

  return {
    budgetCents: moneyToCents(service.budgetAmount),
    contractedCents,
    paidCents,
    payableCents: contractedCents > paidCents ? contractedCents - paidCents : 0n,
    fiscalDocumentedCents,
    paymentProofCents,
    documentedCents,
    missingDocumentsCents:
      contractedCents > documentedCents ? contractedCents - documentedCents : 0n,
  };
}
