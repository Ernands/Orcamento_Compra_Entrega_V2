import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { buildAuditRecords } from '../domain/document-audit-records';

type Row = Record<string, unknown>;
const db = vi.hoisted<{
  tables: Record<string, Row[]>;
  requests: Array<{
    table: string;
    from: number;
    to: number;
    filters: Array<{ column: string; operation: string; values: unknown }>;
  }>;
}>(() => ({ tables: {}, requests: [] }));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const filters: Array<{ column: string; operation: string; values: unknown }> = [];
      const query = {
        select() { return query; },
        order() { return query; },
        eq(column: string, value: string) {
          filters.push({ column, operation: 'eq', values: value });
          return query;
        },
        in(column: string, values: string[]) {
          filters.push({ column, operation: 'in', values });
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ column, operation: 'is', values: value });
          return query;
        },
        range(from: number, to: number) {
          db.requests.push({ table, from, to, filters: filters.map((filter) => ({ ...filter })) });
          const rows = (db.tables[table] || []).filter((row) => filters.every((filter) => {
            if (filter.operation === 'eq') return row[filter.column] === filter.values;
            if (filter.operation === 'in')
              return (filter.values as string[]).includes(String(row[filter.column]));
            return (row[filter.column] ?? null) === filter.values;
          }));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

function purchase(id: string, code: string, approvedTotal: string): Row {
  return {
    id, codigo_negocio: code, quote_id: 'quote-' + id,
    quote_code_snapshot: 'COT-' + id, supplier_id: 'supplier',
    supplier_name_snapshot: 'Fornecedor', quote_date_snapshot: '2026-11-01',
    approved_total: approvedTotal, has_pending_shipping: false,
    payment_method_snapshot: null, entry_amount_snapshot: null,
    installment_count_snapshot: null, payment_notes_snapshot: null,
    status: 'purchased', notes: null, approved_at: '2026-11-12T10:00:00Z',
    returned_at: null, supplier_channel_id_snapshot: null,
    channel_type_snapshot: null, origin_city_snapshot: null, origin_state_snapshot: null,
    contact_snapshot: null, quote_context_snapshot_source: null,
  };
}
function membership(id: string, purchaseId: string, storeId: string): Row {
  return {
    id, purchase_id: purchaseId, store_id: storeId,
    store_code_snapshot: storeId.toUpperCase(), store_name_snapshot: storeId,
    store_city_snapshot: 'Cidade', store_state_snapshot: 'RN',
    store_address_snapshot: null, store_address_snapshot_source: null,
  };
}

function setup(): void {
  db.tables = {
    supply_purchases: [
      purchase('p-shared', 'CMP-COMPARTILHADA', '200.00'),
      purchase('p-only-b', 'CMP-SOMENTE-B', '30.00'),
      purchase('p-only-a', 'CMP-SOMENTE-A', '50.00'),
    ],
    supply_purchase_stores: [
      membership('m1', 'p-shared', 'store-a'),
      membership('m2', 'p-shared', 'store-b'),
      membership('m3', 'p-only-b', 'store-b'),
      membership('m4', 'p-only-a', 'store-a'),
    ],
    supply_purchase_items: [],
    supply_purchase_destinations: [],
    supply_purchase_destination_stores: [],
    supply_purchase_orders: [{
      id: 'order-shared', purchase_id: 'p-shared',
      purchased_on: '2026-11-12', status: 'active', source: 'manual',
      supplier_order_ref: null, expected_delivery_date: null,
      created_at: '2026-11-12T10:00:00Z', created_by: null,
      created_by_name_snapshot: null, notes: null,
      cancelled_by: null, cancelled_by_name_snapshot: null,
      cancelled_at: null, cancellation_reason: null,
    }],
    supply_purchase_order_items: [{
      id: 'line-shared', order_id: 'order-shared',
      purchase_item_id: null, purchase_destination_id: null,
      item_code_snapshot: 'ITM-1', item_name_snapshot: 'Mesa',
      destination_label_snapshot: 'Duas lojas', destination_state_snapshot: 'RN',
      quantity: '2', unit: 'un', unit_price: '100.00',
      discount_amount: '0', shipping_type: 'free', actual_shipping_type: 'free',
      shipping_amount: '0', other_costs: '0', line_total: '200.00',
      store_distribution_status: 'confirmed', expected_delivery_date: null, notes: null,
    }],
    supply_purchase_order_line_stores: ['store-a', 'store-b'].map((storeId, index) => ({
      id: 'line-store-' + index, order_line_id: 'line-shared',
      purchase_destination_store_id: null, store_id: storeId,
      store_code_snapshot: storeId, store_name_snapshot: storeId,
      store_city_snapshot: 'Cidade', store_state_snapshot: 'RN',
      quantity: '1', allocation_source: 'manual',
    })),
    supply_purchase_payments: [{
      id: 'payment-shared', purchase_id: 'p-shared', purchase_order_id: 'order-shared',
      payment_method: 'pix', source_label: null, amount: '200.00', entry_amount: null,
      installment_count: null, first_due_date: null, status: 'paid',
      paid_at: '2026-11-12T11:00:00Z', notes: null, created_at: '2026-11-12T10:00:00Z',
      forwarded_to_finance_at: null, forwarded_to_finance_by: null,
      cancelled_by: null, cancelled_at: null, cancellation_reason: null,
    }],
    supply_purchase_attachments: [{
      id: 'att-shared', purchase_id: 'p-shared', purchase_order_id: 'order-shared',
      payment_id: null, original_name: 'nota.pdf',
      storage_path: 'compras/p-shared/nota.pdf', mime_type: 'application/pdf',
      size_bytes: 100, description: null, document_type: 'invoice',
      document_number: '1', document_date: '2026-11-12',
      document_amount: '200.00', created_at: '2026-11-12T12:00:00Z', deleted_at: null,
    }, {
      id: 'att-deleted', purchase_id: 'p-shared',
      storage_path: 'compras/p-shared/excluido.pdf',
      deleted_at: '2026-11-12T13:00:00Z',
    }],
    supply_purchase_attachment_stores: ['store-a', 'store-b'].map((storeId,index) => ({
      id: 'att-store-' + index, attachment_id: 'att-shared', store_id: storeId,
      store_code_snapshot: storeId, store_name_snapshot: storeId,
      store_city_snapshot: 'Cidade', store_state_snapshot: 'RN',
    })),
    supply_purchase_partial_adjustments: [],
  };
  db.requests = [];
}
afterEach(() => { db.tables = {}; db.requests = []; });

describe('Consulta de auditoria limitada à loja sem cortar a CMP compartilhada', () => {
  it('busca vínculos de anexos apenas para documentos ativos e conserva lojas de CMP compartilhada', async () => {
    setup();
    db.tables.supply_purchase_attachment_stores.push({
      id: 'att-store-deleted', attachment_id: 'att-deleted',
      store_id: 'store-a', store_code_snapshot: 'store-a',
      store_name_snapshot: 'store-a', store_city_snapshot: 'Cidade',
      store_state_snapshot: 'RN',
    });
    const purchases = await listSupplyPurchasesV2();
    const shared = purchases.find((row) => row.id === 'p-shared');
    expect(shared).toBeDefined();
    expect(shared!.attachments.map((attachment) => attachment.id)).toEqual(['att-shared']);
    expect(shared!.attachments[0].stores.map((store) => store.storeId).sort())
      .toEqual(['store-a', 'store-b']);

    const linkRequests = db.requests.filter((request) =>
      request.table === 'supply_purchase_attachment_stores');
    expect(linkRequests.length).toBeGreaterThan(0);
    expect(linkRequests.every((request) => request.filters.some((filter) =>
      filter.operation === 'in' && filter.column === 'attachment_id' &&
      (filter.values as string[]).length === 1 &&
      (filter.values as string[])[0] === 'att-shared'))).toBe(true);
  });

  it('filtra os IDs de CMP no banco e conserva todas as lojas, rateios e notas das CMPs escolhidas', async () => {
    setup();
    const selected = await listSupplyPurchasesV2({ allRows: true, storeId: 'store-a' });
    expect(selected.map((row) => row.code).sort()).toEqual([
      'CMP-COMPARTILHADA', 'CMP-SOMENTE-A',
    ]);
    expect(selected.some((row) => row.code === 'CMP-SOMENTE-B')).toBe(false);
    const shared = selected.find((row) => row.id === 'p-shared')!;
    expect(shared.stores.map((store) => store.storeId).sort()).toEqual(['store-a', 'store-b']);
    expect(shared.orders[0].lines[0].stores.map((store) => store.storeId).sort())
      .toEqual(['store-a', 'store-b']);
    expect(shared.payments.map((payment) => payment.amount)).toEqual(['200.00']);
    expect(shared.attachments.map((doc) => doc.id)).toEqual(['att-shared']);
    expect(shared.attachments[0].stores.map((store) => store.storeId).sort())
      .toEqual(['store-a', 'store-b']);
    const sharedRecord = buildAuditRecords('store-a', selected, [])
      .find((record) => record.reference === 'CMP-COMPARTILHADA')!;
    expect(sharedRecord.totalCents).toBe(20000n);
    expect(sharedRecord.storeCents).toBe(10000n);
    expect(db.requests.some((call) =>
      call.table === 'supply_purchase_stores' &&
      call.filters.some((filter) => filter.operation === 'eq' &&
        filter.column === 'store_id' && filter.values === 'store-a'),
    )).toBe(true);
    expect(db.requests.some((call) =>
      call.table === 'supply_purchase_payments' &&
      call.filters.some((filter) => filter.operation === 'in' &&
        filter.column === 'purchase_id' &&
        !(filter.values as string[]).includes('p-only-b')),
    )).toBe(true);
    expect(db.requests.some((call) => call.table === 'supply_quote_attachments')).toBe(false);
  });

  it('não dispara consultas globais quando a loja não tem CMPs', async () => {
    setup();
    const result = await listSupplyPurchasesV2({ allRows: true, storeId: 'store-c' });
    expect(result).toEqual([]);
    expect(db.requests.map((call) => call.table)).toEqual(['supply_purchase_stores']);
  });

  it('não ignora silenciosamente o filtro quando falta o modo de auditoria', async () => {
    setup();
    await expect(listSupplyPurchasesV2({ storeId: 'store-a' })).rejects.toThrow('consulta completa');
    expect(db.requests).toEqual([]);
  });
});
