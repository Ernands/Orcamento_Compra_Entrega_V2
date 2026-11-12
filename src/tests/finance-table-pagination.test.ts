import { describe, expect, it } from 'vitest';
import { financeTablePage, FINANCE_TABLE_PAGE_SIZE } from '../domain/finance-table-pagination';

describe('financeTablePage', () => {
  const rows = Array.from({ length: 123 }, (_, index) => index);

  it('mantem todas as linhas disponiveis para totais enquanto limita o DOM', () => {
    const first = financeTablePage(rows, 1);
    const last = financeTablePage(rows, 3);
    expect(FINANCE_TABLE_PAGE_SIZE).toBe(50);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]).toBe(0);
    expect(last.items).toHaveLength(23);
    expect(last.items[0]).toBe(100);
    expect(last.total).toBe(123);
    expect(last.pageCount).toBe(3);
    expect(rows).toHaveLength(123);
  });

  it('limita paginas invalidas sem apresentar linha inexistente', () => {
    expect(financeTablePage(rows, -1).page).toBe(1);
    expect(financeTablePage(rows, 100).page).toBe(3);
    expect(financeTablePage([], 2)).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});
