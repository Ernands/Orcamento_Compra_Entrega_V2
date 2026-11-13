/**
 * Normalizes registered fiscal reference numbers for candidate searches only.
 * Internal ASCII whitespace and letter case are not evidence of different
 * documents. Matches the PostgreSQL upper(regexp_replace(btrim(...))) lookup
 * for the supported reference-number characters.
 *
 * Never use this to prove fiscal identity or alter stored document numbers.
 */
export function normalizeFiscalDocumentNumber(value: string | null | undefined): string {
  return (value || '').replace(/[ \t\r\n\f\v]+/g, '').toUpperCase();
}
