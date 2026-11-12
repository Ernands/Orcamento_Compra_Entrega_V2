import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePaymentSourcesPage } from '../data/finance/finance-payment-sources-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));

beforeEach(() => mock.rpc.mockReset());

describe('finance payment source read model', () => {
  it('preserva os centavos exatos, pagina e filtra sem ser usado como total oficial', async () => {
    mock.rpc.mockResolvedValue({
      data: {
        page: 2,
        page_size: 25,
        total_count: 52,
        raw_total_cents: '12345678901234',
        raw_paid_cents: '12345678900000',
        raw_planned_cents: '1234',
        rows: [{
          source: 'purchase',
          payment_id: 'pay-123',
          source_id: 'cmp-001',
          reference_code: 'CMP-00097',
          counterpart: 'Fornecedor',
          status: 'paid',
          event_date: '2026-11-12',
          gross_amount_cents: '340858',
          store_id: null,
        }],
      },
      error: null,
    });

    const result = await listFinancePaymentSourcesPage({
      page: 2, pageSize: 25, status: 'paid',
      source: 'purchase', dateFrom: '2026-11-01', query: 'CMP-00097',
    });
    expect(mock.rpc).toHaveBeenCalledWith('finance_payment_sources_page_v1', {
      p_page: 2,
      p_page_size: 25,
      p_status: 'paid',
      p_source: 'purchase',
      p_date_from: '2026-11-01',
      p_date_to: null,
      p_query: 'CMP-00097',
    });
    expect(result).toMatchObject({ page: 2, pageSize: 25, totalCount: 52 });
    expect(result.rawTotalCents).toBe(12345678901234n);
    expect(result.rawPaidCents).toBe(12345678900000n);
    expect(result.rawPlannedCents).toBe(1234n);
    expect(result.rows[0].grossAmountCents).toBe(340858n);
  });

  it('rejeita uma resposta sem lista de registros', async () => {
    mock.rpc.mockResolvedValue({ data: { page: 1 }, error: null });
    await expect(listFinancePaymentSourcesPage()).rejects.toThrow('contrato de dados inválido');
  });

  it('propaga erro de RLS ou conexão sem ocultá-lo', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Sem permissao') });
    await expect(listFinancePaymentSourcesPage()).rejects.toThrow('Sem permissao');
  });
});
