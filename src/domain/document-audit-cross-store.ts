import type { AuditDocument, AuditDocumentLink, AuditRecord } from './document-audit-types';

export type AuditExternalCandidate = {
  key: string;
  type: 'invoice' | 'receipt';
  number: string | null;
  source: 'purchase' | 'work';
  link: AuditDocumentLink;
};

const normalize = (value: string | null | undefined) =>
  (value || '').trim().toLocaleUpperCase('pt-BR');
const linkKey = (link: AuditDocumentLink) =>
  JSON.stringify([link.recordId, link.orderId]);

/**
 * Supplements the per-store audit with RLS-visible metadata from other stores.
 * Equal source + Storage path means a *known link*. Equal registered number,
 * document kind and supplier means only a *possible link* for manual review.
 * Never imports the other store's fiscal file or financial values.
 */
export function supplementAuditCrossStoreLinks(
  records: AuditRecord[],
  candidates: readonly AuditExternalCandidate[],
): AuditRecord[] {
  if (!candidates.length) return records;
  const byKey = new Map<string, AuditDocument>();
  const numberSupplier = new Map<string, AuditDocument[]>();
  for (const record of records) {
    for (const original of record.documents) {
      if (byKey.has(original.key)) continue;
      const doc: AuditDocument = {
        ...original,
        links: [...original.links],
        possibleLinks: [...(original.possibleLinks || [])],
      };
      byKey.set(doc.key, doc);
    }
  }

  // Merge physically identical paths before indexing supplier names. A shared
  // file may be linked to another CMP with a different registered supplier.
  for (const candidate of candidates) {
    const exact = byKey.get(candidate.key);
    if (exact && !exact.links.some((link) => linkKey(link) === linkKey(candidate.link)))
      exact.links.push(candidate.link);
  }
  for (const doc of byKey.values()) {
    if (!doc.number?.trim()) continue;
    for (const supplier of new Set(doc.links.map((link) => normalize(link.supplier)).filter(Boolean))) {
      const key = JSON.stringify([doc.type, normalize(doc.number), supplier]);
      const matches = numberSupplier.get(key) || [];
      matches.push(doc);
      numberSupplier.set(key, matches);
    }
  }

  for (const candidate of candidates) {
    if (byKey.has(candidate.key)) continue;
    if (!candidate.number?.trim() || !candidate.link.supplier.trim()) continue;
    const key = JSON.stringify([
      candidate.type,
      normalize(candidate.number),
      normalize(candidate.link.supplier),
    ]);
    for (const doc of numberSupplier.get(key) || []) {
      if (doc.links.some((link) => link.recordId === candidate.link.recordId)) continue;
      if (!doc.possibleLinks?.some((link) => linkKey(link) === linkKey(candidate.link)))
        doc.possibleLinks?.push(candidate.link);
    }
  }

  return records.map((record) => ({
    ...record,
    documents: record.documents.map((doc) => byKey.get(doc.key) || doc),
  }));
}
