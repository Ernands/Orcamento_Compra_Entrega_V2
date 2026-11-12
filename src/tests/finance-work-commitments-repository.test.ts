import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUnifiedFinancePayments, financePaymentTotals } from '../domain/finance-payments';
import type { WorkService, WorkServicePayment } from '../domain/works-types';
import { listFinanceWorkCommitmentsPage } from '../data/finance/finance-work-commitments-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

function workPayment(id: string, status: WorkServicePayment['status'], amount: string): WorkServicePayment {
  return {
    id,
    serviceId: 'work-1',
    storeId: 'store-1',
    label: id === 'paid-1' ? 'Entrada' : 'Parcela 2',
    paymentMethod: 'bank_transfer',
    sourceLabel: id === 'paid-1' ? 'CONTA BB' : '',
    dueDate: id === 'paid-1' ? '2026-09-10' : '2026-10-10',
    amount,
    status,
    paidAt: id === 'paid-1' ? '2026-09-09T12:00:00Z' : null,
    forwardedToFinanceAt: id === 'planned-1' ? '2026-09-01T12:00:00Z' : null,
    notes: 'Pagamento teste',
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
  };
}
function sampleWork(): WorkService {
  return {
    id: 'work-1', code: 'OBR-TESTE', storeId: 'store-1',
    storeCode: 'LOJ-001', storeName: 'LOJA', storeCity: 'Cidade', storeState: 'RN',
    category: 'Elétrica', description: 'Instalação', providerName: 'Prestador',
    providerTaxId: null, providerPhone: null,
    budgetAmount: '100.01', contractedAmount: '100.01',
    status: 'contracted', progressPercent: 0,
    plannedStartDate: null, plannedEndDate: null, notes: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    payments: [
      workPayment('paid-1', 'paid', '40.00'),
      workPayment('planned-1', 'planned', '30.00'),
      workPayment('cancelled-1', 'cancelled', '4.00'),
    ], documents: [], components: [],
  };
}
describe('paridade da projeção financeira paginada de Obras', () => {
  it('reproduz as linhas e o saldo sem programação do domínio com precisão de centavos', async () => {
    mock.rpc.mockResolvedValue({
      data: {
        page: 1, page_size: 50, total_count: 3,
        paid_cents: '4000', planned_cents: '3000',
        unscheduled_cents: '3001', commitment_cents: '10001',
        rows: [
          {
            id: 'work:paid-1', payment_id: 'paid-1', work_id: 'work-1',
            reference_code: 'OBR-TESTE', counterpart: 'Prestador',
            description: 'Elétrica · Instalação',
            store_id: 'store-1', store_code: 'LOJ-001', state: 'RN',
            status: 'paid', event_date: '2026-09-09', amount_cents: '4000',
            payment_method: 'bank_transfer', source_label: 'CONTA BB',
            installment_label: 'Entrada', forwarded_to_finance: null, notes: 'Pagamento teste',
          },
          {
            id: 'work:planned-1', payment_id: 'planned-1', work_id: 'work-1',
            reference_code: 'OBR-TESTE', counterpart: 'Prestador',
            description: 'Elétrica · Instalação',
            store_id: 'store-1', store_code: 'LOJ-001', state: 'RN',
            status: 'planned', event_date: '2026-10-10', amount_cents: '3000',
            payment_method: 'bank_transfer', source_label: 'Parcela 2',
            installment_label: 'Parcela 2', forwarded_to_finance: true, notes: 'Pagamento teste',
          },
          {
            id: 'work-unscheduled:work-1', payment_id: null, work_id: 'work-1',
            reference_code: 'OBR-TESTE', counterpart: 'Prestador',
            description: 'Elétrica · Instalação',
            store_id: 'store-1', store_code: 'LOJ-001', state: 'RN',
            status: 'unscheduled', event_date: null, amount_cents: '3001',
            payment_method: null, source_label: null,
            installment_label: 'Saldo sem programação',
            forwarded_to_finance: null,
            notes: 'Saldo contratado ainda sem pagamento programado.',
          },
        ],
      }, error: null,
    });

    const actual = await listFinanceWorkCommitmentsPage();
    const domainRows = buildUnifiedFinancePayments([], [sampleWork()]);
    const domainTotals = financePaymentTotals(domainRows);
    expect({
      paidCents: actual.paidCents, plannedCents: actual.plannedCents,
      unscheduledCents: actual.unscheduledCents, commitmentCents: actual.commitmentCents,
    }).toEqual(domainTotals);
    expect(actual.totalCount).toBe(domainRows.length);
    for (const row of actual.rows) {
      const expected = domainRows.find((entry) => entry.id === row.id);
      expect(expected).toBeDefined();
      expect(row.status).toBe(expected?.status);
      expect(row.date).toBe(expected?.date);
      expect(row.amountCents).toBe(expected?.amountCents);
      expect(row.sourceLabel).toBe(expected?.sourceLabel);
      expect(row.installmentLabel).toBe(expected?.installmentLabel);
      expect(row.forwardedToFinance).toBe(expected?.forwardedToFinance);
      expect(row.storeId).toBe(expected?.storeIds[0]);
      expect(row.state).toBe(expected?.states[0]);
      expect(row.amountCents).toBe(
        expected?.storeAllocations.reduce((sum, store) => sum + store.amountCents, 0n),
      );
    }
  });

  it('encaminha escopo de lojas, status, datas e paginação sem substituir totais oficiais', async () => {
    mock.rpc.mockResolvedValue({ data: {
      page: 2, page_size: 10, total_count: 0,
      paid_cents: '0', planned_cents: '0', unscheduled_cents: '0',
      commitment_cents: '0', rows: [],
    }, error: null });
    const result = await listFinanceWorkCommitmentsPage({
      page: 2, pageSize: 10, status: 'paid', storeIds: ['store-1'],
      dateFrom: '2026-10-01', dateTo: '2026-10-31', query: 'OBR-',
    });
    expect(mock.rpc).toHaveBeenCalledWith('finance_work_commitments_page_v1', {
      p_page: 2, p_page_size: 10, p_status: 'paid', p_store_ids: ['store-1'],
      p_date_from: '2026-10-01', p_date_to: '2026-10-31', p_query: 'OBR-',
    });
    expect(result.totalCount).toBe(0);
  });

  it('preserva filtro de zero lojas, sem transformar em todas as lojas', async () => {
    mock.rpc.mockResolvedValue({ data: {
      page: 1, page_size: 50, total_count: 0,
      paid_cents: '0', planned_cents: '0', unscheduled_cents: '0',
      commitment_cents: '0', rows: [],
    }, error: null });
    await listFinanceWorkCommitmentsPage({ storeIds: [] });
    const rpcArguments = mock.rpc.mock.calls[0][1] as { p_store_ids: string[] };
    expect(rpcArguments.p_store_ids).toEqual([]);
  });

  it('falha fechado em divergência de valores financeiros', async () => {
    mock.rpc.mockResolvedValue({ data: {
      page: 1, page_size: 50, total_count: 1,
      paid_cents: '100', planned_cents: '0', unscheduled_cents: '0',
      commitment_cents: '99', rows: [],
    }, error: null });
    await expect(listFinanceWorkCommitmentsPage()).rejects.toThrow('Totais de Obras inconsistentes');
  });

  it('rejeita resposta inválida e preserva erros de permissão', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { page: 1 }, error: null });
    await expect(listFinanceWorkCommitmentsPage()).rejects.toThrow('contrato de dados inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Sem permissao') });
    await expect(listFinanceWorkCommitmentsPage()).rejects.toThrow('Sem permissao');
  });
});
