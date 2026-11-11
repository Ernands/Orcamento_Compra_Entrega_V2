import { financePaymentTotals, scopeFinancePaymentsByStores, type UnifiedFinancePaymentRow } from './finance-payments';
import type { PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';
import { serviceTotals } from './works-calculations';
import { formatBRL } from './supply-calculations';

export type ReimbursementFiscalState = 'present' | 'missing' | 'review';
export type ReimbursementFiscalType = 'invoice' | 'receipt';

export interface ReimbursementFiscalDocument {
  id: string;
  source: 'purchase' | 'work';
  type: ReimbursementFiscalType;
  name: string;
  number: string | null;
  storagePath: string;
  // Unscoped documents on multi-store purchases need manual verification.
  needsStoreReview: boolean;
}

/** Comprovante de pagamento de CMP ou OBR, separado de nota ou recibo fiscal. */
export interface ReimbursementPaymentProof {
  id: string;
  source: 'purchase' | 'work';
  type: 'payment_proof';
  name: string;
  storagePath: string;
  paymentId: string | null;
  needsStoreReview: boolean;
  needsPaymentReview: boolean;
}

export interface ReimbursementLine {
  row: UnifiedFinancePaymentRow;
  documents: ReimbursementFiscalDocument[];
  paymentProofs: ReimbursementPaymentProof[];
  fiscalState: ReimbursementFiscalState;
  /** Independent from the presence of a fiscal receipt: uses Obras e Serviços compliance. */
  workDocumentationIssues: string[];
}

function uniqueDocuments<T extends { source: string; id: string }>(documents: T[]): T[] {
  return [...new Map(documents.map((doc) => [`${doc.source}:${doc.id}`, doc])).values()];
}

/** Link only work payment proofs for the selected store and payment occurrence.
 * A proof with no paymentId belongs to the service as a whole, not an invented parcel.
 */
export function workPaymentProofsForPayment(
  row: UnifiedFinancePaymentRow,
  works: WorkService[],
  storeId: string,
): ReimbursementPaymentProof[] {
  if (!row.workServiceId) return [];
  const work = works.find((item) => item.id === row.workServiceId);
  if (!work || work.storeId !== storeId) return [];
  return uniqueDocuments(work.documents
    .filter((doc) =>
      doc.documentType === 'payment_proof' &&
      Boolean(doc.storagePath?.trim()) &&
      (!doc.paymentId || row.paymentIds.includes(doc.paymentId)))
    .map((doc) => ({
      id: doc.id,
      source: 'work' as const,
      type: 'payment_proof' as const,
      name: doc.originalName || doc.documentNumber || 'Comprovante de pagamento',
      storagePath: doc.storagePath!,
      paymentId: doc.paymentId,
      needsStoreReview: false,
      needsPaymentReview: false,
    })));
}

/**
 * Collect CMP payment proofs from original purchase attachments; preserve explicit
 * payment/order/store scope. Unlinked proofs are purchase-level evidence, never
 * evidence of a specific instalment; flag them for manual payment allocation.
 * In a multi-store CMP, unscoped attachments also require store review.
 */
export function purchasePaymentProofsForPayment(
  row: UnifiedFinancePaymentRow,
  purchases: PurchaseV2[],
  storeId: string,
): ReimbursementPaymentProof[] {
  if (row.workServiceId || !row.purchaseIds.length) return [];
  return uniqueDocuments(row.purchaseIds.flatMap((purchaseId) => {
    const purchase = purchases.find((item) => item.id === purchaseId);
    if (!purchase || !purchase.stores.some((store) => store.storeId === storeId)) return [];
    return purchase.attachments
      .filter((doc) => {
        if (doc.documentType !== 'payment_proof' || !doc.storagePath?.trim()) return false;
        if (doc.stores.length && !doc.stores.some((store) => store.storeId === storeId)) return false;
        if (doc.paymentId && !row.paymentIds.includes(doc.paymentId)) return false;
        if (doc.purchaseOrderId && row.purchaseOrderIds.length &&
            !row.purchaseOrderIds.includes(doc.purchaseOrderId)) return false;
        // A comprovante without a specific payment must not be interpreted
        // as evidence of a planned or unscheduled disbursement.
        if (!doc.paymentId && row.status !== 'paid') return false;
        return true;
      })
      .map((doc) => ({
        id: doc.id,
        source: 'purchase' as const,
        type: 'payment_proof' as const,
        name: doc.originalName || 'Comprovante de pagamento',
        storagePath: doc.storagePath,
        paymentId: doc.paymentId || null,
        needsStoreReview: doc.stores.length === 0 && purchase.stores.length > 1,
        needsPaymentReview: !doc.paymentId,
      }));
  }));
}

/** Fiscal evidence linked to an expense. Never use quotes or payment proofs as fiscal documents. */
export function fiscalDocumentsForPayment(
  row: UnifiedFinancePaymentRow,
  purchases: PurchaseV2[],
  works: WorkService[],
  storeId?: string,
): ReimbursementFiscalDocument[] {
  if (row.workServiceId) {
    const work = works.find((item) => item.id === row.workServiceId);
    if (!work || (storeId && work.storeId !== storeId)) return [];
    return uniqueDocuments(work.documents
      .filter((doc) => (doc.documentType === 'invoice' || doc.documentType === 'receipt') && Boolean(doc.storagePath?.trim()))
      .map((doc) => ({
        id: doc.id, source: 'work' as const,
        type: doc.documentType as ReimbursementFiscalType,
        name: doc.originalName || doc.documentNumber || 'Documento',
        number: doc.documentNumber,
        storagePath: doc.storagePath!,
        needsStoreReview: false,
      })));
  }

  return uniqueDocuments(row.purchaseIds.flatMap((purchaseId) => {
    const purchase = purchases.find((item) => item.id === purchaseId);
    if (!purchase) return [];
    return purchase.attachments
      .filter((doc) => {
        if (doc.documentType !== 'invoice' && doc.documentType !== 'receipt') return false;
        if (!doc.storagePath?.trim()) return false;
        if (doc.purchaseOrderId && row.purchaseOrderIds.length && !row.purchaseOrderIds.includes(doc.purchaseOrderId)) return false;
        if (storeId && doc.stores.length > 0 && !doc.stores.some((entry) => entry.storeId === storeId)) return false;
        return true;
      })
      .map((doc) => ({
        id: doc.id,
        source: 'purchase' as const,
        type: doc.documentType as ReimbursementFiscalType,
        name: doc.originalName || doc.documentNumber || 'Documento',
        number: doc.documentNumber,
        storagePath: doc.storagePath,
        needsStoreReview: Boolean(storeId && doc.stores.length === 0 && purchase.stores.length > 1),
      }));
  }));
}

export function fiscalStateForPayment(
  row: UnifiedFinancePaymentRow,
  purchases: PurchaseV2[],
  works: WorkService[],
  storeId?: string,
): ReimbursementFiscalState {
  if (!storeId && row.storeIds.length > 1) {
    const states = row.storeIds.map((id) => fiscalStateForPayment(row, purchases, works, id));
    if (states.every((state) => state === 'present')) return 'present';
    if (states.every((state) => state === 'missing')) return 'missing';
    return 'review';
  }
  const docs = fiscalDocumentsForPayment(row, purchases, works, storeId);
  if (!docs.length) return 'missing';
  return docs.some((doc) => !doc.needsStoreReview) ? 'present' : 'review';
}

/** Stores eligible for reimbursement have a positive amount attributed to them in Payments. */
export function reimbursementEligibleStoreIds(allRows: UnifiedFinancePaymentRow[]): Set<string> {
  const eligibleIds = new Set<string>();
  allRows.forEach((row) => row.storeAllocations.forEach((allocation) => {
    if (allocation.amountCents > 0n) eligibleIds.add(allocation.storeId);
  }));
  return eligibleIds;
}

/**
 * Document compliance for a work as a whole. The same serviceTotals rule is
 * used by Obras e Serviços; having a receipt does not mean a work is paid or
 * has enough payment proofs. Never infer payments from an attached receipt.
 */
export function reimbursementWorkDocumentationIssues(work: WorkService): string[] {
  if (typeof work.contractedAmount !== 'string' ||
      !Array.isArray(work.payments) || !Array.isArray(work.documents)) {
    return ['Não foi possível conferir integralmente os dados financeiros da obra.'];
  }
  const totals = serviceTotals(work);
  if (totals.documentationStatus === 'complete') return [];
  const issues: string[] = [];
  if (!totals.hasFiscalDocument) issues.push('Nota fiscal ou recibo não anexado.');
  if (!totals.hasPaymentProof) {
    issues.push('Comprovante de pagamento não anexado.');
  } else if (totals.paymentProofCents < totals.paidCents) {
    issues.push(`Comprovantes insuficientes: ${formatBRL(totals.paymentProofCents)} de ${formatBRL(totals.paidCents)} pagos.`);
  }
  if (totals.contractedCents > 0n && totals.paidCents === 0n) {
    issues.push(`Pagamento não registrado; saldo a pagar de ${formatBRL(totals.payableCents)}.`);
  } else if (totals.payableCents > 0n) {
    issues.push(`Pagamento parcial; saldo a pagar de ${formatBRL(totals.payableCents)}.`);
  }
  const scheduled = work.payments.some((payment) =>
    (payment.status === 'planned' || payment.status === 'overdue') &&
    Number(payment.amount) > 0);
  if (scheduled) issues.push('Há parcela programada ou vencida ainda não quitada.');
  return issues.length ? issues : ['Documentação da obra não atende à conferência de Obras e Serviços.'];
}

export function buildStoreReimbursement(
  allRows: UnifiedFinancePaymentRow[],
  purchases: PurchaseV2[],
  works: WorkService[],
  storeId: string,
) {
  // Important: all three payment statuses, independent of active page filters/tabs.
  const scoped = scopeFinancePaymentsByStores(allRows, [storeId])
    .filter((row) => row.amountCents > 0n);
  const workById = new Map(works.filter((work) => work.storeId === storeId)
    .map((work) => [work.id, work]));
  const workIssuesById = new Map<string, string[]>();
  const lines: ReimbursementLine[] = scoped.map((row) => {
    const documents = fiscalDocumentsForPayment(row, purchases, works, storeId);
    const paymentProofs = row.workServiceId
      ? workPaymentProofsForPayment(row, works, storeId)
      : purchasePaymentProofsForPayment(row, purchases, storeId);
    const fiscalState: ReimbursementFiscalState = !documents.length
      ? 'missing'
      : documents.some((doc) => !doc.needsStoreReview) ? 'present' : 'review';
    let workDocumentationIssues: string[] = [];
    if (row.workServiceId) {
      const work = workById.get(row.workServiceId);
      if (!work) {
        workDocumentationIssues = ['Obra não encontrada nos dados carregados para esta loja.'];
      } else {
        workDocumentationIssues = workIssuesById.get(work.id) ||
          reimbursementWorkDocumentationIssues(work);
      }
      workIssuesById.set(row.workServiceId, workDocumentationIssues);
    }
    return { row, documents, paymentProofs, fiscalState, workDocumentationIssues };
  });
  const totals = financePaymentTotals(scoped);
  const unique = uniqueDocuments(lines.flatMap((line) => line.documents));
  const paymentProofs = uniqueDocuments(lines.flatMap((line) => line.paymentProofs));
  // One pending work per OBR, irrespective of how many payment instalments it has.
  const pendingWorks = [...workIssuesById.entries()]
    .filter(([, issues]) => issues.length > 0)
    .map(([workId, issues]) => ({
      workId,
      reference: workById.get(workId)?.code ||
        lines.find((line) => line.row.workServiceId === workId)?.row.referenceCodes.join(' + ') ||
        'OBR sem referência',
      issues,
    }))
    .sort((a, b) => a.reference.localeCompare(b.reference, 'pt-BR'));
  return {
    lines,
    documents: unique,
    paymentProofs,
    totals,
    pendingLines: lines.filter((line) =>
      line.fiscalState !== 'present' || line.workDocumentationIssues.length > 0),
    pendingWorks,
    sumMatches:
      totals.paidCents + totals.plannedCents + totals.unscheduledCents === totals.commitmentCents,
  };
}
