/** Pagination for expensive financial table DOM rendering only.
 * The source rows are never discarded, so totals and exports remain complete.
 */
export const FINANCE_TABLE_PAGE_SIZE = 50;

export function financeTablePage<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize = FINANCE_TABLE_PAGE_SIZE,
): { items: T[]; total: number; page: number; pageCount: number } {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('O tamanho da pagina deve ser um inteiro positivo.');
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), pageCount)
    : 1;
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageCount,
  };
}
