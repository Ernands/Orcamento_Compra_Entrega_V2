import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchaseStoreOriginWeightsPage } from '../data/finance/finance-purchase-store-origin-weights-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

const page = {
  page: 1, page_size: 100, total_count: 1,
  unsupported_purchase_count: 0, is_complete: true,
  total_contracted_cents: '10001',
  total_allocated_cents: '10000',
  total_unallocated_cents: '1',
  rows: [{
    purchase_id: 'cmp', order_id: 'order-1', reference_code: 'CMP-00101',
    contracted_cents: '10001', allocated_cents: '10000', unallocated_cents: '1',
    stores: [
      { store_id: 'store-a', store_code: 'LOJ-001', equipment_cents: '4001',
        furniture_cents: '0', allocated_cents: '4001' },
      { store_id: 'store-b', store_code: 'LOJ-002', equipment_cents: '0',
        furniture_cents: '5999', allocated_cents: '5999' },
    ],
  }],
};

describe('projeção SQL diagnóstica dos pesos por loja e origem', () => {
  it('reconcilia equipamentos, mobiliário e valor sem distribuição em centavos', async () => {
    mock.rpc.mockResolvedValue({ data: page, error: null });
    const result = await listFinancePurchaseStoreOriginWeightsPage({ page: 1, pageSize: 100 });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_store_origin_weights_page_v1', {
      p_page: 1, p_page_size: 100,
    });
    expect(result.contractedCents).toBe(10001n);
    expect(result.allocatedCents).toBe(10000n);
    expect(result.unallocatedCents).toBe(1n);
    expect(result.rows[0].stores[0].equipmentCents).toBe(4001n);
    expect(result.rows[0].stores[1].furnitureCents).toBe(5999n);
  });

  it('recusa centavo perdido no rateio interno e em totais globais', async () => {
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, rows: [{ ...page.rows[0], stores: [
        { ...page.rows[0].stores[0], equipment_cents: '4000' },
        page.rows[0].stores[1],
      ] }],
    }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('Pesos por loja/origem divergentes');
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, total_unallocated_cents: '0',
    }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('não conservam centavos');
  });

  it('bloqueia repetição de loja ou pedido na página', async () => {
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, rows: [{ ...page.rows[0], stores: [
        page.rows[0].stores[0], page.rows[0].stores[0],
      ] }],
    }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('divergentes');
    mock.rpc.mockResolvedValueOnce({ data: {
      ...page, rows: [page.rows[0], page.rows[0]],
    }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('duplicou pedidos');
  });

  it('nunca aprova cobertura parcial por padrão', async () => {
    mock.rpc.mockResolvedValue({ data: {
      ...page, is_complete: false, unsupported_purchase_count: 1,
    }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('incompletos');
    const diagnostic = await listFinancePurchaseStoreOriginWeightsPage({ allowIncomplete: true });
    expect(diagnostic.unsupportedPurchaseCount).toBe(1);
    expect(diagnostic.isComplete).toBe(false);
  });

  it('rejeita contrato inválido e propaga erros RLS/conexão', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...page, rows: null }, error: null });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Acesso negado') });
    await expect(listFinancePurchaseStoreOriginWeightsPage()).rejects.toThrow('Acesso negado');
  });
});
