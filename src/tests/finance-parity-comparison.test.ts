import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFinancePreviewParity } from '../data/finance/finance-parity-comparison';

const mock = vi.hoisted(() => ({
  rpc: vi.fn(), adjustments: vi.fn(), unscheduled: vi.fn(), storeCosts: vi.fn(),
}));
vi.mock('../data/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) =>
      name === 'finance_purchase_adjustment_reconciliation_v1'
        ? mock.adjustments(name, args)
        : name === 'finance_purchase_unscheduled_page_v1'
          ? mock.unscheduled(name, args)
          : name === 'finance_purchase_store_costs_page_v1'
            ? mock.storeCosts(name, args)
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
const emptyUnscheduledPage = {
  page: 1, page_size: 100, total_count: 0, is_complete: true,
  unsupported_purchase_count: 0, unscheduled_cents: '0', rows: [],
};
const emptyStoreCostPage = {
  page: 1, page_size: 100, total_count: 0,
  total_contracted_cents: '0', total_allocated_cents: '0',
  unsupported_purchase_count: 0, is_complete: true, rows: [],
};
beforeEach(() => {
  mock.rpc.mockReset();
  mock.adjustments.mockReset();
  mock.unscheduled.mockReset();
  mock.storeCosts.mockReset();
  mock.storeCosts.mockResolvedValue({ data: emptyStoreCostPage, error: null });
  mock.unscheduled.mockResolvedValue({ data: emptyUnscheduledPage, error: null });
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
    expect(report.unscheduledSqlStatus).toBe('matched');
    expect(report.unscheduledSqlChecked).toBe(0);
    expect(report.storeCostSqlStatus).toBe('matched');
    expect(report.storeCostSqlChecked).toBe(0);
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

  it('não aprova saldo SQL quando uma compra foi excluída do cálculo', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.unscheduled.mockResolvedValue({ data: {
      ...emptyUnscheduledPage, unsupported_purchase_count: 1, is_complete: false,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.unscheduledSqlStatus).toBe('incomplete');
    expect(report.unscheduledSqlExcludedPurchases).toBe(1);
  });

  it('bloqueia divergência na contagem de saldos sem programação', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.unscheduled.mockResolvedValue({ data: {
      ...emptyUnscheduledPage, total_count: 1,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.unscheduledSqlStatus).toBe('failed');
    expect(report.unscheduledSqlDetail).toContain('páginas');
  });

  it('recusa rateio por loja com custo desconhecido ou compra ajustada', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.storeCosts.mockResolvedValue({ data: {
      ...emptyStoreCostPage, unsupported_purchase_count: 1, is_complete: false,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.storeCostSqlStatus).toBe('incomplete');
    expect(report.storeCostSqlExcludedPurchases).toBe(1);
  });

  it('não aprova rateio SQL que omite pedidos ou repete páginas', async () => {
    mock.rpc.mockResolvedValue({ data: emptyPage, error: null });
    mock.storeCosts.mockResolvedValue({ data: {
      ...emptyStoreCostPage, total_count: 1,
    }, error: null });
    const report = await runFinancePreviewParity([], []);
    expect(report.passed).toBe(false);
    expect(report.storeCostSqlStatus).toBe('failed');
    expect(report.storeCostSqlDetail).toContain('páginas');
  });

  it('preserva erro de permissão/conexão para diagnóstico seguro', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Sem permissão') });
    await expect(runFinancePreviewParity([], [])).rejects.toThrow('Sem permissão');
  });
});
