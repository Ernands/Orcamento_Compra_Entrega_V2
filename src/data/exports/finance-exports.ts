import type {
  FinanceOverviewStoreRow,
  FinanceStoreItemDetailRow,
} from '../../domain/finance-overview';
import { moneyToCents } from '../../domain/supply-calculations';
import type { Store } from '../../domain/types';
import type { WorkService } from '../../domain/works-types';

const HEADER_FILL = 'FF1F6F5C';
const HEADER_TEXT = 'FFFFFFFF';
const SOFT_FILL = 'FFEAF3F0';
const BUDGET_HEADER_FILL = 'FFDDEBFA';
const BUDGET_BODY_FILL = 'FFF1F7FD';
const BUDGET_TEXT = 'FF1E5A8A';
const REALIZED_HEADER_FILL = 'FFDDF3E7';
const REALIZED_BODY_FILL = 'FFF0F9F5';
const REALIZED_TEXT = 'FF177354';
const FINANCE_HEADER_FILL = 'FFFDEACF';
const FINANCE_BODY_FILL = 'FFFFF8EF';
const FINANCE_TEXT = 'FF9A5A0A';
const DOCUMENT_HEADER_FILL = 'FFEFF2F0';
const DOCUMENT_BODY_FILL = 'FFF7F7F5';
const DOCUMENT_TEXT = 'FF53615C';
const MONEY_FORMAT = 'R$ #,##0.00';

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
}

function formatCurrency(value: bigint): string {
  return centsToNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function fileStamp(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function styleHeader(row: {
  eachCell: (
    callback: (cell: { fill: unknown; font: unknown; alignment: unknown }) => void,
  ) => void;
}) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function workFinancials(work: WorkService) {
  const budgetCents = moneyToCents(work.budgetAmount);
  const contractedCents = moneyToCents(work.contractedAmount);
  const paidCents = work.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const documentedCents = work.documents
    .filter(
      (document) => document.documentType !== 'quote' && document.documentType !== 'payment_proof',
    )
    .reduce(
      (sum, document) =>
        sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
      0n,
    );
  return {
    budgetCents,
    contractedCents,
    differenceCents: budgetCents - contractedCents,
    paidCents,
    payableCents: contractedCents > paidCents ? contractedCents - paidCents : 0n,
    documentedCents,
  };
}

export interface FinanceOverviewExportInput {
  rows: FinanceOverviewStoreRow[];
  generatedAt: Date;
  filtersText: string;
}

export interface FinanceStoreDetailExportInput {
  store: Pick<Store, 'code' | 'name' | 'city' | 'state'>;
  overview: FinanceOverviewStoreRow;
  items: FinanceStoreItemDetailRow[];
  works: WorkService[];
  generatedAt: Date;
  filtersText: string;
}

export async function createFinanceOverviewWorkbook(
  input: FinanceOverviewExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const summary = workbook.addWorksheet('Visão Geral', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const totals = input.rows.reduce(
    (acc, row) => ({
      budgetBbCents: acc.budgetBbCents + row.budgetBbCents,
      budgetTotalCents: acc.budgetTotalCents + row.budgetTotalCents,
      realizedTotalCents: acc.realizedTotalCents + row.realizedTotalCents,
      budgetVarianceToBbCents: acc.budgetVarianceToBbCents + row.budgetVarianceToBbCents,
      realizedVarianceToBbCents:
        acc.realizedVarianceToBbCents + row.realizedVarianceToBbCents,
    }),
    {
      budgetBbCents: 0n,
      budgetTotalCents: 0n,
      realizedTotalCents: 0n,
      budgetVarianceToBbCents: 0n,
      realizedVarianceToBbCents: 0n,
    },
  );

  summary.columns = [
    { key: 'label', width: 26 },
    { key: 'value', width: 20 },
  ];
  summary.addRow(['Sistema de Controle Orçamentário']);
  summary.mergeCells('A1:B1');
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  summary.addRow(['Implantação de Lojas Mais BB']);
  summary.mergeCells('A2:B2');
  summary.addRow([]);
  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summary.addRow(['Filtros', input.filtersText || 'Todos']);
  summary.addRow([]);
  summary.addRow(['1 Onda - ' + input.rows.length + ' lojas']);
  summary.mergeCells('A7:B7');
  summary.addRow(['Indicador', 'Valor']);
  styleHeader(summary.getRow(8));
  [
    ['Verba BB', totals.budgetBbCents],
    ['Orçado total', totals.budgetTotalCents],
    ['Realizado total', totals.realizedTotalCents],
    ['Diferença Verba - Orçado', totals.budgetVarianceToBbCents],
    ['Diferença Verba - Realizado', totals.realizedVarianceToBbCents],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, centsToNumber(value as bigint)]);
    row.getCell(2).numFmt = MONEY_FORMAT;
  });

  const storesSheet = workbook.addWorksheet('Lojas', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  storesSheet.columns = [
    { header: 'Loja', key: 'store', width: 18 },
    { header: 'Nome', key: 'name', width: 25 },
    { header: 'Cidade', key: 'city', width: 20 },
    { header: 'UF', key: 'state', width: 8 },
    { header: 'Verba BB', key: 'budgetBb', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Orçado Equipamentos', key: 'equipmentBudget', width: 20, style: { numFmt: MONEY_FORMAT } },
    { header: 'Orçado Mobiliário', key: 'furnitureBudget', width: 20, style: { numFmt: MONEY_FORMAT } },
    { header: 'Orçado obra', key: 'worksBudget', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Orçado total', key: 'budgetTotal', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Dif. Em Relação a Verba', key: 'budgetVariance', width: 22, style: { numFmt: MONEY_FORMAT } },
    { header: 'Realizado Equipamentos', key: 'equipmentRealized', width: 22, style: { numFmt: MONEY_FORMAT } },
    { header: 'Realizado Mobiliário', key: 'furnitureRealized', width: 22, style: { numFmt: MONEY_FORMAT } },
    { header: 'Realizado Obras', key: 'worksRealized', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Realizado Total', key: 'realized', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Dif. Em Relação a Verba', key: 'realizedVariance', width: 22, style: { numFmt: MONEY_FORMAT } },
    { header: 'Pago', key: 'paid', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Saldo a pagar', key: 'payable', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Documentação', key: 'documentation', width: 18 },
  ];
  styleHeader(storesSheet.getRow(1));
  input.rows.forEach((row) => {
    storesSheet.addRow({
      store: row.code,
      name: row.name,
      city: row.city,
      state: row.state,
      budgetBb: centsToNumber(row.budgetBbCents),
      equipmentBudget: centsToNumber(row.equipmentBudgetCents),
      furnitureBudget: centsToNumber(row.furnitureBudgetCents),
      worksBudget: centsToNumber(row.worksBudgetCents),
      budgetTotal: centsToNumber(row.budgetTotalCents),
      budgetVariance: centsToNumber(row.budgetVarianceToBbCents),
      equipmentRealized: centsToNumber(row.equipmentRealizedCents),
      furnitureRealized: centsToNumber(row.furnitureRealizedCents),
      worksRealized: centsToNumber(row.worksContractedCents),
      realized: centsToNumber(row.realizedTotalCents),
      realizedVariance: centsToNumber(row.realizedVarianceToBbCents),
      paid: centsToNumber(row.paidCents),
      payable: centsToNumber(row.payableCents),
      documentation:
        row.documentationStatus === 'complete'
          ? 'Completa'
          : row.documentationStatus === 'partial'
            ? 'Parcial'
            : row.documentationStatus === 'pending'
              ? 'Pendente'
              : 'Sem obra',
    });
  });
  const sectionStyles = [
    { start: 5, end: 10, headerFill: BUDGET_HEADER_FILL, bodyFill: BUDGET_BODY_FILL, text: BUDGET_TEXT },
    { start: 11, end: 15, headerFill: REALIZED_HEADER_FILL, bodyFill: REALIZED_BODY_FILL, text: REALIZED_TEXT },
    { start: 16, end: 17, headerFill: FINANCE_HEADER_FILL, bodyFill: FINANCE_BODY_FILL, text: FINANCE_TEXT },
    { start: 18, end: 18, headerFill: DOCUMENT_HEADER_FILL, bodyFill: DOCUMENT_BODY_FILL, text: DOCUMENT_TEXT },
  ];
  sectionStyles.forEach((section) => {
    for (let column = section.start; column <= section.end; column += 1) {
      const header = storesSheet.getRow(1).getCell(column);
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: section.headerFill } };
      header.font = { bold: true, color: { argb: section.text } };
      for (let rowIndex = 2; rowIndex <= storesSheet.rowCount; rowIndex += 1) {
        storesSheet.getRow(rowIndex).getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: section.bodyFill },
        };
      }
    }
  });
  storesSheet.autoFilter = `A1:R${Math.max(1, storesSheet.rowCount)}`;

  return workbook.xlsx.writeBuffer();
}

export async function createFinanceOverviewPdf(
  input: FinanceOverviewExportInput,
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  document.setTextColor(31, 111, 92);
  document.setFontSize(16);
  document.text('Implanta 27', 12, 13);
  document.setTextColor(30, 34, 32);
  document.setFontSize(12);
  document.text('Visão Geral Financeira', 12, 20);
  document.setFontSize(7.5);
  document.text(`Gerado em: ${formatDateTime(input.generatedAt)}`, 12, 26);
  document.text(`Filtros: ${input.filtersText || 'Todos'}`, 12, 31, { maxWidth: 270 });

  autoTable(document, {
    startY: 36,
    theme: 'striped',
    head: [[
      'Loja', 'Verba BB', 'Orçado Equip.', 'Orçado Mobil.', 'Orçado Obra', 'Orçado Total',
      'Dif. Verba/Orç.', 'Realizado Equip.', 'Realizado Mobil.', 'Realizado Obras',
      'Realizado Total', 'Dif. Verba/Real.',
    ]],
    body: input.rows.map((row) => [
      `${row.code}\n${row.name}\n${row.city}/${row.state}`,
      formatCurrency(row.budgetBbCents),
      formatCurrency(row.equipmentBudgetCents),
      formatCurrency(row.furnitureBudgetCents),
      formatCurrency(row.worksBudgetCents),
      formatCurrency(row.budgetTotalCents),
      formatCurrency(row.budgetVarianceToBbCents),
      formatCurrency(row.equipmentRealizedCents),
      formatCurrency(row.furnitureRealizedCents),
      formatCurrency(row.worksContractedCents),
      formatCurrency(row.realizedTotalCents),
      formatCurrency(row.realizedVarianceToBbCents),
    ]),
    headStyles: { fillColor: [31, 111, 92], fontSize: 5.7 },
    styles: { fontSize: 5.3, cellPadding: 1.3, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 30 } },
    margin: { left: 8, right: 8, bottom: 10 },
    didDrawPage: (data) => {
      document.setFontSize(6.5);
      document.setTextColor(90, 96, 92);
      document.text(`Página ${data.pageNumber}`, 287, 203, { align: 'right' });
    },
  });

  return document.output('arraybuffer');
}

export async function createFinanceStoreDetailWorkbook(
  input: FinanceStoreDetailExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const summary = workbook.addWorksheet('Resumo Loja', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [{ key: 'label', width: 30 }, { key: 'value', width: 24 }];
  summary.addRow(['Implanta 27', `${input.store.code} · ${input.store.name}`]);
  summary.mergeCells('A1:B1');
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  summary.addRow(['Local', `${input.store.city}/${input.store.state}`]);
  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summary.addRow(['Filtros', input.filtersText || 'Todos']);
  summary.addRow([]);
  summary.addRow(['Indicador', 'Valor']);
  styleHeader(summary.getRow(6));
  [
    ['Verba BB', input.overview.budgetBbCents],
    ['Orçado Equipamentos', input.overview.equipmentBudgetCents],
    ['Orçado Mobiliário', input.overview.furnitureBudgetCents],
    ['Orçado obras', input.overview.worksBudgetCents],
    ['Orçado total', input.overview.budgetTotalCents],
    ['Dif. Verba - Orçado', input.overview.budgetVarianceToBbCents],
    ['Realizado Equipamentos', input.overview.equipmentRealizedCents],
    ['Realizado Mobiliário', input.overview.furnitureRealizedCents],
    ['Realizado Obras', input.overview.worksContractedCents],
    ['Realizado total', input.overview.realizedTotalCents],
    ['Dif. Verba - Realizado', input.overview.realizedVarianceToBbCents],
    ['Pago', input.overview.paidCents],
    ['A pagar', input.overview.payableCents],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, centsToNumber(value as bigint)]);
    row.getCell(2).numFmt = MONEY_FORMAT;
  });
  summary.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT_FILL } };

  const items = workbook.addWorksheet('Itens', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  items.columns = [
    { header: 'Item', key: 'item', width: 30 },
    { header: 'Qtd. aprovada', key: 'approved', width: 16 },
    { header: 'Orçado', key: 'budget', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Qtd. comprada', key: 'purchased', width: 16 },
    { header: 'Comprado', key: 'realized', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Diferença', key: 'difference', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Compra', key: 'purchase', width: 17 },
    { header: 'Cotação', key: 'quote', width: 17 },
    { header: 'Fornecedor', key: 'supplier', width: 24 },
    { header: 'Situação', key: 'status', width: 17 },
  ];
  styleHeader(items.getRow(1));
  input.items.forEach((row) => {
    items.addRow({
      item: `${row.itemCode} · ${row.itemName}`,
      approved: `${Number(row.approvedQuantity) / 1000} ${row.unit}`,
      budget: centsToNumber(row.budgetCents),
      purchased: `${Number(row.purchasedQuantity) / 1000} ${row.unit}`,
      realized: centsToNumber(row.realizedCents),
      difference: centsToNumber(row.differenceCents),
      purchase: row.purchaseCode,
      quote: row.quoteCode,
      supplier: row.supplierName,
      status:
        row.purchaseStatus === 'purchased'
          ? 'Comprado'
          : row.purchaseStatus === 'partial'
            ? 'Compra parcial'
            : 'Não comprado',
    });
  });
  items.autoFilter = `A1:J${Math.max(1, items.rowCount)}`;

  const works = workbook.addWorksheet('Obras e Serviços', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  works.columns = [
    { header: 'Serviço', key: 'service', width: 31 },
    { header: 'Responsável', key: 'provider', width: 23 },
    { header: 'Orçado', key: 'budget', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Contratado', key: 'contracted', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Diferença', key: 'difference', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Pago', key: 'paid', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'A pagar', key: 'payable', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Documentado', key: 'documented', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Documentos', key: 'documents', width: 14 },
    { header: 'Execução', key: 'progress', width: 14 },
    { header: 'Situação', key: 'status', width: 20 },
  ];
  styleHeader(works.getRow(1));
  input.works.forEach((work) => {
    const totals = workFinancials(work);
    works.addRow({
      service: `${work.code} · ${work.category} · ${work.description}`,
      provider: work.providerName || 'Não informado',
      budget: centsToNumber(totals.budgetCents),
      contracted: centsToNumber(totals.contractedCents),
      difference: centsToNumber(totals.differenceCents),
      paid: centsToNumber(totals.paidCents),
      payable: centsToNumber(totals.payableCents),
      documented: centsToNumber(totals.documentedCents),
      documents: work.documents.length,
      progress: `${work.progressPercent}%`,
      status: work.status,
    });
  });
  works.autoFilter = `A1:K${Math.max(1, works.rowCount)}`;

  return workbook.xlsx.writeBuffer();
}

export async function createFinanceStoreDetailPdf(
  input: FinanceStoreDetailExportInput,
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  document.setTextColor(31, 111, 92);
  document.setFontSize(16);
  document.text('Implanta 27', 12, 13);
  document.setTextColor(30, 34, 32);
  document.setFontSize(12);
  document.text(`Detalhe Financeiro · ${input.store.code} · ${input.store.name}`, 12, 20);
  document.setFontSize(7.5);
  document.text(`${input.store.city}/${input.store.state} · Gerado em ${formatDateTime(input.generatedAt)}`, 12, 26);
  document.text(`Filtros: ${input.filtersText || 'Todos'}`, 12, 31, { maxWidth: 270 });

  autoTable(document, {
    startY: 36,
    theme: 'grid',
    head: [['Verba BB', 'Orç. Equip.', 'Orç. Mobil.', 'Orç. Obras', 'Orç. Total', 'Dif. Verba/Orç.']],
    body: [[
      formatCurrency(input.overview.budgetBbCents),
      formatCurrency(input.overview.equipmentBudgetCents),
      formatCurrency(input.overview.furnitureBudgetCents),
      formatCurrency(input.overview.worksBudgetCents),
      formatCurrency(input.overview.budgetTotalCents),
      formatCurrency(input.overview.budgetVarianceToBbCents),
    ]],
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 7.2, cellPadding: 1.7 },
  });

  autoTable(document, {
    startY: 50,
    theme: 'grid',
    head: [['Real. Equip.', 'Real. Mobil.', 'Real. Obras', 'Real. Total', 'Dif. Verba/Real.']],
    body: [[
      formatCurrency(input.overview.equipmentRealizedCents),
      formatCurrency(input.overview.furnitureRealizedCents),
      formatCurrency(input.overview.worksContractedCents),
      formatCurrency(input.overview.realizedTotalCents),
      formatCurrency(input.overview.realizedVarianceToBbCents),
    ]],
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 7.2, cellPadding: 1.7 },
  });

  autoTable(document, {
    startY: 66,
    theme: 'striped',
    head: [['Item', 'Qtd. aprovada', 'Orçado', 'Qtd. comprada', 'Comprado', 'Diferença', 'Origem', 'Situação']],
    body: input.items.map((row) => [
      `${row.itemCode}\n${row.itemName}`,
      `${Number(row.approvedQuantity) / 1000} ${row.unit}`,
      formatCurrency(row.budgetCents),
      `${Number(row.purchasedQuantity) / 1000} ${row.unit}`,
      formatCurrency(row.realizedCents),
      formatCurrency(row.differenceCents),
      `${row.purchaseCode}\n${row.quoteCode}\n${row.supplierName}`,
      row.purchaseStatus === 'purchased'
        ? 'Comprado'
        : row.purchaseStatus === 'partial'
          ? 'Compra parcial'
          : 'Não comprado',
    ]),
    headStyles: { fillColor: [31, 111, 92], fontSize: 7 },
    styles: { fontSize: 6.7, cellPadding: 1.7, valign: 'middle' },
    margin: { left: 8, right: 8 },
  });

  const afterItems = (document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 58;
  const worksStart = afterItems + 9 > 180 ? 20 : afterItems + 9;
  if (afterItems + 9 > 180) document.addPage();

  autoTable(document, {
    startY: worksStart,
    theme: 'striped',
    head: [['Obra / serviço', 'Orçado', 'Contratado', 'Diferença', 'Pago', 'A pagar', 'Documentado', 'Docs', 'Execução', 'Situação']],
    body: input.works.map((work) => {
      const totals = workFinancials(work);
      return [
        `${work.code} · ${work.category}\n${work.description}\n${work.providerName || 'Responsável não informado'}`,
        formatCurrency(totals.budgetCents),
        formatCurrency(totals.contractedCents),
        formatCurrency(totals.differenceCents),
        formatCurrency(totals.paidCents),
        formatCurrency(totals.payableCents),
        formatCurrency(totals.documentedCents),
        String(work.documents.length),
        `${work.progressPercent}%`,
        work.status,
      ];
    }),
    headStyles: { fillColor: [31, 111, 92], fontSize: 6.5 },
    styles: { fontSize: 6.2, cellPadding: 1.6, valign: 'middle' },
    margin: { left: 8, right: 8, bottom: 10 },
    didDrawPage: (data) => {
      document.setFontSize(6.5);
      document.setTextColor(90, 96, 92);
      document.text(`Página ${data.pageNumber}`, 287, 203, { align: 'right' });
    },
  });

  return document.output('arraybuffer');
}

export async function downloadFinanceOverviewExcel(input: FinanceOverviewExportInput) {
  const bytes = await createFinanceOverviewWorkbook(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-visao-geral-${fileStamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadFinanceOverviewPdf(input: FinanceOverviewExportInput) {
  const bytes = await createFinanceOverviewPdf(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/pdf' }),
    `financeiro-visao-geral-${fileStamp(input.generatedAt)}.pdf`,
  );
}

export async function downloadFinanceStoreDetailExcel(input: FinanceStoreDetailExportInput) {
  const bytes = await createFinanceStoreDetailWorkbook(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-${input.store.code}-${fileStamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadFinanceStoreDetailPdf(input: FinanceStoreDetailExportInput) {
  const bytes = await createFinanceStoreDetailPdf(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/pdf' }),
    `financeiro-${input.store.code}-${fileStamp(input.generatedAt)}.pdf`,
  );
}
