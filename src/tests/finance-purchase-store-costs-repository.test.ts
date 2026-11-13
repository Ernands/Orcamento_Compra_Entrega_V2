import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchaseStoreCostsPage } from '../data/finance/finance-purchase-store-costs-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

const page = {
  page: 1, page_size: 100, total_count: 1,
  total_contracted_cents: '10103', total_allocated_cents: '10103',
  unsupported_purchase_count: 0, is_complete: true,
  rows: [{
    purchase_id: 'cmp', order_id: 'order-1', reference_code: 'CMP-00014',
    contracted_cents: '10103', allocated_cents: '10103', unallocated_cents: '0',
    stores: [
      { store_id: 'store-a', store_code: 'LOJ-001', cost_cents: '5001' },
      { store_id: 'store-b', store_code: 'LOJ-002', cost_cents: '2551' },
      { store_id: 'store-c', store_code: 'LOJ-003', cost_cents: '2551' },
    ],
  }],
};

describe('rateio de custos contratados SQL por loja', () => {
  it('converte centavos e não altera custos por arredondamento', async () => {
    mock.rpc.mockResolvedValue({ data: page, error: null });
    const result = await listFinancePurchaseStoreCostsPage({ page: 1, pageSize: 100 });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_store_costs_page_v1', {
      p_page: 1, p_page_size: 100,
    });
    expect(result.totalContractedCents).toBe(10103n);
    expect(result.totalAllocatedCents).toBe(10103n);
    expect(result.rows[0].stores.map((s) => s.costCents)).toEqual([5001n, 2551n, 2551n]);
  });

  it('preserva unallocated quando a loja ainda não tem distribuição confirmada', async () => {
    mock.rpc.mockResolvedValue({ data: {
      ...page, total_allocated_cents: '0',
      rows: [{ ...page.rows[0],
        allocated_cents: '0', unallocated_cents: '10103', stores: [],
      }],
    }, error: null });
    const result = await listFinancePurchaseStoreCostsPage();
    expect(result.rows[0].unallocatedCents).toBe(10103n);
  });

  it('bloqueia por padrão compras ajustadas e linhas de custo desconhecido', async () => {
    mock.rpc.mockResolvedValue({ data: {
      ...page, is_complete: false, unsupported_purchase_count: 2,
    }, error: null });
    await expect(listFinancePurchaseStoreCostsPage()).rejects.toThrow('Rateio SQL incompleto');
    const diagnostic = await listFinancePurchaseStoreCostsPage({ allowIncomplete: true });
    expect(diagnostic.isComplete).toBe(false);
    expect(diagnostic.unsupportedPurchaseCount).toBe(2);
  });

  it('rejeita centavos não conservados e loja repetida', async () => {
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, rows: [{ ...page.rows[0], unallocated_cents: '1' }],
    }, error: null });
    await expect(listFinancePurchaseStoreCostsPage()).rejects.toThrow('rateio divergente');
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, rows: [{ ...page.rows[0], stores: [
        page.rows[0].stores[0], page.rows[0].stores[0],
      ] }],
    }, error: null });
    await expect(listFinancePurchaseStoreCostsPage()).rejects.toThrow('rateio divergente');
  });

  it('rejeita contratos inválidos e propaga RLS errors', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...page, rows: null }, error: null });
    await expect(listFinancePurchaseStoreCostsPage()).rejects.toThrow('contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Acesso negado') });
    await expect(listFinancePurchaseStoreCostsPage()).rejects.toThrow('Acesso negado');
  });
});
