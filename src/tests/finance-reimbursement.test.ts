import { describe, expect, it } from 'vitest';
import { buildStoreReimbursement, fiscalStateForPayment, reimbursementEligibleStoreIds } from '../domain/finance-reimbursement';
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
  it('disponibiliza todas as lojas com valores atribuídos, não apenas as três do piloto', () => {
    const first = row('p1', 'paid', 10000n);
    const onlyStoreA = {
      ...row('p2', 'planned', 20000n),
      storeAllocations: [first.storeAllocations[0]],
      unallocatedCents: 20000n,
    };
    const storeC = 'store-c';
    const third = {
      ...row('p3', 'unscheduled', 30000n),
      storeIds: [storeC], storeCodes: ['LOJ-027'],
      storeAllocations: [{
        storeId: storeC, storeCode: 'LOJ-027', state: 'MG',
        amountCents: 30000n, originAllocations: orig(30000n),
      }],
    };
    expect([...reimbursementEligibleStoreIds([first, onlyStoreA, third])].sort()).toEqual([
      storeA, storeB, storeC,
    ]);
    expect([...reimbursementEligibleStoreIds([onlyStoreA])]).toEqual([storeA]);
    expect([...reimbursementEligibleStoreIds([{ ...onlyStoreA, storeAllocations: [] }])]).toEqual([]);
  });
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
    expect(report.paymentProofs).toHaveLength(0);
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
  it('nomeia notas e recibos no ZIP a partir de tipo, fornecedor e referência, sem sobrescrever homônimos', async () => {
    const { planReimbursementZipFileNames, createStoreReimbursementWorkbook } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const p = purchase([
      { ...attachment('nf1', 'invoice'), originalName: 'nota original.PDF' },
      { ...attachment('nf2', 'invoice'), originalName: 'outra nota.pdf' },
      { ...attachment('nf3', 'invoice'), originalName: 'imagem.png' },
      { ...attachment('rec1', 'receipt'), originalName: 'recibo.JPG' },
    ]);
    const first = {
      ...row('p1', 'paid', 100n),
      supplierName: 'Miranda',
      referenceCodes: ['CMP-00002', 'CMP-00003'],
    };
    const second = { ...first, id: 'p2', status: 'planned' as const };
    const report = buildStoreReimbursement([first, second], [p], [], storeA);
    const names = planReimbursementZipFileNames(report);

    expect(report.documents).toHaveLength(4);
    expect(names.size).toBe(4);
    expect(names.get('purchase:nf1')).toBe('Notas_e_Recibos/Nota_Miranda_CMP-00002 + CMP-00003.pdf');
    expect(names.get('purchase:nf2')).toBe('Notas_e_Recibos/Nota_Miranda_CMP-00002 + CMP-00003_1.pdf');
    expect(names.get('purchase:nf3')).toBe('Notas_e_Recibos/Nota_Miranda_CMP-00002 + CMP-00003.png');
    expect(names.get('purchase:rec1')).toBe('Notas_e_Recibos/Recibo_Miranda_CMP-00002 + CMP-00003.jpg');

    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report,
      generatedAt: new Date('2026-10-21T12:00:00Z'),
      zipNames: names,
      unavailable: new Set(),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('Solicitação de Reembolso');
    const paths = [...names.values()].join('; ');
    expect(sheet?.getCell('H5').value).toEqual({
      text: paths,
      hyperlink: "#'Arquivos do ZIP'!A2",
    });
    expect(sheet?.getCell('A6').value).toBe('TOTAL SOLICITADO');
    expect(sheet?.getCell('F5').value).toBe(2);
    expect(sheet?.getCell('F6').value).toBe(2);
    expect(workbook.getWorksheet('Resumo')?.getCell('B8').value).toBe(2);
    expect(workbook.getWorksheet('Resumo')?.getCell('B9').value).toBe(1);
    const index = workbook.getWorksheet('Arquivos do ZIP');
    expect(index?.rowCount).toBe(5);
    expect(index?.getCell('A2').value).toEqual({
      text: 'Notas_e_Recibos/Nota_Miranda_CMP-00002 + CMP-00003.pdf',
      hyperlink: 'Notas_e_Recibos/Nota_Miranda_CMP-00002 + CMP-00003.pdf',
    });
    expect(index?.views[0]?.showGridLines).toBe(false);
    const { createReimbursementOfflineIndex } =
      await import('../data/exports/finance-reimbursement-export');
    const offline = createReimbursementOfflineIndex(report, names);
    expect(offline).toContain('href="Notas_e_Recibos/Nota_Miranda_CMP-00002%20%2B%20CMP-00003.pdf"');
    expect(offline).toContain('Nota_Miranda_CMP-00002 + CMP-00003_1.pdf');
    expect(offline).not.toContain('supabase.co');
  });

  it('faz link direto para um anexo disponível e registra índice offline sem documento ausente', async () => {
    const { createStoreReimbursementWorkbook, createReimbursementOfflineIndex, planReimbursementZipFileNames } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const p = purchase([attachment('nf1', 'invoice'), attachment('nf2', 'receipt')]);
    const report = buildStoreReimbursement([row('p1', 'paid', 100n)], [p], [], storeA);
    const planned = planReimbursementZipFileNames(report);
    const available = new Map([['purchase:nf1', planned.get('purchase:nf1')!]]);
    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report,
      generatedAt: new Date('2026-10-21T12:00:00Z'),
      zipNames: available,
      unavailable: new Set(['purchase:nf2']),
    });
    const book = new Workbook();
    await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
    const path = available.get('purchase:nf1')!;
    expect(book.getWorksheet('Solicitação de Reembolso')?.getCell('H5').value).toEqual({
      text: path, hyperlink: path,
    });
    expect(book.getWorksheet('Arquivos do ZIP')?.rowCount).toBe(2);
    const index = createReimbursementOfflineIndex(report, available);
    expect(index).toContain('Nota_Fornecedor_CMP-00002.pdf');
    expect(index).not.toContain('Recibo_Fornecedor_CMP-00002.pdf');
  });

  it('higieniza nomes de fornecedor e preserva extensão quando usa recibo de obra', async () => {
    const { planReimbursementZipFileNames } =
      await import('../data/exports/finance-reimbursement-export');
    const works = [{
      id: 'work-1', storeId: storeA, documents: [{
        id: 'rec-work', documentType: 'receipt', storagePath: 'obras/arquivo.jpg',
        originalName: 'recibo-sem-extensao', documentNumber: '123',
      }],
    }] as unknown as WorkService[];
    const workRow = {
      ...row('w', 'paid', 100n), workServiceId: 'work-1', purchaseIds: [],
      supplierName: 'Serviços: Silva / Souza',
      referenceCodes: ['OBR-00019'],
    };
    const report = buildStoreReimbursement([workRow], [], works, storeA);
    const names = planReimbursementZipFileNames(report);
    expect(names.get('work:rec-work')).toBe('Notas_e_Recibos/Recibo_Servicos Silva Souza_OBR-00019.jpg');
  });

  it('exporta comprovantes de obras em pasta compartilhada com sufixo OBR e links na coluna', async () => {
    const { planReimbursementZipFileNames, createReimbursementOfflineIndex,
      groupReimbursementLinesByReference, createStoreReimbursementWorkbook } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const workRows = [
      { ...row('pay-1', 'paid', 100n), workServiceId: 'obra-1', purchaseIds: [],
        referenceCodes: ['OBR-00019'], supplierName: 'Prestador Silva' },
      { ...row('pay-2', 'paid', 200n), workServiceId: 'obra-1', purchaseIds: [],
        referenceCodes: ['OBR-00019'], supplierName: 'Prestador Silva' },
    ];
    const works = [{
      id: 'obra-1', storeId: storeA,
      documents: [
        { id: 'nf', documentType: 'invoice', paymentId: null,
          storagePath: 'obras/nota.pdf', originalName: 'Nota.pdf' },
        { id: 'proof-1', documentType: 'payment_proof', paymentId: 'pay-1',
          storagePath: 'obras/comprovante1.pdf', originalName: 'comprovante1.pdf' },
        { id: 'proof-2', documentType: 'payment_proof', paymentId: 'pay-2',
          storagePath: 'obras/comprovante2.jpg', originalName: 'comprovante2.jpg' },
        { id: 'budget', documentType: 'quote', paymentId: null,
          storagePath: 'obras/orcamento.pdf', originalName: 'orcamento.pdf' },
      ],
    }] as unknown as WorkService[];
    const report = buildStoreReimbursement(workRows, [], works, storeA);
    expect(report.documents).toHaveLength(1);
    expect(report.paymentProofs).toHaveLength(2);
    expect(report.lines[0].paymentProofs.map((doc) => doc.id)).toEqual(['proof-1']);
    expect(report.lines[1].paymentProofs.map((doc) => doc.id)).toEqual(['proof-2']);
    expect(report.totals.commitmentCents).toBe(300n);
    expect(report.sumMatches).toBe(true);
    expect(groupReimbursementLinesByReference(report.lines)[0].paymentProofs).toHaveLength(2);

    const names = planReimbursementZipFileNames(report);
    expect(names.get('work:nf')).toBe('Notas_e_Recibos/Nota_Prestador Silva_OBR-00019.pdf');
    expect(names.get('work:proof-1')).toBe('Comprovantes_Pagamentos/Comprovante_Pagamento_Prestador Silva_OBR-00019_OBR.pdf');
    expect(names.get('work:proof-2')).toBe('Comprovantes_Pagamentos/Comprovante_Pagamento_Prestador Silva_OBR-00019_OBR.jpg');
    expect([...names.values()].some((name) => name.includes('orcamento'))).toBe(false);

    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report, generatedAt: new Date('2026-10-27T12:00:00Z'),
      zipNames: names, unavailable: new Set(),
    });
    const book = new Workbook();
    await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
    const sheet = book.getWorksheet('Solicitação de Reembolso');
    expect(sheet?.getCell('F5').value).toBe(3);
    expect(sheet?.getCell('H5').value).toEqual({
      text: names.get('work:nf'), hyperlink: names.get('work:nf'),
    });
    expect(sheet?.getCell('I4').value).toBe('Comprovante(s) de pagamento');
    expect(sheet?.getCell('I5').value).toEqual({
      text: 'Comprovante_Pagamento_Prestador Silva_OBR-00019_OBR.pdf; Comprovante_Pagamento_Prestador Silva_OBR-00019_OBR.jpg',
      hyperlink: "#'Arquivos do ZIP'!A3",
    });
    expect(book.getWorksheet('Resumo')?.getCell('B11').value).toBe(0);
    expect(book.getWorksheet('Resumo')?.getCell('B12').value).toBe(2);
    expect(book.getWorksheet('Arquivos do ZIP')?.rowCount).toBe(4);
    expect(book.getWorksheet('Arquivos do ZIP')?.getCell('A3').value).toEqual({
      text: names.get('work:proof-1'), hyperlink: names.get('work:proof-1'),
    });
    expect(createReimbursementOfflineIndex(report, names)).toContain('Comprovantes_Pagamentos');
  });

  it('linka diretamente um recibo único e não incorpora comprovante de outra loja ou pagamento', async () => {
    const { planReimbursementZipFileNames, createStoreReimbursementWorkbook } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const works = [{
      id: 'obra-a', storeId: storeA,
      documents: [
        { id: 'proof-a', documentType: 'payment_proof', paymentId: 'pay-a',
          storagePath: 'obras/recibo.pdf', originalName: 'Comprovante de pagamento.pdf' },
        { id: 'proof-other', documentType: 'payment_proof', paymentId: 'pay-outro',
          storagePath: 'obras/irrelevante.pdf', originalName: 'Outro.pdf' },
      ],
    }, {
      id: 'obra-b', storeId: storeB,
      documents: [{ id: 'proof-b', documentType: 'payment_proof', paymentId: 'pay-a',
        storagePath: 'obras/loja-b.pdf', originalName: 'Loja B.pdf' }],
    }] as unknown as WorkService[];
    const report = buildStoreReimbursement([
      { ...row('pay-a', 'paid', 100n), workServiceId: 'obra-a', purchaseIds: [],
        referenceCodes: ['OBR-00020'] },
    ], [], works, storeA);
    expect(report.paymentProofs.map((doc) => doc.id)).toEqual(['proof-a']);
    expect(report.lines[0].fiscalState).toBe('missing'); // proof does not replace NF/recibo fiscal
    const names = planReimbursementZipFileNames(report);
    const path = names.get('work:proof-a');
    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report, generatedAt: new Date('2026-10-27T12:00:00Z'),
      zipNames: names, unavailable: new Set(),
    });
    const book = new Workbook();
    await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
    expect(book.getWorksheet('Solicitação de Reembolso')?.getCell('I5').value).toEqual({
      text: path?.split('/').pop(), hyperlink: path,
    });
    expect(book.getWorksheet('Solicitação de Reembolso')?.getCell('H5').value).toBe('—');
    expect(book.getWorksheet('Solicitação de Reembolso')?.getCell('F5').value).toBe(1);
  });

  it('reúne comprovantes CMP e OBR na mesma pasta, com sufixo de origem ao final', async () => {
    const { planReimbursementZipFileNames, createStoreReimbursementWorkbook,
      createReimbursementOfflineIndex } = await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');

    const cmp = purchase([
      { ...attachment('nf-cmp', 'invoice'), paymentId: null },
      { ...attachment('proof-cmp', 'payment_proof'), paymentId: 'pay-cmp',
        originalName: 'Banco.pdf' },
      { ...attachment('proof-cmp-2', 'payment_proof'), paymentId: 'pay-cmp',
        originalName: 'Comprovante 2.pdf' },
      { ...attachment('proof-other-installment', 'payment_proof'), paymentId: 'outro-pagamento' },
      { ...attachment('proof-other-store', 'payment_proof', [{ storeId: storeB }]),
        paymentId: 'pay-cmp' },
      { ...attachment('proof-other-order', 'payment_proof'), paymentId: 'pay-cmp',
        purchaseOrderId: 'order-2' },
    ]);
    const works = [{
      id: 'obra-1', storeId: storeA, documents: [{
        id: 'proof-obr', documentType: 'payment_proof', paymentId: 'pay-obr',
        storagePath: 'obras/comp.pdf', originalName: 'Banco.pdf',
      }],
    }] as unknown as WorkService[];
    const paymentCMP = {
      ...row('pay-cmp', 'paid', 100n),
      referenceCodes: ['CMP-00055'],
      supplierName: 'Fornecedor X',
    };
    const paymentOBR = {
      ...row('pay-obr', 'paid', 200n),
      workServiceId: 'obra-1',
      purchaseIds: [],
      paymentIds: ['pay-obr'],
      referenceCodes: ['OBR-00105'],
      supplierName: 'Fornecedor X',
    };
    const report = buildStoreReimbursement([paymentCMP, paymentOBR], [cmp], works, storeA);
    expect(report.paymentProofs.map((proof) => proof.id)).toEqual([
      'proof-cmp', 'proof-cmp-2', 'proof-obr',
    ]);
    expect(report.lines[0].paymentProofs.map((proof) => proof.id)).toEqual([
      'proof-cmp', 'proof-cmp-2',
    ]);
    expect(report.totals.commitmentCents).toBe(300n);
    expect(report.sumMatches).toBe(true);

    const names = planReimbursementZipFileNames(report);
    expect(names.get('purchase:proof-cmp')).toBe(
      'Comprovantes_Pagamentos/Comprovante_Pagamento_Fornecedor X_CMP-00055_CMP.pdf');
    expect(names.get('purchase:proof-cmp-2')).toBe(
      'Comprovantes_Pagamentos/Comprovante_Pagamento_Fornecedor X_CMP-00055_1_CMP.pdf');
    expect(names.get('work:proof-obr')).toBe(
      'Comprovantes_Pagamentos/Comprovante_Pagamento_Fornecedor X_OBR-00105_OBR.pdf');
    expect([...names.values()].filter((path) => path.startsWith('Comprovantes_Pagamentos/')))
      .toHaveLength(3);

    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report, generatedAt: new Date('2026-10-27T12:00:00Z'),
      zipNames: names, unavailable: new Set(),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('Solicitação de Reembolso');
    expect(sheet?.getCell('F5').value).toBe(1);
    expect(sheet?.getCell('F6').value).toBe(2);
    expect(sheet?.getCell('I5').value).toEqual({
      text: 'Comprovante_Pagamento_Fornecedor X_CMP-00055_CMP.pdf; Comprovante_Pagamento_Fornecedor X_CMP-00055_1_CMP.pdf',
      hyperlink: "#'Arquivos do ZIP'!A3",
    });
    expect(sheet?.getCell('I6').value).toEqual({
      text: 'Comprovante_Pagamento_Fornecedor X_OBR-00105_OBR.pdf',
      hyperlink: names.get('work:proof-obr'),
    });
    expect(workbook.getWorksheet('Arquivos do ZIP')?.rowCount).toBe(5);
    const html = createReimbursementOfflineIndex(report, names);
    expect(html).toContain('_CMP.pdf');
    expect(html).toContain('_OBR.pdf');
  });

  it('sinaliza comprovante CMP sem vínculo de pagamento/loja como revisão sem alterar valores', async () => {
    const { groupReimbursementLinesByReference, createStoreReimbursementWorkbook,
      planReimbursementZipFileNames } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const p = purchase([
      { ...attachment('sem-vinculo', 'payment_proof', []), paymentId: null },
    ]);
    const paid = { ...row('pay-cmp', 'paid', 100n), referenceCodes: ['CMP-00055'] };
    const planned = { ...row('plan-cmp', 'planned', 200n), referenceCodes: ['CMP-00055'] };
    const report = buildStoreReimbursement([paid, planned], [p], [], storeA);
    expect(report.lines[0].paymentProofs.map((doc) => doc.id)).toEqual(['sem-vinculo']);
    expect(report.lines[1].paymentProofs).toHaveLength(0);
    expect(report.paymentProofs[0].needsStoreReview).toBe(true);
    expect(report.paymentProofs[0].needsPaymentReview).toBe(true);
    expect(report.totals.commitmentCents).toBe(300n);
    expect(groupReimbursementLinesByReference(report.lines)[0].amountCents).toBe(300n);
    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report, generatedAt: new Date('2026-10-27T12:00:00Z'),
      zipNames: planReimbursementZipFileNames(report), unavailable: new Set(),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet('Solicitação de Reembolso')?.getCell('J5').value)
      .toEqual(expect.stringContaining('sem loja explicitamente vinculada'));
    expect(workbook.getWorksheet('Solicitação de Reembolso')?.getCell('J5').value)
      .toEqual(expect.stringContaining('sem vínculo a pagamento específico'));
  });

  it('agrupa referências repetidas de Acaraú e soma seus pagamentos mantendo documentos e total', async () => {
    const { groupReimbursementLinesByReference, createStoreReimbursementWorkbook, planReimbursementZipFileNames } =
      await import('../data/exports/finance-reimbursement-export');
    const { Workbook } = await import('exceljs');
    const purchaseRow = (id: string, status: UnifiedFinancePaymentRow['status'], value: bigint) => ({
      ...row(id, status, value),
      supplierName: 'Miranda',
      referenceCodes: ['CMP-00002', 'CMP-00003'],
      description: 'Computadores',
    });
    const workRow = (id: string, value: bigint) => ({
      ...row(id, 'paid', value),
      workServiceId: 'obra-19',
      purchaseIds: [],
      referenceCodes: ['OBR-00019'],
      supplierName: 'Prestador de obra',
      description: 'Serviço elétrico',
    });
    const works = [{
      id: 'obra-19', storeId: storeA, documents: [{
        id: 'rec19', documentType: 'receipt', storagePath: 'obras/rec19.pdf',
        originalName: 'recibo.pdf', documentNumber: '19',
      }],
    }] as unknown as WorkService[];
    const purchaseA = purchase([attachment('nota', 'invoice')]);
    const report = buildStoreReimbursement([
      purchaseRow('cmp-entry', 'paid', 199140n),
      { ...purchaseRow('cmp-first', 'paid', 92932n),
        referenceCodes: [' CMP-00003 ', 'CMP-00002'] },
      { ...purchaseRow('cmp-planned', 'planned', 371728n),
        purchaseOrderIds: ['order-without-note'] },
      workRow('obra-entrada', 1605000n),
      workRow('obra-parcela', 802500n),
    ], [purchaseA], works, storeA);
    const grouped = groupReimbursementLinesByReference(report.lines);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].reference).toBe('CMP-00002 + CMP-00003');
    expect(grouped[0].amountCents).toBe(663800n);
    expect(grouped[0].documents).toHaveLength(1);
    expect(grouped[1].reference).toBe('OBR-00019');
    expect(grouped[1].amountCents).toBe(2407500n);
    expect(grouped[1].documents).toHaveLength(1);
    expect(grouped.reduce((sum, group) => sum + group.amountCents, 0n))
      .toBe(report.totals.commitmentCents);

    const names = planReimbursementZipFileNames(report);
    const bytes = await createStoreReimbursementWorkbook({
      store: { id: storeA, code: 'LOJ-001', name: 'Acaraú', city: 'Acaraú' } as never,
      report, generatedAt: new Date('2026-10-21T12:00:00Z'),
      zipNames: names, unavailable: new Set(),
    });
    const book = new Workbook();
    await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
    const sheet = book.getWorksheet('Solicitação de Reembolso');
    expect(sheet?.getCell('C5').value).toBe('CMP-00002 + CMP-00003');
    expect(sheet?.getCell('F5').value).toBe(6638);
    expect(sheet?.getCell('G5').value).toEqual(expect.stringContaining('Pendente'));
    expect(sheet?.getCell('J5').value).toEqual(expect.stringContaining('1 lançamento'));
    expect(sheet?.getCell('H5').value).toEqual({
      text: names.get('purchase:nota'),
      hyperlink: names.get('purchase:nota'),
    });
    expect(sheet?.getCell('C6').value).toBe('OBR-00019');
    expect(sheet?.getCell('F6').value).toBe(24075);
    expect(sheet?.getCell('H6').value).toEqual({
      text: names.get('work:rec19'),
      hyperlink: names.get('work:rec19'),
    });
    expect(sheet?.getCell('A7').value).toBe('TOTAL SOLICITADO');
    expect(sheet?.getCell('F7').value).toBe(30713);
    expect(book.getWorksheet('Resumo')?.getCell('B8').value).toBe(5);
    expect(book.getWorksheet('Resumo')?.getCell('B9').value).toBe(2);
    const pending = book.getWorksheet('Pendências Documentais');
    expect(pending?.rowCount).toBe(2);
    expect(pending?.getCell('B2').value).toBe('CMP-00002 + CMP-00003');
    expect(pending?.getCell('D2').value).toBe(6638);
    expect(book.getWorksheet('Arquivos do ZIP')?.rowCount).toBe(3);
  });

  it('mantém lançamentos sem referência separados, sem agrupar compras distintas', async () => {
    const { groupReimbursementLinesByReference } =
      await import('../data/exports/finance-reimbursement-export');
    const lines = buildStoreReimbursement([
      { ...row('a', 'paid', 200n), referenceCodes: [] },
      { ...row('b', 'planned', 300n), referenceCodes: [] },
      { ...row('c', 'paid', 400n), referenceCodes: ['CMP-00002'] },
      { ...row('d', 'paid', 500n), referenceCodes: ['CMP-00020'] },
    ], [], [], storeA).lines;
    const grouped = groupReimbursementLinesByReference(lines);
    expect(grouped).toHaveLength(4);
    expect(grouped.map((group) => group.amountCents)).toEqual([200n, 300n, 400n, 500n]);
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
    expect(sheet?.getCell('A1').value).toBe('Solicitação de Reembolso');
    expect(sheet?.getCell('D1').value).toBe(123.45);
    expect(sheet?.getCell('A1').isMerged).toBe(true);
    expect(sheet?.getCell('B1').isMerged).toBe(true);
    expect(sheet?.views[0]?.showGridLines).toBe(false);
    expect(Array.from({ length: 10 }, (_, i) => sheet?.getCell(4, i + 1).value)).toEqual([
      'Loja(s)', 'Origem', 'Referência', 'Fornecedor / prestador',
      'Item / serviço', 'Valor', 'Nota/Recibo', 'Arquivo(s) no ZIP',
      'Comprovante(s) de pagamento', 'Pendência',
    ]);
    expect(sheet?.getCell('K4').value).toBeNull();
    expect(sheet?.getCell('A5').value).toBe('LOJ-001 · Acaraú');
    expect(sheet?.getCell('F5').value).toBe(123.45);
    expect(sheet?.getCell('H5').value).toBe('—');
    expect(sheet?.getCell('I5').value).toBe('—');
    expect(sheet?.getCell('J5').value).toEqual(expect.stringContaining('Conferir vínculo'));
    expect(sheet?.getCell('J5').value).toEqual(expect.stringContaining('falha ao obter anexo'));
    expect(sheet?.autoFilter).toBe('A4:J4');
    const pending = workbook.getWorksheet('Pendências Documentais');
    expect(pending?.rowCount).toBe(2);
    expect(pending?.views[0]?.showGridLines).toBe(false);
    expect(workbook.getWorksheet('Resumo')?.views[0]?.showGridLines).toBe(false);
    expect(pending?.getRow(1).values).toEqual([
      undefined, 'Loja(s)', 'Referência', 'Pendência', 'Valor',
    ]);
    expect(pending?.getCell('A2').value).toBe('LOJ-001 · Acaraú');
    expect(pending?.getCell('C2').value).toEqual(expect.stringContaining('falha ao obter anexo'));
    expect(pending?.getCell('D2').value).toBe(123.45);
  });

});
