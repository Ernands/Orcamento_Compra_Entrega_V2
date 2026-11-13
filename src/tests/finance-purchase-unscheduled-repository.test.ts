import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchaseUnscheduledPage } from '../data/finance/finance-purchase-unscheduled-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

function page(overrides: Record<string, unknown> = {}) {
  return {
    page: 1, page_size: 50, total_count: 1,
    unscheduled_cents: '340', unsupported_purchase_count: 0, is_complete: true,
    rows: [{
      id: 'purchase-unscheduled:cmp:ord',
      purchase_id: 'cmp', order_id: 'ord', reference_code: 'CMP-00014',
      contracted_cents: '1000', linked_cents: '360',
      general_allocated_cents: '300', amount_cents: '340',
    }],
    ...overrides,
  };
}

describe('saldo SQL de Compras sem programação', () => {
  it('conserva os centavos e filtros de paginação', async () => {
    mock.rpc.mockResolvedValue({ data: page(), error: null });
    const result = await listFinancePurchaseUnscheduledPage({ page: 2, pageSize: 20 });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_unscheduled_page_v1', {
      p_page: 2, p_page_size: 20,
    });
    expect(result.unscheduledCents).toBe(340n);
    expect(result.rows[0].amountCents).toBe(340n);
    expect(result.rows[0].generalAllocatedCents).toBe(300n);
  });

  it('recusa projeção parcial com compra ajustada ou pedido de valor desconhecido', async () => {
    mock.rpc.mockResolvedValue({ data: page({
      is_complete: false, unsupported_purchase_count: 1,
    }), error: null });
    await expect(listFinancePurchaseUnscheduledPage()).rejects.toThrow('Saldos SQL incompletos');
    const result = await listFinancePurchaseUnscheduledPage({ allowIncomplete: true });
    expect(result.isComplete).toBe(false);
    expect(result.unsupportedPurchaseCount).toBe(1);
  });

  it('recusa valor líquido divergente da contratação menos pagamentos', async () => {
    mock.rpc.mockResolvedValue({ data: page({
      rows: [{ ...page().rows[0], amount_cents: '341' }],
    }), error: null });
    await expect(listFinancePurchaseUnscheduledPage()).rejects.toThrow('diferença de centavos');
  });

  it('recusa sinal de completude inconsistente ou contrato ausente', async () => {
    mock.rpc.mockResolvedValueOnce({ data: page({
      is_complete: true, unsupported_purchase_count: 1,
    }), error: null });
    await expect(listFinancePurchaseUnscheduledPage()).rejects.toThrow('cobertura');
    mock.rpc.mockResolvedValueOnce({ data: page({ rows: null }), error: null });
    await expect(listFinancePurchaseUnscheduledPage()).rejects.toThrow('contrato inválido');
  });

  it('não converte erro de permissão em total zero', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('RLS: permissão negada') });
    await expect(listFinancePurchaseUnscheduledPage()).rejects.toThrow('permissão negada');
  });
});
