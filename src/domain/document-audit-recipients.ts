import type { FiscalRecipient } from './document-audit-types';

/** Names explicitly accepted by the requester. No tax identifier was supplied. */
export const ACCEPTED_AUDIT_RECIPIENTS: FiscalRecipient[] = [
  { name: 'TERCEIRIZAÇÕES', taxId: null },
  { name: 'Thiago Lima Perdigao', taxId: null },
];

function isRecipient(value: unknown): value is FiscalRecipient {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.name === 'string' &&
    Boolean(item.name.trim()) &&
    (item.taxId === null ||
      (typeof item.taxId === 'string' &&
        /^(?:\d{11}|\d{14})$/.test(item.taxId.replace(/\D/g, '')))) &&
    (item.storeId === undefined || typeof item.storeId === 'string')
  );
}

export function configuredAuditRecipients(value: string | undefined): FiscalRecipient[] {
  if (!value?.trim()) return ACCEPTED_AUDIT_RECIPIENTS;
  const config: unknown = JSON.parse(value);
  const entries: unknown[] = Array.isArray(config) ? config : [];
  if (!Array.isArray(config) || !entries.every(isRecipient)) {
    throw new Error(
      'Cadastro fiscal inválido. Verifique VITE_FISCAL_RECIPIENTS_JSON antes de gerar a conferência.',
    );
  }
  return [...ACCEPTED_AUDIT_RECIPIENTS, ...entries];
}
