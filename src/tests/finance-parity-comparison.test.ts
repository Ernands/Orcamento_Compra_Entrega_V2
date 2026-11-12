import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFinancePreviewParity } from '../data/finance/finance-parity-comparison';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

const emptyPage = {
  page: 1,
  page_size: 100,
  total_count: 0,
  paid_cents: '0',
  planned_cents: '0',
  unsupported_purchase_count: 0,
  unsupported_payment_count: 0,
  is_complete: true,
  rows: [],
};

describe('auditoria automática paginada Preview #85', () => {
  it('confere o SQL e as invariantes do domínio sem alterar dados', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(true);
    expect(report.sqlStatus).toBe('matched');
    expect(report.sqlCheckedEvents).toBe(0);
    expect(report.domain.checks.map((entry) => entry.passed)).toEqual([true, true, true, true]);
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_events_page_v1', {
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

  it('preserva erro de permissão/conexão para diagnóstico seguro', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Sem permissão') });
    await expect(runFinancePreviewParity([], [])).rejects.toThrow('Sem permissão');
  });
});
