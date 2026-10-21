import { financePaymentTotals, scopeFinancePaymentsByStores, type UnifiedFinancePaymentRow } from './finance-payments';
import type { PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';

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

export interface ReimbursementLine {
  row: UnifiedFinancePaymentRow;
  documents: ReimbursementFiscalDocument[];
  fiscalState: ReimbursementFiscalState;
}

function uniqueDocuments(documents: ReimbursementFiscalDocument[]) {
  return [...new Map(documents.map((doc) => [`${doc.source}:${doc.id}`, doc])).values()];
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

export function buildStoreReimbursement(
  allRows: UnifiedFinancePaymentRow[],
  purchases: PurchaseV2[],
  works: WorkService[],
  storeId: string,
) {
  // Important: all three payment statuses, independent of active page filters/tabs.
  const scoped = scopeFinancePaymentsByStores(allRows, [storeId])
    .filter((row) => row.amountCents > 0n);
  const lines: ReimbursementLine[] = scoped.map((row) => {
    const documents = fiscalDocumentsForPayment(row, purchases, works, storeId);
    const fiscalState: ReimbursementFiscalState = !documents.length
      ? 'missing'
      : documents.some((doc) => !doc.needsStoreReview) ? 'present' : 'review';
    return { row, documents, fiscalState };
  });
  const totals = financePaymentTotals(scoped);
  const unique = uniqueDocuments(lines.flatMap((line) => line.documents));
  return {
    lines,
    documents: unique,
    totals,
    pendingLines: lines.filter((line) => line.fiscalState !== 'present'),
    sumMatches:
      totals.paidCents + totals.plannedCents + totals.unscheduledCents === totals.commitmentCents,
  };
}
