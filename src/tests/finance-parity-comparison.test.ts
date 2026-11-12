import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFinancePreviewParity } from '../data/finance/finance-parity-comparison';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), adjustments: vi.fn() }));
vi.mock('../data/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) =>
      name === 'finance_purchase_adjustment_reconciliation_v1'
        ? mock.adjustments(name, args)
        : mock.rpc(name, args),
  },
}));

const emptyPage = {
  page: 1,
  page_size: 100,
  total_count: 0,
  paid_cents: '0',
  gross_paid_cents: '0',
  refunds_cents: '0',
  planned_cents: '0',
  unsupported_purchase_count: 0,
  unsupported_payment_count: 0,
  is_complete: true,
  rows: [],
};

const emptyAdjustmentPage = {
  page: 1, page_size: 100, total_count: 0, invalid_count: 0,
  is_complete: true, original_cents_total: '0',
  remaining_cents_total: '0', refund_cents_total: '0', rows: [],
};
beforeEach(() => {
  mock.rpc.mockReset();
  mock.adjustments.mockReset();
  mock.adjustments.mockResolvedValue({ data: emptyAdjustmentPage, error: null });
});

describe('auditoria automática paginada Preview #85', () => {
  it('confere o SQL e as invariantes do domínio sem alterar dados', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(true);
    expect(report.sqlStatus).toBe('matched');
    expect(report.sqlCheckedEvents).toBe(0);
    expect(report.adjustmentSqlStatus).toBe('matched');
    expect(report.adjustmentSqlChecked).toBe(0);
    expect(report.domain.checks.map((entry) => entry.passed)).toEqual([true, true, true, true]);
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_events_page_v2', {
      p_page: 1, p_page_size: 100, p_status: null,
      p_date_from: null, p_date_to: null, p_query: null,
    });
  });

  it('não aprova a paridade SQL caso haja ajustes parciais excluídos', async () => {
    mock.rpc.mockResolvedValue({ data: {
      ...emptyPage,
      is_complete: false, unsupported_purchase_count: 2,
      unsupported_payment_count: 3,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.sqlStatus).toBe('incomplete');
    expect(report.excludedPurchases).toBe(2);
    expect(report.excludedPayments).toBe(3);
    expect(report.adjustmentSqlStatus).toBe('matched');
  });

  it('bloqueia paginação com contagem de eventos inconsistente', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...emptyPage, total_count: 101 }, error: null })
      .mockResolvedValueOnce({ data: {
        ...emptyPage, page: 2, total_count: 102,
      }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.sqlStatus).toBe('failed');
    expect(report.sqlDetail).toContain('paginação');
  });

  it('bloqueia registros ausentes mesmo com totais SQL aparentemente corretos', async () => {
    mock.rpc.mockResolvedValue({ data: { ...emptyPage, total_count: 1 }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.sqlStatus).toBe('failed');
    expect(report.sqlDetail).toContain('nem todas as páginas');
  });

  it('recusa conciliação de créditos com histórico inválido', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.adjustments.mockResolvedValue({ data: {
      ...emptyAdjustmentPage,
      is_complete: false, total_count: 1, invalid_count: 1,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.adjustmentSqlStatus).toBe('incomplete');
    expect(report.adjustmentSqlDetail).toContain('1 ajuste');
  });

  it('não marca paridade de ajustes quando o SQL omite um registro', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.adjustments.mockResolvedValue({ data: {
      ...emptyAdjustmentPage, total_count: 1,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.adjustmentSqlStatus).toBe('failed');
    expect(report.adjustmentSqlDetail).toContain('todas as páginas');
  });

  it('preserva erro de permissão/conexão para diagnóstico seguro', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Sem permissão') });
    await expect(runFinancePreviewParity([], [])).rejects.toThrow('Sem permissão');
  });
});
