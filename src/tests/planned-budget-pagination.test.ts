import { describe, expect, it, vi } from 'vitest';
import { collectPaginatedRows } from '../data/planned-budget/planned-budget-repository';

describe('planned budget pagination', () => {
  it('carrega todas as linhas quando os vínculos ultrapassam o limite de 1000', async () => {
    const source = Array.from({ length: 1202 }, (_, index) => ({ id: index + 1 }));
    const loadPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1));

    const rows = await collectPaginatedRows(loadPage, 500);

    expect(rows).toHaveLength(1202);
    expect(rows[0]).toEqual({ id: 1 });
    expect(rows[rows.length - 1]).toEqual({ id: 1202 });
    expect(loadPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it('faz uma página vazia final quando o total é múltiplo exato', async () => {
    const source = Array.from({ length: 1000 }, (_, index) => index);
    const loadPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1));

    const rows = await collectPaginatedRows(loadPage, 500);

    expect(rows).toHaveLength(1000);
    expect(loadPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });
});
