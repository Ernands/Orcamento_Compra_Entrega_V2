import type { Store } from '../../domain/types';
import type {
  ReimbursementFiscalDocument, ReimbursementLine, ReimbursementPaymentProof,
} from '../../domain/finance-reimbursement';
import type { FinancePaymentOrigin } from '../../domain/finance-payments';
import { FINANCE_PAYMENT_ORIGIN_LABELS } from '../../domain/finance-payments';
import { formatBRL } from '../../domain/supply-calculations';
import type { buildStoreReimbursement } from '../../domain/finance-reimbursement';

type ReimbursementReport = ReturnType<typeof buildStoreReimbursement>;

const MONEY = 'R$ #,##0.00';
const GREEN = 'FF1F6F5C';
const WHITE = 'FFFFFFFF';

function fileSafe(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '').slice(0, 85) || 'Documento';
}

/** Keep filenames readable in Windows/ZIP and preserve the requested reference separators. */
function documentNamePart(value: string, maxLength: number): string {
  return [...value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
    .map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character)
    .join('')
    .replace(/[\\\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, maxLength).trim() || 'Nao_informado';
}

type ReimbursementExportAttachment = ReimbursementFiscalDocument | ReimbursementPaymentProof;
function documentExtension(doc: ReimbursementExportAttachment): string {
  // Prefer the extension of the original uploaded filename; then its storage path.
  const original = doc.name.split(/[\\/]/).pop() || '';
  const stored = doc.storagePath.split(/[?#]/, 1)[0].split('/').pop() || '';
  const extension = [original, stored]
    .map((value) => value.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1])
    .find((value) => Boolean(value));
  return extension ? `.${extension.toLowerCase()}` : '';
}

/** Plan one unique ZIP filename per attachment, including work payment proofs. */
export function planReimbursementZipFileNames(report: {
  documents: ReimbursementFiscalDocument[];
  paymentProofs?: ReimbursementPaymentProof[];
  lines: Array<{
    documents: ReimbursementFiscalDocument[];
    paymentProofs?: ReimbursementPaymentProof[];
    row: { supplierName: string; referenceCodes: string[] };
  }>;
}): Map<string, string> {
  const names = new Map<string, string>();
  const reserved = new Set<string>();

  const exportAttachments: ReimbursementExportAttachment[] = [
    ...report.documents, ...(report.paymentProofs || []),
  ];
  exportAttachments.forEach((doc) => {
    const key = `${doc.source}:${doc.id}`;
    const linked = report.lines.filter((line) =>
      [...line.documents, ...(line.paymentProofs || [])].some(
        (entry) => entry.source === doc.source && entry.id === doc.id));
    const suppliers = [...new Set(linked.map((line) => line.row.supplierName).filter(Boolean))];
    const references = [...new Set(linked.flatMap((line) => line.row.referenceCodes).filter(Boolean))];
    const type = doc.type === 'invoice' ? 'Nota' : doc.type === 'payment_proof' ? 'Comprovante_Pagamento' : 'Recibo';
    const supplier = documentNamePart(suppliers.join(' + ') || 'Fornecedor', 55);
    const reference = documentNamePart(references.join(' + ') || 'Sem referencia', 100);
    const base = `${type}_${supplier}_${reference}`.slice(0, 175).trim().replace(/[. ]+$/g, '');
    const extension = documentExtension(doc);
    let file = `${base}${extension}`;
    let suffix = 1;
    while (reserved.has(file.toLowerCase())) {
      file = `${base}_${suffix}${extension}`;
      suffix += 1;
    }
    reserved.add(file.toLowerCase());
    names.set(key, `${doc.type === 'payment_proof'
      ? 'Comprovantes_Pagamentos_Obras_Servicos' : 'Notas_e_Recibos'}/${file}`);
  });

  return names;
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
  const needsReview = line.fiscalState === 'review';
  const downloadFailed = line.documents.some((doc) => unavailable.has(`${doc.source}:${doc.id}`));
  if (needsReview && downloadFailed) return 'Conferir vínculo à loja; falha ao obter anexo';
  if (needsReview) return 'Conferir vínculo da nota/recibo à loja';
  if (downloadFailed) return 'Falha ao obter arquivo; verificar anexo';
  return '';
}

export interface ReimbursementReferenceGroup {
  reference: string;
  lines: ReimbursementLine[];
  amountCents: bigint;
  suppliers: string[];
  descriptions: string[];
  origins: string[];
  documents: ReimbursementFiscalDocument[];
  paymentProofs: ReimbursementPaymentProof[];
}

/**
 * Consolidate repeated payment occurrences exclusively for the exported worksheet.
 * Each report already belongs to one store; no underlying payment or allocation is changed.
 * Identical combined reference sets group together even if their order differs.
 * Rows without a reference stay separate to avoid merging unrelated expenses.
 */
export function groupReimbursementLinesByReference(lines: ReimbursementLine[]): ReimbursementReferenceGroup[] {
  const groups = new Map<string, ReimbursementReferenceGroup>();

  lines.forEach((line, index) => {
    const refs = line.row.referenceCodes.flatMap((code) => code.split(/\s*\+\s*/))
      .map((code) => code.trim()).filter(Boolean);
    const normalized = [...new Set(refs.map((code) => code.toLocaleUpperCase('pt-BR')))].sort();
    const key = normalized.length ? JSON.stringify(normalized) : `sem-referencia:${index}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        reference: refs.join(' + ') || 'Sem referência',
        lines: [], amountCents: 0n,
        suppliers: [], descriptions: [], origins: [], documents: [], paymentProofs: [],
      };
      groups.set(key, group);
    }
    group.lines.push(line);
    group.amountCents += line.row.amountCents;
    if (line.row.supplierName && !group.suppliers.includes(line.row.supplierName)) {
      group.suppliers.push(line.row.supplierName);
    }
    if (line.row.description && !group.descriptions.includes(line.row.description)) {
      group.descriptions.push(line.row.description);
    }
    const origin = originLabel(line);
    if (!group.origins.includes(origin)) group.origins.push(origin);
    line.documents.forEach((doc) => {
      if (!group.documents.some((existing) => existing.source === doc.source && existing.id === doc.id)) {
        group.documents.push(doc);
      }
    });
    line.paymentProofs.forEach((doc) => {
      if (!group.paymentProofs.some((existing) => existing.source === doc.source && existing.id === doc.id)) {
        group.paymentProofs.push(doc);
      }
    });
  });

  return [...groups.values()];
}

/** Do not suppress documentation failures from any of the underlying payment rows. */
function groupedDocumentStatus(group: ReimbursementReferenceGroup, unavailable: Set<string>): string {
  const counts = new Map<string, number>();
  group.lines.forEach((line) => {
    const status = currentStatus(line, unavailable);
    if (status) counts.set(status, (counts.get(status) || 0) + 1);
  });
  const details = [...counts.entries()].map(([status, count]) =>
    group.lines.length === 1 ? status : `${status} (${count} lançamento${count === 1 ? '' : 's'})`
  );
  const failedProofs = group.paymentProofs.filter((doc) =>
    unavailable.has(`${doc.source}:${doc.id}`)).length;
  if (failedProofs) details.push(`Falha ao obter ${failedProofs} comprovante(s) de pagamento de obras/serviços`);
  return details.join('; ');
}

/** Offline-only file index: no sessions, signed URLs or external network dependencies. */
export function createReimbursementOfflineIndex(
  report: ReimbursementReport,
  zipNames: Map<string, string>,
): string {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const allAttachments: ReimbursementExportAttachment[] = [
    ...report.documents, ...report.paymentProofs,
  ];
  const rows = allAttachments.flatMap((doc) => {
    const path = zipNames.get(`${doc.source}:${doc.id}`);
    if (!path) return [];
    const lines = report.lines.filter((line) =>
      [...line.documents, ...line.paymentProofs].some(
        (item) => item.source === doc.source && item.id === doc.id));
    const supplier = [...new Set(lines.map((line) => line.row.supplierName))].join(' + ');
    const references = [...new Set(lines.flatMap((line) => line.row.referenceCodes))].join(' + ');
    const href = path.split('/').map(encodeURIComponent).join('/');
    const label = doc.type === 'invoice'
      ? 'Nota' : doc.type === 'payment_proof' ? 'Comprovante de pagamento de obra/serviço' : 'Recibo fiscal';
    return [`<tr><td><a href="${escapeHtml(href)}">${escapeHtml(path)}</a></td><td>${label}</td><td>${escapeHtml(supplier)}</td><td>${escapeHtml(references)}</td></tr>`];
  });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Documentos de reembolso</title>
<style>body{font:16px system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#24332d}h1{color:#1f6f5c}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce6e1;overflow-wrap:anywhere}
th{background:#eaf3ee}a{color:#0860b9}</style></head>
<body><h1>Documentos de reembolso</h1>
<p>Extraia todo o ZIP antes de abrir esta página. Os links abrem arquivos locais sem login no Implanta 27.</p>
<table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Fornecedor / prestador</th><th>Referência</th></tr></thead>
<tbody>${rows.join('\n') || '<tr><td colspan="4">Nenhum arquivo disponível.</td></tr>'}</tbody></table></body></html>`;
}

/** Build an editable store reimbursement workbook with a store-first detail layout. */
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
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  // Merge the heading instead of widening the entire store column.
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = 'Solicitação de Reembolso';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: GREEN } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 30;
  sheet.getCell('D1').value = Number(input.report.totals.commitmentCents) / 100;
  sheet.getCell('D1').numFmt = MONEY;
  sheet.getCell('D1').font = { bold: true, size: 15, color: { argb: GREEN } };
  sheet.getCell('A3').value = 'Detalhamento';
  sheet.getCell('A3').font = { bold: true, size: 12 };
  sheet.getRow(4).values = [
    'Loja(s)', 'Origem', 'Referência', 'Fornecedor / prestador',
    'Item / serviço', 'Valor', 'Nota/Recibo', 'Arquivo(s) no ZIP',
    'Comprovante(s) de pagamento', 'Pendência',
  ];
  sheet.columns = [27, 19, 26, 31, 50, 17, 18, 58, 56, 45]
    .map((width) => ({ width }));
  const header = sheet.getRow(4);
  header.height = 34;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  const indexedDocuments: ReimbursementExportAttachment[] = [
    ...input.report.documents, ...input.report.paymentProofs,
  ].filter((doc) => input.zipNames.has(`${doc.source}:${doc.id}`));
  const documentIndexRows = new Map(indexedDocuments.map((doc, i) =>
    [`${doc.source}:${doc.id}`, i + 2]));
  const groups = groupReimbursementLinesByReference(input.report.lines);
  // The source report still retains every payment occurrence for audit and totals.
  groups.forEach((group, i) => {
    const documentKeys = group.documents.map((doc) => `${doc.source}:${doc.id}`);
    const paths = [...new Set(documentKeys
      .map((key) => input.zipNames.get(key))
      .filter((name): name is string => Boolean(name)))];
    const kinds = [...new Set(group.lines.map((line) => fiscalLabel(line)))];
    const receiptKeys = group.paymentProofs.map((doc) => `${doc.source}:${doc.id}`);
    const receiptPaths = [...new Set(receiptKeys
      .map((key) => input.zipNames.get(key))
      .filter((name): name is string => Boolean(name)))];
    const receiptNames = receiptPaths.map((path) => path.split('/').pop() || path);
    const status = groupedDocumentStatus(group, input.unavailable);
    const row = sheet.addRow([
      `${input.store.code} · ${input.store.name}`,
      group.origins.join(' + '),
      group.reference,
      group.suppliers.join(' + '),
      group.descriptions.join(' | '),
      Number(group.amountCents) / 100,
      kinds.join(' + '),
      paths.join('; ') || '—',
      receiptNames.join('; ') || '—',
      status,
    ]);
    if (paths.length) {
      const linkCell = row.getCell(8);
      const firstIndexRow = documentKeys.map((key) => documentIndexRows.get(key))
        .find((number) => number !== undefined);
      linkCell.value = {
        text: paths.join('; '),
        hyperlink: paths.length === 1 ? paths[0] : `#'Arquivos do ZIP'!A${firstIndexRow}`,
        tooltip: paths.length === 1
          ? 'Extrair o ZIP completo antes de abrir o arquivo'
          : 'Clique para abrir a aba Arquivos do ZIP e acessar cada anexo',
      };
      linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    if (receiptPaths.length) {
      const linkCell = row.getCell(9);
      const firstIndexRow = receiptKeys.map((key) => documentIndexRows.get(key))
        .find((number) => number !== undefined);
      linkCell.value = {
        text: receiptNames.join('; '),
        hyperlink: receiptPaths.length === 1
          ? receiptPaths[0] : `#'Arquivos do ZIP'!A${firstIndexRow}`,
        tooltip: receiptPaths.length === 1
          ? 'Extraia o ZIP para abrir o comprovante de pagamento'
          : 'Clique para abrir o índice, que oferece um link direto por recibo',
      };
      linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    row.getCell(6).numFmt = MONEY;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = Math.min(86, 30 + Math.max(0, group.descriptions.length - 1) * 14);
    if (i % 2) row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8F6' } };
    });
    if (status) row.getCell(10).font = { bold: true, color: { argb: 'FF9B342B' } };
  });
  const totalLine = sheet.addRow(['TOTAL SOLICITADO', '', '', '', '', Number(input.report.totals.commitmentCents) / 100]);
  totalLine.getCell(6).numFmt = MONEY;
  totalLine.font = { bold: true, color: { argb: GREEN } };
  sheet.autoFilter = { from: 'A4', to: 'J4' };

  const summary = workbook.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 37 }, { width: 27 }];
  summary.addRow(['Solicitação de Reembolso', `${input.store.code} · ${input.store.name}`]);
  summary.addRow(['Gerado em', input.generatedAt.toLocaleString('pt-BR')]);
  summary.addRow(['Critério', 'Todo o compromisso: pago + programado + sem programação']);
  summary.addRow(['Pago', Number(input.report.totals.paidCents) / 100]);
  summary.addRow(['Programado', Number(input.report.totals.plannedCents) / 100]);
  summary.addRow(['Sem programação', Number(input.report.totals.unscheduledCents) / 100]);
  summary.addRow(['TOTAL SOLICITADO', Number(input.report.totals.commitmentCents) / 100]);
  summary.addRow(['Lançamentos de origem', input.report.lines.length]);
  summary.addRow(['Referências consolidadas', groups.length]);
  summary.addRow(['Documentos fiscais únicos', input.report.documents.length]);
  summary.addRow(['Comprovantes de pagamento de obras/serviços', input.report.paymentProofs.length]);
  summary.addRow(['Lançamentos com pendência/conferência', input.report.lines.filter((line) => currentStatus(line, input.unavailable)).length]);
  for (const index of [4, 5, 6, 7]) summary.getRow(index).getCell(2).numFmt = MONEY;
  summary.getRow(7).font = { bold: true, color: { argb: GREEN } };

  const pending = workbook.addWorksheet('Pendências Documentais', { views: [{ showGridLines: false }] });
  pending.columns = [{ width: 27 }, { width: 26 }, { width: 45 }, { width: 19 }];
  pending.addRow(['Loja(s)', 'Referência', 'Pendência', 'Valor']);
  pending.getRow(1).font = { bold: true, color: { argb: GREEN } };
  groups.forEach((group) => {
    const status = groupedDocumentStatus(group, input.unavailable);
    if (!status) return;
    const row = pending.addRow([
      `${input.store.code} · ${input.store.name}`, group.reference,
      status, Number(group.amountCents) / 100,
    ]);
    row.getCell(4).numFmt = MONEY;
  });
  // Every exported attachment has its own direct, relative hyperlink.
  const index = workbook.addWorksheet('Arquivos do ZIP', { views: [{ showGridLines: false }] });
  index.columns = [{ width: 75 }, { width: 18 }, { width: 34 }, { width: 38 }];
  index.addRow(['Arquivo (clique para abrir)', 'Tipo', 'Fornecedor / prestador', 'Referência']);
  index.getRow(1).font = { bold: true, color: { argb: GREEN } };
  indexedDocuments.forEach((doc) => {
    const path = input.zipNames.get(`${doc.source}:${doc.id}`);
    if (!path) return;
    const lines = input.report.lines.filter((line) =>
      line.documents.some((item) => item.source === doc.source && item.id === doc.id));
    const supplier = [...new Set(lines.map((line) => line.row.supplierName))].join(' + ');
    const references = [...new Set(lines.flatMap((line) => line.row.referenceCodes))].join(' + ');
    const type = doc.type === 'invoice' ? 'Nota'
      : doc.type === 'payment_proof' ? 'Comprovante de pagamento' : 'Recibo fiscal';
    const row = index.addRow([path, type, supplier, references]);
    row.getCell(1).value = { text: path, hyperlink: path, tooltip: 'Extrair o ZIP completo antes de abrir' };
    row.getCell(1).font = { color: { argb: 'FF0563C1' }, underline: true };
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes;
}

export async function downloadStoreReimbursementZip(input: {
  store: Store;
  report: ReimbursementReport;
  getSignedUrl: (document: ReimbursementExportAttachment) => Promise<string>;
}): Promise<{ failed: number; missing: number; review: number }> {
  if (!input.report.lines.length) throw new Error('A loja não possui lançamentos para o relatório.');
  if (!input.report.sumMatches) throw new Error('A soma dos compromissos não confere com o total.');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const zipNames = new Map<string, string>();
  const plannedNames = planReimbursementZipFileNames(input.report);
  const unavailable = new Set<string>();

  // Download once per unique fiscal attachment or work payment proof.
  // Failures remain visible in the workbook; totals are never changed.
  const allAttachments: ReimbursementExportAttachment[] = [
    ...input.report.documents, ...input.report.paymentProofs,
  ];
  for (const doc of allAttachments) {
    const key = `${doc.source}:${doc.id}`;
    try {
      const url = await input.getSignedUrl(doc);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const filename = plannedNames.get(key);
      if (!filename) throw new Error('Documento sem nome de exportação.');
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
    'LINKS DE DOCUMENTOS: extraia TODO o ZIP para uma única pasta antes de abrir a planilha.',
    'Documentos fiscais: Notas_e_Recibos/. Comprovantes de pagamentos de obras e serviços: Comprovantes_Pagamentos_Obras_Servicos/.',
    'Na planilha, as colunas Arquivo(s) no ZIP e Comprovante(s) de pagamento possuem links. Havendo vários, acesse a aba Arquivos do ZIP.',
    'Para abrir sem Excel ou acesso ao sistema, use Abrir_Arquivos.html no navegador após extrair o ZIP.',
    'Links relativos não funcionam de forma confiável quando a planilha está aberta dentro do ZIP.',
  ].join('\n'));
  zip.file('Abrir_Arquivos.html', createReimbursementOfflineIndex(input.report, zipNames));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `Reembolso_${storeTag}_${stamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the blob alive while the browser starts processing the download.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return { failed: unavailable.size, missing, review };
}
