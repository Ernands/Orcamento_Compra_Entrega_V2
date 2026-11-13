import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePurchaseAdjustmentsPage } from '../data/finance/finance-purchase-adjustment-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

function adjusted() {
  return {
    page: 1, page_size: 50, total_count: 1, invalid_count: 0,
    is_complete: true, original_cents_total: '10000',
    remaining_cents_total: '6510', refund_cents_total: '3490',
    rows: [{
      id: 'ajuste-38', purchase_id: 'cmp-38', order_id: 'order-38',
      payment_id: 'payment-38', reference_code: 'CMP-00038',
      reference: 'REEMB-38', refunded_on: '2026-11-01',
      original_cents: '10000', remaining_cents: '6510',
      refund_cents: '3490', cancelled_cents: '4000',
      freight_reduction_cents: '-510', residual_cents: '-10',
      refund_entry_cents: '3490', entry_count: 1, is_valid: true,
    }],
  };
}

describe('somatório de ajustes imutáveis (somente leitura)', () => {
  it('converte centavos, concilia sinais de frete e identifica reembolso', async () => {
    mock.rpc.mockResolvedValue({ data: adjusted(), error: null });
    const result = await listFinancePurchaseAdjustmentsPage();
    expect(mock.rpc).toHaveBeenCalledWith(
      'finance_purchase_adjustment_reconciliation_v1', { p_page: 1, p_page_size: 50 },
    );
    expect(result.grossCents).toBe(10000n);
    expect(result.refundedCents).toBe(3490n);
    expect(result.netCents).toBe(6510n);
    expect(result.rows[0].freightReductionCents).toBe(-510n);
    expect(result.rows[0].residualCents).toBe(-10n);
    expect(result.rows[0].refundEntryCents).toBe(3490n);
  });

  it('bloqueia por padrão histórico inválido; libera apenas diagnóstico explícito', async () => {
    mock.rpc.mockResolvedValue({ data: {
      ...adjusted(), invalid_count: 1, is_complete: false,
      rows: [{ ...adjusted().rows[0], is_valid: false }],
    }, error: null });
    await expect(listFinancePurchaseAdjustmentsPage()).rejects.toThrow(
      'Histórico de ajustes parcialmente inconsistente',
    );
    const diagnostic = await listFinancePurchaseAdjustmentsPage({ allowIncomplete: true });
    expect(diagnostic.isComplete).toBe(false);
  });

  it('rejeita contrato quebrado e indicador de integridade contraditório', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...adjusted(), rows: null }, error: null });
    await expect(listFinancePurchaseAdjustmentsPage()).rejects.toThrow('contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: {
      ...adjusted(), invalid_count: 1, is_complete: true,
    }, error: null });
    await expect(listFinancePurchaseAdjustmentsPage()).rejects.toThrow('integridade');
  });

  it('preserva erro de permissão sem retornar zeros falsos', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Sem permissão') });
    await expect(listFinancePurchaseAdjustmentsPage()).rejects.toThrow('Sem permissão');
  });
});
