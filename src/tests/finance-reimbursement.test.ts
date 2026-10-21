import { describe, expect, it } from 'vitest';
import { buildStoreReimbursement, fiscalStateForPayment } from '../domain/finance-reimbursement';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { WorkService } from '../domain/works-types';

const storeA = 'store-a';
const storeB = 'store-b';
const orig = (value: bigint) => ({ equipment: value, furniture: 0n, works: 0n });
function row(id: string, status: UnifiedFinancePaymentRow['status'], value: bigint): UnifiedFinancePaymentRow {
  return {
    id, status, date: null, originAllocations: orig(value),
    referenceCodes: ['CMP-00002'], purchaseIds: ['purchase-1'], purchaseOrderIds: ['order-1'],
    paymentIds: status === 'unscheduled' ? [] : [id], workServiceId: null, supplyItemIds: [],
    supplierName: 'Fornecedor', description: 'Item', paymentMethod: null, sourceLabel: null,
    installmentLabel: id, amountCents: value * 2n,
    storeIds: [storeA, storeB], storeCodes: ['LOJ-001', 'LOJ-006'], states: ['CE'],
    storeAllocations: [
      { storeId: storeA, storeCode: 'LOJ-001', state: 'CE', amountCents: value, originAllocations: orig(value) },
      { storeId: storeB, storeCode: 'LOJ-006', state: 'CE', amountCents: value, originAllocations: orig(value) },
    ],
    unallocatedCents: 0n, notes: null,
  };
}
const purchase = (attachments: unknown[]): PurchaseV2 => ({
  id: 'purchase-1', stores: [
    { storeId: storeA, code: 'LOJ-001' },
    { storeId: storeB, code: 'LOJ-006' },
  ], attachments,
} as unknown as PurchaseV2);
const attachment = (id: string, type: string, stores: unknown[] = [{ storeId: storeA }]) => ({
  id, purchaseOrderId: 'order-1', documentType: type, originalName: id + '.pdf',
  documentNumber: id, storagePath: 'compras/' + id + '.pdf', stores,
});
describe('solicitação de reembolso por loja', () => {
  it('soma pago, programado e sem programação, limitado ao rateio da loja', () => {
    const p = purchase([attachment('nf1', 'invoice')]);
    const report = buildStoreReimbursement([
      row('p1', 'paid', 10000n), row('p2', 'planned', 20000n), row('p3', 'unscheduled', 30000n),
    ], [p], [], storeA);
    expect(report.totals.paidCents).toBe(10000n);
    expect(report.totals.plannedCents).toBe(20000n);
    expect(report.totals.unscheduledCents).toBe(30000n);
    expect(report.totals.commitmentCents).toBe(60000n);
    expect(report.lines).toHaveLength(3);
    expect(report.documents).toHaveLength(1); // same invoice reused, not copied three times
    expect(report.sumMatches).toBe(true);
  });
  it('identifica falta de nota/recibo em qualquer situação e ignora orçamento/comprovante', () => {
    const p = purchase([attachment('orc', 'quote'), attachment('proof', 'payment_proof')]);
    for (const status of ['paid', 'planned', 'unscheduled'] as const) {
      expect(fiscalStateForPayment(row(status, status, 100n), [p], [])).toBe('missing');
    }
  });
  it('aceita recibo e respeita o vínculo explícito de loja', () => {
    const p = purchase([attachment('r1', 'receipt', [{ storeId: storeA }])]);
    const payment = row('a', 'paid', 100n);
    expect(fiscalStateForPayment(payment, [p], [], storeA)).toBe('present');
    expect(fiscalStateForPayment(payment, [p], [], storeB)).toBe('missing');
  });
  it('sinaliza conferência quando nota é genérica para compra multi-loja', () => {
    const p = purchase([attachment('shared', 'invoice', [])]);
    const report = buildStoreReimbursement([row('a', 'paid', 100n)], [p], [], storeA);
    expect(report.lines[0].fiscalState).toBe('review');
    expect(report.pendingLines).toHaveLength(1);
    expect(report.documents).toHaveLength(1);
  });
  it('mostra necessidade de conferência quando o documento só atende uma das lojas', () => {
    const p = purchase([attachment('r1', 'receipt', [{ storeId: storeA }])]);
    expect(fiscalStateForPayment(row('p', 'paid', 100n), [p], [])).toBe('review');
  });
  it('não incorpora documentos de outra ordem da compra', () => {
    const p = purchase([{ ...attachment('other', 'invoice'), purchaseOrderId: 'order-2' }]);
    expect(fiscalStateForPayment(row('p1', 'paid', 100n), [p], [], storeA)).toBe('missing');
  });
  it('busca documento fiscal de obras sem exigir comprovação de pagamento para reportar existência da nota', () => {
    const works = [{ id: 'work-1', storeId: storeA, documents: [
      { id: 'rec', documentType: 'receipt', storagePath: 'obras/rec.pdf', originalName: 'rec.pdf', documentNumber: '123' },
    ] }] as unknown as WorkService[];
    const workRow = { ...row('w', 'unscheduled', 100n), workServiceId: 'work-1', purchaseIds: [] };
    expect(fiscalStateForPayment(workRow, [], works, storeA)).toBe('present');
  });
  it('mantém o valor e registra simultaneamente vínculo a conferir e falha de anexo no Excel', async () => {
    const { createStoreReimbursementWorkbook } = await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const p = purchase([attachment('shared', 'invoice', [])]);
    const report = buildStoreReimbursement([row('p1', 'paid', 12345n)], [p], [], storeA);
    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report,
      generatedAt: new Date('2026-10-20T12:00:00Z'),
      zipNames: new Map(),
      unavailable: new Set(['purchase:shared']),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('Solicitação de Reembolso');
    expect(sheet?.getCell('B1').value).toBe(123.45);
    expect(Array.from({ length: 10 }, (_, i) => sheet?.getCell(4, i + 1).value)).toEqual([
      'Loja(s)', 'Origem', 'Referência', 'Fornecedor / prestador',
      'Item / serviço', 'Valor', 'Nota/Recibo', 'N° Nota/Recibo',
      'Arquivo(s) no ZIP', 'Pendência',
    ]);
    expect(sheet?.getCell('K4').value).toBeNull();
    expect(sheet?.getCell('A5').value).toBe('LOJ-001 · Acaraú');
    expect(sheet?.getCell('F5').value).toBe(123.45);
    expect(sheet?.getCell('J5').value).toEqual(expect.stringContaining('Conferir vínculo'));
    expect(sheet?.getCell('J5').value).toEqual(expect.stringContaining('falha ao obter anexo'));
    expect(sheet?.autoFilter).toBe('A4:J4');
    const pending = workbook.getWorksheet('Pendências Documentais');
    expect(pending?.rowCount).toBe(2);
    expect(pending?.getRow(1).values).toEqual([
      undefined, 'Loja(s)', 'Referência', 'Pendência', 'Valor',
    ]);
    expect(pending?.getCell('A2').value).toBe('LOJ-001 · Acaraú');
    expect(pending?.getCell('C2').value).toEqual(expect.stringContaining('falha ao obter anexo'));
    expect(pending?.getCell('D2').value).toBe(123.45);
  });

});
