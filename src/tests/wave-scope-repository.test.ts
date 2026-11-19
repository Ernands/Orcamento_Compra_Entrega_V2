import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWaveScopedStoreIds,
  invalidateWaveScopeCache,
  readWaveSelection,
  saveWaveSelection,
} from '../data/waves/wave-scope-repository';

const db = vi.hoisted(() => ({
  calls: [] as number[][],
  rows: [
    { id: 'store-a', wave_id: 1 },
    { id: 'store-b', wave_id: 1 },
    { id: 'store-c', wave_id: 2 },
  ],
}));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      if (table !== 'lojas') throw new Error('Unexpected global read: ' + table);
      let selected: number[] | null = null;
      return {
        select() { return this; },
        in(column: string, values: number[]) {
          if (column !== 'wave_id') throw new Error('Wave predicate required');
          selected = [...values];
          db.calls.push([...values]);
          return this;
        },
        order() {
          if (selected === null) throw new Error('Unbounded wave query');
          const data = db.rows.filter((row) => selected!.includes(row.wave_id))
            .map((row) => ({ id: row.id }));
          return Promise.resolve({ data, error: null });
        },
      };
    },
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  invalidateWaveScopeCache();
  db.calls = [];
});
afterEach(() => {
  window.localStorage.clear();
  invalidateWaveScopeCache();
});

describe('Supabase: consultas limitadas pelas ondas', () => {
  it('retorna somente as lojas da onda selecionada, sem consulta extra ao usar cache', async () => {
    saveWaveSelection([2]);
    expect(readWaveSelection()).toEqual([2]);
    expect(await getWaveScopedStoreIds()).toEqual(['store-c']);
    expect(await getWaveScopedStoreIds()).toEqual(['store-c']);
    expect(db.calls).toEqual([[2]]);
    saveWaveSelection([1]);
    expect(await getWaveScopedStoreIds()).toEqual(['store-a', 'store-b']);
    expect(db.calls).toEqual([[2], [1]]);
  });

  it('retorna vazio para uma onda sem lojas e nunca transforma isso em todas as lojas', async () => {
    saveWaveSelection([3]);
    expect(await getWaveScopedStoreIds()).toEqual([]);
    expect(db.calls).toEqual([[3]]);
  });

  it('combina várias ondas e permite todas somente por seleção explícita', async () => {
    saveWaveSelection([2, 1, 2]);
    expect(readWaveSelection()).toEqual([1, 2]);
    expect(await getWaveScopedStoreIds()).toEqual(['store-a', 'store-b', 'store-c']);
    saveWaveSelection(null);
    expect(readWaveSelection()).toBeNull();
    expect(await getWaveScopedStoreIds()).toBeNull();
    expect(db.calls).toEqual([[1, 2]]);
  });
});
