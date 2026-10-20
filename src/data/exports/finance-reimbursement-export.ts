import type { Store } from '../../domain/types';
import type { ReimbursementFiscalDocument, ReimbursementLine } from '../../domain/finance-reimbursement';
import type { FinancePaymentOrigin, FinancePaymentsView } from '../../domain/finance-payments';
import { FINANCE_PAYMENT_ORIGIN_LABELS } from '../../domain/finance-payments';
import { formatBRL } from '../../domain/supply-calculations';
import type { buildStoreReimbursement } from '../../domain/finance-reimbursement';

type ReimbursementReport = ReturnType<typeof buildStoreReimbursement>;

const VIEW_LABEL: Record<FinancePaymentsView, string> = {
  paid: 'Pago', planned: 'Programado', unscheduled: 'Sem programação',
};
const MONEY = 'R$ #,##0.00';
const GREEN = 'FF1F6F5C';
const WHITE = 'FFFFFFFF';

function fileSafe(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 85) || 'Documento';
}

function originLabel(line: ReimbursementLine): string {
  const origins = (Object.keys(line.row.originAllocations) as FinancePaymentOrigin[])
    .filter((key) => line.row.originAllocations[key] > 0n);
  return origins.length
    ? origins.map((key) => FINANCE_PAYMENT_ORIGIN_LABELS[key]).join(' + ')
    : 'Origem não atribuída';
}

function fiscalLabel(line: ReimbursementLine): string {
  if (!line.documents.length) return 'Pendente';
  if (line.fiscalState === 'review') return 'Conferir vínculo';
  const kinds = new Set(line.documents.map((doc) => doc.type));
  return [kinds.has('invoice') ? 'Nota' : '', kinds.has('receipt') ? 'Recibo' : '']
    .filter(Boolean).join(' + ');
}

function currentStatus(line: ReimbursementLine, unavailable: Set<string>): string {
  if (!line.documents.length) return 'Sem nota ou recibo';
  if (line.fiscalState === 'review') return 'Conferir vínculo da nota/recibo à loja';
  if (line.documents.some((doc) => unavailable.has(`${doc.source}:${doc.id}`))) {
    return 'Falha ao obter arquivo; verificar anexo';
  }
  return '';
}

/** Build an editable workbook using the uploaded model's original first eight columns. */
export async function createStoreReimbursementWorkbook(input: {
  store: Store;
  report: ReimbursementReport;
  generatedAt: Date;
  zipNames: Map<string, string>;
  unavailable: Set<string>;
}): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;
  const sheet = workbook.addWorksheet('Solicitação de Reembolso', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  sheet.getCell('A1').value = 'Solicitação de Reembolso';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: GREEN } };
  sheet.getCell('B1').value = Number(input.report.totals.commitmentCents) / 100;
  sheet.getCell('B1').numFmt = MONEY;
  sheet.getCell('B1').font = { bold: true, size: 15, color: { argb: GREEN } };
  sheet.getCell('A3').value = 'Detalhamento';
  sheet.getCell('A3').font = { bold: true, size: 12 };
  sheet.getRow(4).values = [
    'Origem', 'Referência', 'Fornecedor / prestador', 'Item / serviço',
    'Loja(s)', 'Valor', 'Nota/Recibo', 'N° Nota/Recibo',
    'Situação', 'Parcela / lançamento', 'Arquivo(s) no ZIP', 'Pendência',
  ];
  sheet.columns = [19, 26, 31, 50, 27, 17, 18, 20, 22, 30, 45, 45]
    .map((width) => ({ width }));
  const header = sheet.getRow(4);
  header.height = 34;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  input.report.lines.forEach((line, i) => {
    const refs = line.row.referenceCodes.join(' + ');
    const names = line.documents.map((doc) => input.zipNames.get(`${doc.source}:${doc.id}`))
      .filter((name): name is string => Boolean(name)).join('; ');
    const row = sheet.addRow([
      originLabel(line), refs, line.row.supplierName, line.row.description,
      `${input.store.code} · ${input.store.name}`, Number(line.row.amountCents) / 100,
      fiscalLabel(line), [...new Set(line.documents.map((doc) => doc.number).filter(Boolean))].join(', ') || '—',
      VIEW_LABEL[line.row.status], line.row.installmentLabel || line.row.id,
      names || '—', currentStatus(line, input.unavailable),
    ]);
    row.getCell(6).numFmt = MONEY;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 30;
    if (i % 2) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8F6' } }; });
    if (currentStatus(line, input.unavailable)) {
      row.getCell(12).font = { bold: true, color: { argb: 'FF9B342B' } };
    }
  });
  const totalLine = sheet.addRow(['TOTAL SOLICITADO', '', '', '', '', Number(input.report.totals.commitmentCents) / 100]);
  totalLine.getCell(6).numFmt = MONEY;
  totalLine.font = { bold: true, color: { argb: GREEN } };
  sheet.autoFilter = { from: 'A4', to: 'L4' };

  const summary = workbook.addWorksheet('Resumo');
  summary.columns = [{ width: 37 }, { width: 27 }];
  summary.addRow(['Solicitação de Reembolso', `${input.store.code} · ${input.store.name}`]);
  summary.addRow(['Gerado em', input.generatedAt.toLocaleString('pt-BR')]);
  summary.addRow(['Critério', 'Todo o compromisso: pago + programado + sem programação']);
  summary.addRow(['Pago', Number(input.report.totals.paidCents) / 100]);
  summary.addRow(['Programado', Number(input.report.totals.plannedCents) / 100]);
  summary.addRow(['Sem programação', Number(input.report.totals.unscheduledCents) / 100]);
  summary.addRow(['TOTAL SOLICITADO', Number(input.report.totals.commitmentCents) / 100]);
  summary.addRow(['Lançamentos', input.report.lines.length]);
  summary.addRow(['Documentos fiscais únicos', input.report.documents.length]);
  summary.addRow(['Lançamentos com pendência/conferência', input.report.lines.filter((line) => currentStatus(line, input.unavailable)).length]);
  for (const index of [4, 5, 6, 7]) summary.getRow(index).getCell(2).numFmt = MONEY;
  summary.getRow(7).font = { bold: true, color: { argb: GREEN } };

  const pending = workbook.addWorksheet('Pendências Documentais');
  pending.columns = [{ width: 26 }, { width: 29 }, { width: 45 }, { width: 19 }, { width: 45 }];
  pending.addRow(['Referência', 'Parcela / lançamento', 'Pendência', 'Valor', 'Situação']);
  pending.getRow(1).font = { bold: true, color: { argb: GREEN } };
  input.report.lines.forEach((line) => {
    const status = currentStatus(line, input.unavailable);
    if (!status) return;
    const row = pending.addRow([
      line.row.referenceCodes.join(' + '), line.row.installmentLabel || line.row.id,
      status, Number(line.row.amountCents) / 100, VIEW_LABEL[line.row.status],
    ]);
    row.getCell(4).numFmt = MONEY;
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes as ArrayBuffer;
}

export async function downloadStoreReimbursementZip(input: {
  store: Store;
  report: ReimbursementReport;
  getSignedUrl: (document: ReimbursementFiscalDocument) => Promise<string>;
}): Promise<{ failed: number; missing: number; review: number }> {
  if (!input.report.lines.length) throw new Error('A loja não possui lançamentos para o relatório.');
  if (!input.report.sumMatches) throw new Error('A soma dos compromissos não confere com o total.');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const zipNames = new Map<string, string>();
  const unavailable = new Set<string>();

  // Download once per unique attachment; failed files remain visible as pending in Excel.
  for (const doc of input.report.documents) {
    const key = `${doc.source}:${doc.id}`;
    try {
      const url = await input.getSignedUrl(doc);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const filename = `Notas_e_Recibos/${doc.source}_${fileSafe(doc.id)}_${fileSafe(doc.name)}`;
      zip.file(filename, await response.arrayBuffer());
      zipNames.set(key, filename);
    } catch {
      unavailable.add(key);
    }
  }

  const generatedAt = new Date();
  const xlsx = await createStoreReimbursementWorkbook({ ...input, generatedAt, zipNames, unavailable });
  const stamp = generatedAt.toISOString().slice(0, 10);
  const storeTag = fileSafe(`${input.store.code}_${input.store.city || input.store.name}`);
  zip.file(`Solicitacao_Reembolso_${storeTag}.xlsx`, xlsx);
  const missing = input.report.lines.filter((line) => !line.documents.length).length;
  const review = input.report.lines.filter((line) => line.fiscalState === 'review').length;
  zip.file('LEIA-ME.txt', [
    'SOLICITAÇÃO DE REEMBOLSO - IMPLANTA 27',
    `Loja: ${input.store.code} · ${input.store.name}`,
    `Total solicitado: ${formatBRL(input.report.totals.commitmentCents)}`,
    'Critério: pago + programado + sem programação, incluindo valores ainda não quitados.',
    `Lançamentos sem nota ou recibo: ${missing}`,
    `Lançamentos com documento a conferir por loja: ${review}`,
    `Anexos indisponíveis no download: ${unavailable.size}`,
    'Consulte a aba Pendências Documentais no Excel; pendências não reduzem o valor solicitado.',
  ].join('\n'));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `Reembolso_${storeTag}_${stamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
  return { failed: unavailable.size, missing, review };
}
