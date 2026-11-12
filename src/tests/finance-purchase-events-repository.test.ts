import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchaseEventsPage } from '../data/finance/finance-purchase-events-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

function raw(overrides: Record<string, unknown> = {}) {
  return {
    page: 1, page_size: 50, total_count: 1, paid_cents: '340858',
    gross_paid_cents: '340858', refunds_cents: '0',
    planned_cents: '0', unsupported_purchase_count: 0,
    unsupported_payment_count: 0, is_complete: true,
    rows: [{
      id: 'purchase:payment-97:paid',
      payment_id: 'payment-97', purchase_id: 'purchase-97',
      order_id: 'order-97', reference_code: 'CMP-00097',
      counterpart: 'Fornecedor', status: 'paid',
      event_date: '2026-11-10', amount_cents: '340858',
      gross_amount_cents: '340858', refund_cents: '0',
      payment_method: 'pix', source_label: null,
      installment_label: 'Pagamento realizado',
    }],
    ...overrides,
  };
}
describe('API paginada dos eventos de pagamento de Compras', () => {
  it('preserva centavos e repassa filtros SQL', async () => {
    mock.rpc.mockResolvedValue({ data: raw(), error: null });
    const result = await listFinancePurchaseEventsPage({
      page: 2, pageSize: 10, status: 'paid',
      dateFrom: '2026-11-01', dateTo: '2026-11-30', query: 'CMP-',
    });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_events_page_v2', {
      p_page: 2, p_page_size: 10, p_status: 'paid',
      p_date_from: '2026-11-01', p_date_to: '2026-11-30', p_query: 'CMP-',
    });
    expect(result).toMatchObject({
      paidCents: 340858n, grossPaidCents: 340858n,
      refundedCents: 0n, plannedCents: 0n,
      isComplete: true, unsupportedPurchaseCount: 0,
      totalCount: 1,
    });
    expect(result.rows[0].amountCents).toBe(340858n);
    expect(result.rows[0].orderId).toBe('order-97');
  });

  it('bloqueia retorno incompleto por reembolso ou parcelamento fora do limite', async () => {
    mock.rpc.mockResolvedValue({ data: raw({
      total_count: 0, rows: [], paid_cents: '0',
      gross_paid_cents: '0', refunds_cents: '0',
      is_complete: false, unsupported_purchase_count: 1,
      unsupported_payment_count: 2,
    }), error: null });
    await expect(listFinancePurchaseEventsPage()).rejects.toThrow('Projeção financeira incompleta');
    const diagnostic = await listFinancePurchaseEventsPage({ allowIncomplete: true });
    expect(diagnostic.isComplete).toBe(false);
    expect(diagnostic.unsupportedPaymentCount).toBe(2);
  });

  it('rejeita divergência entre indicador completo e contagem de exclusões', async () => {
    mock.rpc.mockResolvedValue({ data: raw({
      is_complete: true, unsupported_payment_count: 1,
    }), error: null });
    await expect(listFinancePurchaseEventsPage()).rejects.toThrow('indicador de integridade');
  });

  it('propaga falhas de Supabase e contratos inválidos', async () => {
    mock.rpc.mockResolvedValueOnce({ data: raw({ rows: null }), error: null });
    await expect(listFinancePurchaseEventsPage()).rejects.toThrow('contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Sem permissão') });
    await expect(listFinancePurchaseEventsPage()).rejects.toThrow('Sem permissão');
  });
});
