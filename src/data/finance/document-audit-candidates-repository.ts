import { supabase } from '../supabase/client';
import { fetchAllPagesForIds } from '../supabase/pagination';
import type { AuditDocumentLink, AuditRecord } from '../../domain/document-audit-types';
import { normalizeFiscalDocumentNumber } from '../../domain/fiscal-document-number';

export interface AuditDocumentCandidate {
  key: string;
  type: 'invoice' | 'receipt';
  number: string | null;
  source: 'purchase' | 'work';
  link: AuditDocumentLink;
}

type FiscalAttachment = {
  id: string;
  purchase_id: string;
  purchase_order_id: string | null;
  document_type: string;
  document_number: string | null;
  storage_path: string | null;
};
type FiscalWorkDocument = {
  id: string;
  service_id: string;
  document_type: string;
  document_number: string | null;
  storage_path: string | null;
};
type FiscalPurchase = {
  id: string;
  codigo_negocio: string;
  supplier_name_snapshot: string;
};
type FiscalWork = {
  id: string;
  codigo_negocio: string;
  provider_name: string | null;
  store_id: string;
};
type PurchaseStore = { purchase_id: string; store_id: string };
type AttachmentStore = { attachment_id: string; store_id: string };

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

/**
 * Searches only selected fiscal numbers/paths. The user's RLS policies remain
 * responsible for deciding which other stores can be read. No file data is
 * downloaded and no privileged database function is involved.
 */
export async function listAuditDocumentCandidates(
  records: readonly AuditRecord[],
): Promise<AuditDocumentCandidate[]> {
  const catalog = new Map(records.flatMap((record) =>
    record.documents.map((doc) => [doc.key, doc] as const)));
  const docs = [...catalog.values()];
  const numbers = unique(docs.map((doc) => normalizeFiscalDocumentNumber(doc.number)));
  const paths = unique(docs.map((doc) => doc.storagePath));
  if (!numbers.length && !paths.length) return [];

  type CandidateRow = {
    source: 'purchase' | 'work';
    id: string;
    purchase_id: string | null;
    service_id: string | null;
    purchase_order_id: string | null;
    document_type: string;
    document_number: string | null;
    storage_path: string | null;
  };
  // The security-invoker RPC filters by the same normalized expression as
  // its DEV index. Returned rows remain subject to the caller's original RLS.
  const fetchCandidates = (field: 'numbers' | 'paths', values: string[]) =>
    fetchAllPagesForIds<CandidateRow>(
      values,
      (chunk, from, to) => supabase
        .rpc('finance_document_audit_fiscal_candidates_v1', {
          p_numbers: field === 'numbers' ? chunk : [],
          p_paths: field === 'paths' ? chunk : [],
        })
        .order('source')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CandidateRow[] | null; error: unknown }>,
    );
  const [numberRows, pathRows] = await Promise.all([
    fetchCandidates('numbers', numbers),
    fetchCandidates('paths', paths),
  ]);
  const matches = new Map<string, CandidateRow>();
  for (const row of [...numberRows, ...pathRows]) {
    if ((row.source === 'purchase' || row.source === 'work') &&
        (row.document_type === 'invoice' || row.document_type === 'receipt')) {
      matches.set(`${row.source}:${row.id}`, row);
    }
  }
  const allMatches = [...matches.values()];
  const purchaseDocuments: FiscalAttachment[] = allMatches
    .filter((row) => row.source === 'purchase' && Boolean(row.purchase_id))
    .map((row) => ({
      id: row.id,
      purchase_id: row.purchase_id!,
      purchase_order_id: row.purchase_order_id,
      document_type: row.document_type,
      document_number: row.document_number,
      storage_path: row.storage_path,
    }));
  const workDocuments: FiscalWorkDocument[] = allMatches
    .filter((row) => row.source === 'work' && Boolean(row.service_id))
    .map((row) => ({
      id: row.id,
      service_id: row.service_id!,
      document_type: row.document_type,
      document_number: row.document_number,
      storage_path: row.storage_path,
    }));

  const purchaseIds = unique(purchaseDocuments.map((doc) => doc.purchase_id));
  const attachmentIds = unique(purchaseDocuments.map((doc) => doc.id));
  const workIds = unique(workDocuments.map((doc) => doc.service_id));
  const readRows = <T>(table: string, select: string, key: string, ids: string[]) =>
    fetchAllPagesForIds<T>(
      ids,
      (chunk, from, to) => supabase.from(table as never)
        .select(select).in(key, chunk).order('id').range(from, to),
    );
  const [purchases, purchaseStores, attachmentStores, works] = await Promise.all([
    readRows<FiscalPurchase>(
      'supply_purchases', 'id,codigo_negocio,supplier_name_snapshot', 'id', purchaseIds,
    ),
    readRows<PurchaseStore>(
      'supply_purchase_stores', 'id,purchase_id,store_id', 'purchase_id', purchaseIds,
    ),
    readRows<AttachmentStore>(
      'supply_purchase_attachment_stores', 'id,attachment_id,store_id', 'attachment_id', attachmentIds,
    ),
    readRows<FiscalWork>(
      'works_services', 'id,codigo_negocio,provider_name,store_id', 'id', workIds,
    ),
  ]);
  const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const workById = new Map(works.map((work) => [work.id, work]));
  const storeIdsByPurchase = new Map<string, string[]>();
  const storeIdsByAttachment = new Map<string, string[]>();
  for (const row of purchaseStores) {
    const found = storeIdsByPurchase.get(row.purchase_id) || [];
    found.push(row.store_id);
    storeIdsByPurchase.set(row.purchase_id, found);
  }
  for (const row of attachmentStores) {
    const found = storeIdsByAttachment.get(row.attachment_id) || [];
    found.push(row.store_id);
    storeIdsByAttachment.set(row.attachment_id, found);
  }

  const candidates: AuditDocumentCandidate[] = [];
  for (const doc of purchaseDocuments) {
    const purchase = purchaseById.get(doc.purchase_id);
    if (!purchase) continue; // Parent not accessible under RLS: never infer.
    const explicit = storeIdsByAttachment.get(doc.id) || [];
    candidates.push({
      key: `purchase:${doc.storage_path?.trim() || `missing:${doc.id}`}`,
      source: 'purchase',
      type: doc.document_type as 'invoice' | 'receipt',
      number: doc.document_number,
      link: {
        recordId: `purchase:${doc.purchase_id}`,
        reference: purchase.codigo_negocio,
        supplier: purchase.supplier_name_snapshot,
        storeIds: unique(explicit.length ? explicit : storeIdsByPurchase.get(doc.purchase_id) || []),
        explicitStores: explicit.length > 0,
        orderId: doc.purchase_order_id,
      },
    });
  }
  for (const doc of workDocuments) {
    const work = workById.get(doc.service_id);
    if (!work) continue;
    candidates.push({
      key: `work:${doc.storage_path?.trim() || `missing:${doc.id}`}`,
      source: 'work',
      type: doc.document_type as 'invoice' | 'receipt',
      number: doc.document_number,
      link: {
        recordId: `work:${doc.service_id}`,
        reference: work.codigo_negocio,
        supplier: work.provider_name || '',
        storeIds: [work.store_id],
        explicitStores: true,
        orderId: null,
      },
    });
  }
  return candidates;
}
