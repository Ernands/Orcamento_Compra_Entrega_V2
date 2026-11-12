import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { purchaseOrderFinancialSummary, purchaseOrderStoreCosts } from '../domain/purchase-v2-calculations';
import { PurchasePartialAdjustmentPanel } from '../components/purchase-partial-adjustment-panel';
import { buildUnifiedFinancePayments } from '../domain/finance-payments';
import { buildStoreReimbursement } from '../domain/finance-reimbursement';

// Reproduces the Supabase/PostgREST 1000-row response limit in the regular
// Compras V2 screen, not just in the finance-only allRows mode.
const testDatabase = vi.hoisted<{
  tables: Record<string, Record<string, unknown>[]>;
  reads: Array<{ table: string; from: number; to: number }>;
  omittedFromPages: string[];
  recovered: Array<{ table: string; column: string; values: string[] }>;
}>(() => ({
  tables: {},
  reads: [],
  omittedFromPages: [],
  recovered: [],
}));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const query = {
        select() { return query; },
        order() { return query; },
        is() { return query; },
        in(column: string, values: string[]) {
          testDatabase.recovered.push({ table, column, values });
          return Promise.resolve({
            data: (testDatabase.tables[table] || []).filter((row) =>
              values.includes(String(row[column]))),
            error: null,
          });
        },
        range(from: number, to: number) {
          testDatabase.reads.push({ table, from, to });
          const data = (testDatabase.tables[table] || []).slice(from, to + 1);
          return Promise.resolve({
            data: table === 'supply_purchase_order_items'
              ? data.filter((row) => !testDatabase.omittedFromPages.includes(String(row.id)))
              : data,
            error: null,
          });
        },
      };
      return query;
    },
  },
}));

afterEach(() => {
  cleanup();
  testDatabase.tables = {};
  testDatabase.reads = [];
  testDatabase.omittedFromPages = [];
  testDatabase.recovered = [];
});

describe('Compras V2 — leitura completa de pedidos após 1000 linhas', () => {
  it('recupera as 8 linhas finais da CMP-00097 e exibe Ajustar compra com o pagamento conciliado', async () => {
    const purchaseId = 'purchase-97';
    const orderId = 'order-97';
    const storeId = 'baependi-mg';
    const totals = [32924, 24665, 44804, 32924, 39077, 39077, 32924, 94463];
    const money = (amount: number) => (amount / 100).toFixed(2);

    const items = totals.map((amount, index) => ({
      id: `item-${index}`,
      purchase_id: purchaseId,
      supply_item_id: `catalog-item-${index}`,
      item_code_snapshot: `ITM-${index + 1}`,
      item_name_snapshot: `Item ${index + 1}`,
      store_id: storeId,
      store_code_snapshot: 'LOJ-008',
      quantity_approved: '1',
      purchased_quantity: '1',
      unit: 'un',
      quoted_unit_price: money(amount),
      quoted_discount_amount: '0',
      quoted_shipping_type: 'free',
      quoted_shipping_amount: '0',
      quoted_other_costs: '0',
      approved_line_total: money(amount),
      actual_total: money(amount),
    }));

    const olderRows = Array.from({ length: 1015 }, (_, index) => ({
      id: `older-${String(index).padStart(4, '0')}`,
      order_id: 'some-earlier-order',
      created_at: '2026-10-01T00:00:00Z',
    }));
    const orderLines = totals.map((amount, index) => ({
      id: `line-${index}`,
      order_id: orderId,
      purchase_item_id: `item-${index}`,
      purchase_destination_id: null,
      item_code_snapshot: `ITM-${index + 1}`,
      item_name_snapshot: `Item ${index + 1}`,
      destination_label_snapshot: 'LOJ-008 Baependi/MG',
      destination_state_snapshot: 'MG',
      quantity: '1',
      unit: 'un',
      unit_price: money(amount),
      discount_amount: '0',
      shipping_type: 'free',
      actual_shipping_type: 'free',
      shipping_amount: '0',
      other_costs: '0',
      line_total: money(amount),
      expected_delivery_date: null,
      notes: null,
      store_distribution_status: 'confirmed',
      created_at: '2026-11-10T20:16:59Z',
    }));

    testDatabase.tables = {
      supply_purchases: [{
        id: purchaseId,
        codigo_negocio: 'CMP-00097',
        quote_id: 'quote-241',
        quote_code_snapshot: 'COT-00241',
        supplier_id: 'mercado-livre',
        supplier_name_snapshot: 'Mercado Livre',
        quote_date_snapshot: '2026-09-30',
        approved_total: '3408.58',
        has_pending_shipping: false,
        status: 'purchased',
        approved_at: '2026-11-10T20:00:16Z',
        returned_at: null,
      }],
      supply_purchase_stores: [{
        id: 'purchase-store-baependi',
        purchase_id: purchaseId,
        store_id: storeId,
        store_code_snapshot: 'LOJ-008',
        store_name_snapshot: 'BAEPENDI - MG',
        store_city_snapshot: 'BAEPENDI',
        store_state_snapshot: 'MG',
      }],
      supply_purchase_items: items,
      supply_items: [],
      supply_purchase_destinations: [],
      supply_purchase_destination_stores: [],
      supply_purchase_orders: [{
        id: orderId,
        purchase_id: purchaseId,
        purchased_on: '2026-11-10',
        status: 'active',
        source: 'manual',
        created_at: '2026-11-10T20:16:59Z',
      }],
      supply_purchase_order_items: [...olderRows, ...orderLines],
      supply_purchase_order_line_stores: orderLines.map((line, index) => ({
        id: `line-store-${index}`,
        order_line_id: line.id,
        purchase_destination_store_id: null,
        store_id: storeId,
        store_code_snapshot: 'LOJ-008',
        store_name_snapshot: 'BAEPENDI - MG',
        store_city_snapshot: 'BAEPENDI',
        store_state_snapshot: 'MG',
        quantity: '1',
        allocation_source: 'direct',
      })),
      supply_purchase_payments: [{
        id: 'payment-97',
        purchase_id: purchaseId,
        purchase_order_id: orderId,
        payment_method: 'pix',
        amount: '3408.58',
        entry_amount: '0',
        status: 'paid',
        paid_at: '2026-11-10T20:16:58Z',
        created_at: '2026-11-10T20:16:59Z',
      }],
      supply_purchase_attachments: [],
      supply_purchase_attachment_stores: [],
      supply_quote_attachments: [],
      supply_purchase_partial_adjustments: [],
    };

    const purchases = await listSupplyPurchasesV2();
    expect(purchases).toHaveLength(1);
    const purchase = purchases[0];
    expect(purchase.code).toBe('CMP-00097');
    const order = purchase.orders.find((entry) => entry.status === 'active');
    expect(order).toBeDefined();
    if (!order) throw new Error('A CMP-00097 perdeu o pedido ativo');

    expect(order.lines).toHaveLength(8);
    expect(order.lines.reduce((sum, line) => sum + Math.round(Number(line.lineTotal) * 100), 0)).toBe(340858);
    expect(purchase.stores).toHaveLength(1);
    const stores = purchaseOrderStoreCosts(order);
    expect(stores.isConfirmed).toBe(true);
    expect(stores.rows).toHaveLength(1);
    expect(stores.rows[0].costCents).toBe(340858n);
    const financial = purchaseOrderFinancialSummary(purchase, order);
    expect(financial.totalCents).toBe(340858n);
    expect(financial.paidCents).toBe(340858n);
    expect(financial.isReconciled).toBe(true);

    expect(testDatabase.reads.filter((request) => request.table === 'supply_purchase_order_items'))
      .toEqual([
        { table: 'supply_purchase_order_items', from: 0, to: 499 },
        { table: 'supply_purchase_order_items', from: 500, to: 999 },
        { table: 'supply_purchase_order_items', from: 1000, to: 1499 },
      ]);

    render(<PurchasePartialAdjustmentPanel purchase={purchase} order={order}
      canEdit onSaved={async () => {}} onAttachRefundProof={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ajustar compra / Cancelamento parcial' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/Operações com múltiplos pagamentos exigem/)).not.toBeInTheDocument();
  });

  it('recupera linha omitida na leitura e mantém o residual retido da CMP-00097 no Reembolso', async () => {
    // Reutiliza a fixture acima na sua estrutura mínima e acrescenta o mesmo
    // lançamento financeiro real da CMP-00097, sem acessar nem alterar produção.
    const purchaseId = 'cmp-97';
    const orderId = 'order-97';
    const storeId = 'baependi-mg';
    const amounts = [32924, 24665, 44804, 32924, 39077, 39077, 32924, 94463];
    const money = (cents: number) => (cents / 100).toFixed(2);
    const allLines = amounts.map((amount, i) => ({
      id: 'line-' + i, order_id: orderId, purchase_item_id: 'item-' + i,
      item_code_snapshot: i === 1 ? 'ITM-0055' : i === 4 || i === 5 ? 'ITM-0098' : 'ITM-0099',
      item_name_snapshot: i === 1 ? 'Teclado e mouse' : 'Piso tátil',
      quantity: '1', unit: 'un', unit_price: money(amount), discount_amount: '0',
      shipping_type: 'free', actual_shipping_type: 'free', shipping_amount: '0',
      other_costs: '0', line_total: money(amount), store_distribution_status: 'confirmed',
      created_at: '2026-11-10T20:16:59Z',
    }));
    const cancelled = [
      { line_id: 'line-4', kind: 'cancelled', reduction_cents: 39077,
        original_line_cents: 39077, original_shipping_cents: 0 },
      { line_id: 'line-5', kind: 'cancelled', reduction_cents: 39077,
        original_line_cents: 39077, original_shipping_cents: 0 },
      { line_id: 'line-1', kind: 'cancelled', reduction_cents: 24665,
        original_line_cents: 24665, original_shipping_cents: 0 },
      { line_id: 'line-4', kind: 'residual_retained', reduction_cents: -11957,
        original_line_cents: 39077, original_shipping_cents: 0 },
    ];
    testDatabase.tables = {
      supply_purchases: [{
        id: purchaseId, codigo_negocio: 'CMP-00097', quote_id: 'quote-241',
        quote_code_snapshot: 'COT-00241', supplier_id: 'ml', supplier_name_snapshot: 'Mercado Livre',
        approved_total: '3408.58', status: 'purchased', has_pending_shipping: false,
        approved_at: '2026-11-10T20:00:16Z',
      }],
      supply_purchase_stores: [{
        id: 'link-97', purchase_id: purchaseId, store_id: storeId,
        store_code_snapshot: 'LOJ-008', store_name_snapshot: 'BAEPENDI - MG',
        store_city_snapshot: 'BAEPENDI', store_state_snapshot: 'MG',
      }],
      supply_purchase_items: amounts.map((amount, i) => ({
        id: 'item-' + i, purchase_id: purchaseId, supply_item_id: 'catalog-' + i,
        item_code_snapshot: allLines[i].item_code_snapshot,
        item_name_snapshot: allLines[i].item_name_snapshot,
        store_id: storeId, quantity_approved: '1', purchased_quantity: '1',
        unit: 'un', approved_line_total: money(amount), actual_total: money(amount),
      })),
      supply_items: [], supply_purchase_destinations: [], supply_purchase_destination_stores: [],
      supply_purchase_orders: [{
        id: orderId, purchase_id: purchaseId, status: 'active',
        source: 'manual', purchased_on: '2026-11-10', created_at: '2026-11-10T20:16:59Z',
      }],
      supply_purchase_order_items: allLines,
      supply_purchase_order_line_stores: allLines.map((line, i) => ({
        id: 'store-' + i, order_line_id: line.id, store_id: storeId,
        store_code_snapshot: 'LOJ-008', store_name_snapshot: 'BAEPENDI - MG',
        store_city_snapshot: 'BAEPENDI', store_state_snapshot: 'MG',
        quantity: '1', allocation_source: 'direct',
      })),
      supply_purchase_payments: [{
        id: 'paid-97', purchase_id: purchaseId, purchase_order_id: orderId,
        payment_method: 'pix', amount: '3408.58', entry_amount: '0',
        status: 'paid', paid_at: '2026-11-10T20:16:58Z',
      }],
      supply_purchase_attachments: [], supply_purchase_attachment_stores: [],
      supply_quote_attachments: [],
      supply_purchase_partial_adjustments: [{
        id: 'adjustment-97', purchase_id: purchaseId, order_id: orderId,
        payment_id: 'paid-97', refund_attachment_id: 'proof-97',
        original_cents: 340858, cancelled_cents: 102819,
        freight_reduction_cents: -11957, refund_cents: 90862,
        remaining_cents: 249996, refunded_on: '2026-10-11',
        reference: 'Reembolso parcial', reason: 'Cancelamento parcial da CMP-00097',
        created_at: '2026-11-11T16:09:34Z', line_adjustments: cancelled,
        refund_entries: [
          { line_id: 'line-4', amount_cents: 33446, refunded_on: '2026-10-11' },
          { line_id: 'line-5', amount_cents: 33446, refunded_on: '2026-10-11' },
          { line_id: 'line-1', amount_cents: 23970, refunded_on: '2026-10-11' },
        ],
      }],
    };
    // Simula uma página incompleta: a linha existe na base, mas não vem no
    // carregamento principal. A recuperação faz consulta somente dos IDs faltantes.
    testDatabase.omittedFromPages = ['line-4'];
    const purchase = (await listSupplyPurchasesV2())[0];
    const order = purchase.orders.find((entry) => entry.status === 'active');
    expect(testDatabase.recovered.some((request) =>
      request.table === 'supply_purchase_order_items' && request.values.includes('line-4'))).toBe(true);
    expect(order?.cancelledLines).toHaveLength(3);
    expect(order?.lines.find((line) => line.itemCode === 'AJ-RESIDUAL')?.lineTotal).toBe('119.57');
    expect(order?.lines.reduce((sum, line) =>
      sum + Math.round(Number(line.lineTotal || '0') * 100), 0)).toBe(249996);
    expect(purchase.payments[0].amount).toBe('2499.96');
    expect(purchase.payments[0].refundedAmount).toBe('908.62');
    const rows = buildUnifiedFinancePayments([purchase], []);
    expect(rows[0].amountCents).toBe(249996n);
    const reimbursement = buildStoreReimbursement(rows, [purchase], [], storeId);
    expect(reimbursement.totals.paidCents).toBe(249996n);
  });
});
