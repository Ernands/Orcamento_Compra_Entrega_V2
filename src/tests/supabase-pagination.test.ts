import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, fetchAllPagesForIds } from '../data/supabase/pagination';

describe('fetchAllPages', () => {
  it('busca todas as paginas quando o resultado ultrapassa o limite de uma consulta', async () => {
    const source = Array.from({ length: 1205 }, (_, index) => ({ id: index + 1 }));
    const fetchPage = vi.fn((from: number, to: number) =>
      Promise.resolve({
        data: source.slice(from, to + 1),
        error: null,
      }),
    );

    const result = await fetchAllPages(fetchPage, 500);

    expect(result).toEqual(source);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 499);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 500, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 1000, 1499);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('interrompe e propaga o erro de uma pagina', async () => {
    const failure = new Error('falha de leitura');
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchAllPages(fetchPage, 1)).rejects.toBe(failure);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});


describe('fetchAllPagesForIds', () => {
  it('deduplica IDs, divide em lotes e pagina cada lote sequencialmente', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const source = ids.flatMap((id) =>
      Array.from({ length: 3 }, (_, index) => ({ id, index })),
    );
    const fetchPage = vi.fn((chunk: string[], from: number, to: number) =>
      Promise.resolve({
        data: source.filter((row) => chunk.includes(row.id)).slice(from, to + 1),
        error: null,
      }),
    );

    const result = await fetchAllPagesForIds(
      [...ids, 'a'],
      fetchPage,
      4,
      2,
    );

    expect(result).toEqual(source);
    expect(fetchPage.mock.calls).toEqual([
      [['a', 'b'], 0, 3],
      [['a', 'b'], 4, 7],
      [['c', 'd'], 0, 3],
      [['c', 'd'], 4, 7],
      [['e'], 0, 3],
    ]);
  });

  it('nao consulta o banco quando nao ha IDs', async () => {
    const fetchPage = vi.fn();
    await expect(fetchAllPagesForIds([], fetchPage)).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('rejeita tamanho de lote invalido', async () => {
    await expect(fetchAllPagesForIds(['a'], vi.fn(), 500, 0)).rejects.toThrow(
      'chunkSize must be a positive integer',
    );
  });
});
