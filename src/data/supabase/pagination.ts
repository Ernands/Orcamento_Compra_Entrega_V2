export const SUPABASE_PAGE_SIZE = 500;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer');
  }

  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw error instanceof Error ? error : new Error('Supabase pagination request failed');
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return rows;
  }
}

/**
 * Loads paginated rows for a set of parent IDs. IDs are de-duplicated and
 * queried in bounded, sequential chunks to avoid oversized PostgREST URLs
 * and request bursts.
 */
export async function fetchAllPagesForIds<T>(
  ids: string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
  chunkSize = 100,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer');
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];

  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const chunkRows = await fetchAllPages(
      (from, to) => fetchPage(chunk, from, to),
      pageSize,
    );
    rows.push(...chunkRows);
  }

  return rows;
}
