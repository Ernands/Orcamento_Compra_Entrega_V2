import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchasePaymentOriginsPage } from '../data/finance/finance-purchase-payment-origins-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

function page(overrides: Record<string, unknown> = {}) {
  return {
    page: 1, page_size: 50, total_count: 1,
    unsupported_purchase_count: 0, is_complete: true,
    page_amount_cents: '10103', page_origin_allocated_cents: '10103',
    rows: [{
      id: 'purchase:payment-1:paid', purchase_id: 'purchase-1',
      order_id: 'order-1', reference_code: 'CMP-00002',
      status: 'paid', event_date: '2026-11-12',
      amount_cents: '10103', equipment_cents: '5001',
      furniture_cents: '5102', works_cents: '0', unallocated_origin_cents: '0',
    }],
    ...overrides,
  };
}

describe('rateio de cada pagamento por origem financeira (SQL)', () => {
  it('conserva centavos em duas origens e chama RPC com paginação', async () => {
    mock.rpc.mockResolvedValue({ data: page(), error: null });
    const result = await listFinancePurchasePaymentOriginsPage({ page: 2, pageSize: 25 });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_payment_origins_page_v1', {
      p_page: 2, p_page_size: 25,
    });
    expect(result.rows[0].equipmentCents).toBe(5001n);
    expect(result.rows[0].furnitureCents).toBe(5102n);
    expect(result.pageAllocatedCents).toBe(10103n);
    expect(result.pageAmountCents).toBe(10103n);
  });

  it('identifica eventos cujos custos ainda não têm origem classificável', async () => {
    mock.rpc.mockResolvedValue({ data: page({
      page_origin_allocated_cents: '0',
      rows: [{ ...page().rows[0], equipment_cents: '0', furniture_cents: '0',
        unallocated_origin_cents: '10103' }],
    }), error: null });
    const result = await listFinancePurchasePaymentOriginsPage();
    expect(result.pageAllocatedCents).toBe(0n);
    expect(result.rows[0].unallocatedOriginCents).toBe(10103n);
  });

  it('recusa compra com ajustes parciais ou custos não suportados', async () => {
    mock.rpc.mockResolvedValue({ data: page({
      is_complete: false, unsupported_purchase_count: 1,
    }), error: null });
    await expect(listFinancePurchasePaymentOriginsPage())
      .rejects.toThrow('incompleta');
    const diagnostic = await listFinancePurchasePaymentOriginsPage({
      allowIncomplete: true,
    });
    expect(diagnostic.isComplete).toBe(false);
  });

  it('recusa perda de centavos dentro do pagamento e no total da página', async () => {
    mock.rpc.mockResolvedValueOnce({ data: page({
      rows: [{ ...page().rows[0], furniture_cents: '5101' }],
      page_origin_allocated_cents: '10102',
    }), error: null });
    await expect(listFinancePurchasePaymentOriginsPage())
      .rejects.toThrow('não fecha');

    mock.rpc.mockResolvedValueOnce({ data: page({
      page_origin_allocated_cents: '10102',
    }), error: null });
    await expect(listFinancePurchasePaymentOriginsPage())
      .rejects.toThrow('Totais da página');
  });

  it('não interpreta erros de acesso e contratos quebrados como saldo zero', async () => {
    mock.rpc.mockResolvedValueOnce({ data: page({ rows: null }), error: null });
    await expect(listFinancePurchasePaymentOriginsPage())
      .rejects.toThrow('contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Acesso negado') });
    await expect(listFinancePurchasePaymentOriginsPage()).rejects.toThrow('Acesso negado');
  });
});
