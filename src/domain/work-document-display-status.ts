import type { WorkServiceDocument } from './works-types';

/** A verified *record* is not proof that its file was uploaded. */
export function workDocumentDisplayStatus(
  document: Pick<WorkServiceDocument, 'storagePath' | 'status'>,
): { tone: 'missing' | 'verified' | 'pending'; label: string; hasFile: boolean } {
  const hasFile = Boolean(document.storagePath?.trim());
  if (!hasFile) {
    return {
      tone: 'missing',
      label: 'Sem arquivo — regularizar',
      hasFile: false,
    };
  }
  return document.status === 'verified'
    ? { tone: 'verified', label: 'Conferido', hasFile: true }
    : { tone: 'pending', label: 'Pendente de conferência', hasFile: true };
}
