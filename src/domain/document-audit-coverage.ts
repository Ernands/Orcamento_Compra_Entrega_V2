import type { AuditDocument, AuditRecord } from './document-audit-types';

type DocumentRecord = Pick<AuditRecord, 'documents'>;

/** Counts unique fiscal references, not repeated links to the same CMP/OBR. */
export function auditDocumentCoverage(records: readonly DocumentRecord[]): {
  registered: number;
  withPath: number;
  withoutPath: number;
} {
  const documents = new Map<string, AuditDocument>();
  for (const record of records) {
    for (const doc of record.documents) {
      if (!documents.has(doc.key)) documents.set(doc.key, doc);
    }
  }
  const withPath = [...documents.values()].filter((doc) => Boolean(doc.storagePath?.trim())).length;
  return { registered: documents.size, withPath, withoutPath: documents.size - withPath };
}

/** A fiscal metadata record without a Storage path is not a usable attachment. */
export function auditRecordDocumentLabel(record: DocumentRecord): {
  label: string;
  detail: string;
} {
  if (!record.documents.length) {
    return { label: 'Sem nota ou recibo', detail: 'Nenhum documento fiscal cadastrado' };
  }
  const withPath = record.documents.filter((doc) => Boolean(doc.storagePath?.trim()));
  const withoutPath = record.documents.length - withPath.length;
  if (!withPath.length) {
    return {
      label: 'Sem arquivo fiscal vinculado',
      detail: `${withoutPath} cadastro(s) sem arquivo — regularizar`,
    };
  }
  const invoiceCount = withPath.filter((doc) => doc.type === 'invoice').length;
  return {
    label: invoiceCount ? `${invoiceCount} nota(s) com caminho de arquivo` : 'Recibo(s) com caminho de arquivo',
    detail: withoutPath
      ? `${withoutPath} cadastro(s) sem arquivo — regularizar`
      : 'Conteúdo será conferido ao gerar',
  };
}
