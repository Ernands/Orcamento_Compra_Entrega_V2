import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listManagerialReimbursements } from '../data/finance/managerial-reimbursements-repository';

type Row = {
  id: string; store_id: string; entry_type: 'received';
  amount_cents: string; entry_date: string; protocol: null;
  notes: null; reversal_of: null; created_by: string; created_at: string;
};
const db = vi.hoisted<{
  storeIds: string[] | null;
  rows: Row[];
  requests: Array<{ ids: string[] | null; from: number; to: number }>;
}>(() => ({ storeIds: ['store-1'], rows: [], requests: [] }));

vi.mock('../data/waves/wave-scope-repository', () => ({
  getWaveScopedStoreIds: () => Promise.resolve(db.storeIds),
}));
vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      if (table !== 'finance_managerial_reimbursement_entries')
        throw new Error('Unexpected table: ' + table);
      const scope: { ids: string[] | null } = { ids: null };
      const query = {
        select() { return query; },
        in(column: string, ids: string[]) {
          if (column !== 'store_id') throw new Error('Store scope missing');
          scope.ids = ids;
          return query;
        },
        order() { return query; },
        range(from: number, to: number) {
          db.requests.push({ ids: scope.ids, from, to });
          const rows = db.rows.filter((row) => !scope.ids || scope.ids.includes(row.store_id))
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

beforeEach(() => {
  db.storeIds = ['store-1'];
  db.requests = [];
  db.rows = Array.from({ length: 1100 }, (_, i): Row => ({
    id: 'receipt-' + String(i).padStart(4, '0'), store_id: 'store-1',
    entry_type: 'received', amount_cents: '100',
    entry_date: '2026-11-23', protocol: null, notes: null,
    reversal_of: null, created_by: 'admin',
    created_at: '2026-11-23T12:00:00Z',
  }));
  db.rows.push({
    id: 'receipt-wave-2', store_id: 'store-2', entry_type: 'received',
    amount_cents: '5000000', entry_date: '2026-11-23', protocol: null,
    notes: null, reversal_of: null, created_by: 'admin',
    created_at: '2026-11-23T12:01:00Z',
  });
});

describe('Reembolsos gerenciais carregados dentro da onda selecionada', () => {
  it('não perde recibos acima do limite de 1.000 e não traz eventos de outra onda', async () => {
    const result = await listManagerialReimbursements();
    expect(result).toHaveLength(1100);
    expect(result.reduce((sum, item) => sum + item.amountCents, 0n)).toBe(110000n);
    expect(result.every((item) => item.storeId === 'store-1')).toBe(true);
    expect(db.requests).toEqual([
      { ids: ['store-1'], from: 0, to: 499 },
      { ids: ['store-1'], from: 500, to: 999 },
      { ids: ['store-1'], from: 1000, to: 1499 },
    ]);
  });

  it('nenhuma loja selecionada não dispara consulta sem filtro', async () => {
    db.storeIds = [];
    expect(await listManagerialReimbursements()).toEqual([]);
    expect(db.requests).toHaveLength(0);
  });

  it('todas as ondas só consulta globalmente com seleção explícita', async () => {
    db.storeIds = null;
    const result = await listManagerialReimbursements();
    expect(result).toHaveLength(1101);
    expect(result[0].id).toBe('receipt-wave-2');
    expect(db.requests.map(({ ids }) => ids)).toEqual([null, null, null]);
  });

  it('seleção exclusiva da segunda onda não carrega reembolsos da primeira', async () => {
    db.storeIds = ['store-2'];
    const result = await listManagerialReimbursements();
    expect(result).toHaveLength(1);
    expect(result[0].amountCents).toBe(5000000n);
    expect(db.requests).toEqual([{ ids: ['store-2'], from: 0, to: 499 }]);
  });
});
