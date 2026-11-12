import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listFinancePaymentStoreOriginsPage } from '../data/finance/finance-purchase-payment-store-origins-repository';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../data/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => mock.rpc.mockReset());

const event = {
  id: 'purchase:payment-1:paid', purchase_id: 'cmp-1', order_id: 'order-1',
  reference_code: 'CMP-00001', status: 'paid', event_date: '2026-11-12',
  amount_cents: '10103', allocated_cents: '10102', unallocated_cents: '1',
  stores: [
    { store_id: 'store-a', store_code: 'LOJ-A', amount_cents: '5001',
      equipment_cents: '5001', furniture_cents: '0', works_cents: '0' },
    { store_id: 'store-b', store_code: 'LOJ-B', amount_cents: '5101',
      equipment_cents: '0', furniture_cents: '5101', works_cents: '0' },
  ],
};
const page = {
  page: 1, page_size: 100, total_count: 1,
  unsupported_purchase_count: 0, unsupported_payment_count: 0,
  is_complete: true,
  page_amount_cents: '10103', page_allocated_cents: '10102',
  rows: [event],
};

describe('pagamentos por loja e origem em SQL, somente auditoria', () => {
  it('conserva valores distribuídos, não distribuídos e centavos por origem', async () => {
    mock.rpc.mockResolvedValue({ data: page, error: null });
    const result = await listFinancePaymentStoreOriginsPage({ page: 1, pageSize: 100 });
    expect(mock.rpc).toHaveBeenCalledWith('finance_purchase_payment_store_origins_page_v1', {
      p_page: 1, p_page_size: 100,
    });
    expect(result.rows[0].amountCents).toBe(10103n);
    expect(result.rows[0].allocatedCents).toBe(10102n);
    expect(result.rows[0].unallocatedCents).toBe(1n);
    expect(result.rows[0].stores[0].equipmentCents).toBe(5001n);
    expect(result.rows[0].stores[1].furnitureCents).toBe(5101n);
  });

  it('bloqueia valor ou classificação de loja alterados em um centavo', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...page,
      rows: [{ ...event, stores: [
        { ...event.stores[0], equipment_cents: '5000' }, event.stores[1],
      ] }],
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Centavos ou lojas inconsistentes');
    mock.rpc.mockResolvedValueOnce({ data: { ...page,
      rows: [{ ...event, unallocated_cents: '0' }],
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Centavos ou lojas inconsistentes');
  });

  it('não aprova lojas duplicadas ou zero centavos na distribuição', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...page,
      rows: [{ ...event, stores: [
        event.stores[0], { ...event.stores[0], amount_cents: '5101' },
      ] }],
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Centavos ou lojas inconsistentes');
    mock.rpc.mockResolvedValueOnce({ data: { ...page,
      rows: [{ ...event, stores: [
        { ...event.stores[0], amount_cents: '0' }, event.stores[1],
      ] }],
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Centavos ou lojas inconsistentes');
  });

  it('recusa cobertura incompleta e duplicação de eventos', async () => {
    mock.rpc.mockResolvedValue({ data: { ...page,
      is_complete: false, unsupported_purchase_count: 1,
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('incompleto');
    const diagnostic = await listFinancePaymentStoreOriginsPage({ allowIncomplete: true });
    expect(diagnostic.isComplete).toBe(false);
    mock.rpc.mockResolvedValue({ data: { ...page,
      total_count: 2, rows: [event,event],
      page_amount_cents: '20206', page_allocated_cents: '20204',
    }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('duplicou eventos');
  });

  it('propaga erros de conexão e nega contratos inválidos', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...page, rows: null }, error: null });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Contrato inválido');
    mock.rpc.mockResolvedValueOnce({ data: null, error: new Error('Sem permissão') });
    await expect(listFinancePaymentStoreOriginsPage()).rejects.toThrow('Sem permissão');
  });
});
