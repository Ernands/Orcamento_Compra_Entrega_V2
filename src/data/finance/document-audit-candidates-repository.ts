import { supabase } from '../supabase/client';
import { fetchAllPagesForIds } from '../supabase/pagination';
import type { AuditDocumentLink, AuditRecord } from '../../domain/document-audit-types';

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
  const numbers = unique(docs.map((doc) => doc.number));
  const paths = unique(docs.map((doc) => doc.storagePath));
  if (!numbers.length && !paths.length) return [];

  const fetchMatches = async <T>(
    table: 'supply_purchase_attachments' | 'works_service_documents',
    select: string,
  ): Promise<T[]> => {
    const [numberRows, pathRows] = await Promise.all([
      numbers.length
        ? fetchAllPagesForIds<T>(numbers, (chunk, from, to) => {
          let query = supabase.from(table).select(select).in('document_number', chunk);
          if (table === 'supply_purchase_attachments') query = query.is('deleted_at', null);
          return query.order('id').range(from, to) as never;
        })
        : Promise.resolve([] as T[]),
      paths.length
        ? fetchAllPagesForIds<T>(paths, (chunk, from, to) => {
          let query = supabase.from(table).select(select).in('storage_path', chunk);
          if (table === 'supply_purchase_attachments') query = query.is('deleted_at', null);
          return query.order('id').range(from, to) as never;
        })
        : Promise.resolve([] as T[]),
    ]);
    const matches = new Map<string, T>();
    for (const row of [...numberRows, ...pathRows]) {
      const candidate = row as { id: string; document_type: string };
      if (candidate.document_type === 'invoice' || candidate.document_type === 'receipt')
        matches.set(candidate.id, row);
    }
    return [...matches.values()];
  };

  const [purchaseDocuments, workDocuments] = await Promise.all([
    fetchMatches<FiscalAttachment>(
      'supply_purchase_attachments',
      'id,purchase_id,purchase_order_id,document_type,document_number,storage_path',
    ),
    fetchMatches<FiscalWorkDocument>(
      'works_service_documents',
      'id,service_id,document_type,document_number,storage_path',
    ),
  ]);

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
