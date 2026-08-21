import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from '../data/supabase/pagination';

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
