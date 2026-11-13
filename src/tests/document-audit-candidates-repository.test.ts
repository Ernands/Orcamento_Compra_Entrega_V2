import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuditDocumentCandidates } from '../data/finance/document-audit-candidates-repository';
import { auditDoc, auditRecord } from './fixtures/document-audit';

type Row = Record<string, unknown>;
const database = vi.hoisted<{
  tables: Record<string, Row[]>;
  calls: Array<{ table: string; filters: Array<{ kind: string; column: string; value: unknown }> }>;
}>(() => ({ tables: {}, calls: [] }));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const filters: Array<{ kind: string; column: string; value: unknown }> = [];
      const query = {
        select() { return query; },
        in(column: string, value: string[]) {
          filters.push({ kind: 'in', column, value });
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ kind: 'is', column, value });
          return query;
        },
        order() { return query; },
        range(from: number, to: number) {
          database.calls.push({ table, filters: filters.map((filter) => ({ ...filter })) });
          const rows = (database.tables[table] || []).filter((row) => filters.every((filter) => {
            if (filter.kind === 'in') return (filter.value as string[]).includes(String(row[filter.column]));
            return (row[filter.column] ?? null) === filter.value;
          }));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

function selected() {
  return auditRecord('purchase:p1', { ...auditDoc(), number: 'NF-123' });
}
afterEach(() => { database.tables = {}; database.calls = []; });

describe('consulta externa de indícios fiscais via RLS', () => {
  it('só consulta os números/caminhos indicados e monta referências de CMP e OBR', async () => {
    database.tables = {
      supply_purchase_attachments: [
        {
          id: 'purchase-external', purchase_id: 'p2', purchase_order_id: null,
          storage_path: 'outro.pdf', document_type: 'invoice', document_number: 'NF-123',
          deleted_at: null,
        },
        {
          id: 'purchase-deleted', purchase_id: 'p3', purchase_order_id: null,
          storage_path: 'cancelada.pdf', document_type: 'invoice', document_number: 'NF-123',
          deleted_at: '2026-11-12T01:00:00Z',
        },
      ],
      works_service_documents: [{
        id: 'work-external', service_id: 'w1',
        storage_path: 'obras/recibo.pdf', document_type: 'invoice',
        document_number: 'NF-123',
      }],
      supply_purchases: [{
        id: 'p2', codigo_negocio: 'CMP-EXTERNA', supplier_name_snapshot: 'Fornecedor',
      }],
      supply_purchase_stores: [{
        id: 'store-link', purchase_id: 'p2', store_id: 'store-b',
      }],
      supply_purchase_attachment_stores: [],
      works_services: [{
        id: 'w1', codigo_negocio: 'OBR-EXTERNA', provider_name: 'Fornecedor',
        store_id: 'store-c',
      }],
    };

    const result = await listAuditDocumentCandidates([selected()]);
    expect(result).toHaveLength(2);
    expect(result.find((row) => row.source === 'purchase')).toMatchObject({
      key: 'purchase:outro.pdf',
      link: { reference: 'CMP-EXTERNA', storeIds: ['store-b'], explicitStores: false },
    });
    expect(result.find((row) => row.source === 'work')).toMatchObject({
      key: 'work:obras/recibo.pdf',
      link: { reference: 'OBR-EXTERNA', storeIds: ['store-c'], explicitStores: true },
    });
    expect(database.calls.filter((call) =>
      call.table === 'supply_purchase_attachments',
    ).every((call) => call.filters.some((filter) =>
      filter.column === 'deleted_at' && filter.kind === 'is' && filter.value === null,
    ))).toBe(true);
    expect(database.calls.some((call) => call.filters.some((filter) =>
      filter.column === 'document_number' &&
      (filter.value as string[]).includes('NF-123'),
    ))).toBe(true);
  });

  it('não consulta banco sem número ou caminho e não inventa indícios', async () => {
    const record = auditRecord('purchase:p1', {
      ...auditDoc(), number: null, storagePath: '',
    });
    expect(await listAuditDocumentCandidates([record])).toEqual([]);
    expect(database.calls).toEqual([]);
  });

  it('não revela documentos cujo cadastro-pai está oculto por RLS', async () => {
    database.tables = {
      supply_purchase_attachments: [{
        id: 'visible-document-but-parent-hidden', purchase_id: 'p-secret',
        purchase_order_id: null, storage_path: 'secret.pdf',
        document_type: 'invoice', document_number: 'NF-123', deleted_at: null,
      }],
      supply_purchases: [], supply_purchase_stores: [],
      supply_purchase_attachment_stores: [], works_service_documents: [],
      works_services: [],
    };
    expect(await listAuditDocumentCandidates([selected()])).toEqual([]);
  });

  it('reconhece arquivo compartilhado pela rota mesmo sem número fiscal', async () => {
    database.tables = {
      supply_purchase_attachments: [{
        id: 'shared-attachment', purchase_id: 'p2',
        purchase_order_id: null, storage_path: 'doc-1.xml',
        document_type: 'receipt', document_number: null, deleted_at: null,
      }],
      supply_purchases: [{
        id: 'p2', codigo_negocio: 'CMP-OUTRA',
        supplier_name_snapshot: 'Fornecedor',
      }],
      supply_purchase_stores: [{
        id: 'parent-store', purchase_id: 'p2', store_id: 'store-b',
      }],
      supply_purchase_attachment_stores: [{
        id: 'explicit-store', attachment_id: 'shared-attachment', store_id: 'store-b',
      }],
      works_service_documents: [], works_services: [],
    };
    const results = await listAuditDocumentCandidates([selected()]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      key: 'purchase:doc-1.xml',
      link: { reference: 'CMP-OUTRA', storeIds: ['store-b'], explicitStores: true },
    });
  });
});
