import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStores } from '../data/stores/stores-repository';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  waveIds: [1] as number[] | null,
  tables: {} as Record<string, Row[]>,
  requests: [] as Array<{ table: string; column: string | null; ids: unknown[] | null; from: number; to: number }>,
}));

vi.mock('../data/waves/wave-scope-repository', () => ({
  readWaveSelection: () => db.waveIds,
  invalidateWaveScopeCache: vi.fn(),
}));
vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      let filter: { column: string; ids: unknown[] } | null = null;
      const query = {
        select() { return query; },
        in(column: string, ids: unknown[]) { filter = { column, ids }; return query; },
        order() { return query; },
        range(from: number, to: number) {
          db.requests.push({ table, column: filter?.column ?? null, ids: filter?.ids ?? null, from, to });
          const rows = (db.tables[table] || []).filter((row) =>
            filter === null || filter.ids.includes(row[filter.column]));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

function store(index: number, waveId: number): Row {
  return {
    id: 'store-' + index, codigo_negocio: 'LOJ-' + index,
    nome: 'Loja ' + String(index).padStart(5, '0'),
    cidade: 'Natal', uf: 'RN', endereco: null, status: 'active',
    data_inauguracao_planejada: null, observacoes: null,
    responsavel_usuario_id: null, wave_id: waveId,
  };
}

beforeEach(() => {
  db.waveIds = [1];
  db.tables = {
    lojas: [
      ...Array.from({ length: 1150 }, (_, i) => store(i, 1)),
      ...Array.from({ length: 12 }, (_, i) => store(1150 + i, 2)),
    ],
    store_financial_closures: [],
  };
  db.requests = [];
});

describe('Carregamento de lojas para ondas grandes', () => {
  it('não corta uma onda depois dos primeiros 1.000 registros', async () => {
    const result = await listStores();
    expect(result).toHaveLength(1150);
    expect(new Set(result.map((row) => row.id)).size).toBe(1150);
    expect(result.every((row) => row.waveId === 1)).toBe(true);
    const calls = db.requests.filter((item) => item.table === 'lojas');
    expect(calls.map((item) => [item.from, item.to])).toEqual([
      [0, 499], [500, 999], [1000, 1499],
    ]);
    expect(calls.every((item) => item.column === 'wave_id' &&
      JSON.stringify(item.ids) === '[1]')).toBe(true);
    const closureCalls = db.requests.filter((item) => item.table === 'store_financial_closures');
    expect(closureCalls).toHaveLength(12);
    expect(closureCalls.every((item) => item.column === 'store_id' &&
      item.ids !== null && item.ids.length <= 100)).toBe(true);
    expect(result.every((row) => row.financialClosure?.state === 'open')).toBe(true);
  });

  it('consulta apenas a segunda onda, sem transferir lojas da primeira', async () => {
    db.waveIds = [2];
    const result = await listStores();
    expect(result).toHaveLength(12);
    expect(result.every((row) => row.waveId === 2)).toBe(true);
    const calls = db.requests.filter((item) => item.table === 'lojas');
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual([2]);
  });

  it('onda ainda vazia nunca cai em uma consulta sem filtro', async () => {
    db.waveIds = [3];
    expect(await listStores()).toEqual([]);
    expect(db.requests.filter((item) => item.table === 'lojas')).toHaveLength(1);
    expect(db.requests.every((item) => item.table === 'lojas' && item.ids?.[0] === 3)).toBe(true);
  });
});
