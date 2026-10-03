import type { FinancePaymentEvent } from '../../domain/finance-types';
import type { Store } from '../../domain/types';

const HEADER_FILL = 'FF1F6F5C';
const HEADER_TEXT = 'FFFFFFFF';
const MONEY_FORMAT = 'R$ #,##0.00';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

export interface FinancePaymentsExportInput {
  rows: FinancePaymentEvent[];
  stores: Store[];
  generatedAt: Date;
  filtersText: string;
}

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
}

function formatCurrency(value: bigint): string {
  return centsToNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
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

function paymentTotals(rows: FinancePaymentEvent[]) {
  const paidCents = rows
    .filter((row) => row.status === 'paid')
    .reduce((sum, row) => sum + row.amountCents, 0n);
  const plannedCents = rows
    .filter((row) => row.status === 'planned')
    .reduce((sum, row) => sum + row.amountCents, 0n);
  return {
    paidCents,
    plannedCents,
    totalCents: paidCents + plannedCents,
  };
}

function storeLabels(row: FinancePaymentEvent, storesById: Map<string, Store>): string {
  if (row.allocationStatus === 'pending_distribution') return 'Distribuição pendente';
  if (row.allocationStatus === 'unlinked') return 'Sem vínculo com pedido';
  const labels = row.storeIds
    .map((id) => storesById.get(id))
    .filter((store): store is Store => Boolean(store))
    .map((store) => `${store.code} · ${store.name}`);
  return labels.length ? labels.join('\n') : `${row.storeIds.length} loja(s)`;
}

function paymentMethodLabel(row: FinancePaymentEvent): string {
  return PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod;
}

export async function createFinancePaymentsWorkbook(
  input: FinancePaymentsExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const totals = paymentTotals(input.rows);
  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  const summary = workbook.addWorksheet('Resumo', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [{ key: 'label', width: 28 }, { key: 'value', width: 26 }];
  summary.addRow(['Implanta 27 · Financeiro']);
  summary.mergeCells('A1:B1');
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  summary.addRow(['Relatório', 'Pagamentos']);
  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summary.addRow(['Filtros', input.filtersText || 'Todos']);
  summary.addRow(['Lançamentos', input.rows.length]);
  summary.addRow([]);
  summary.addRow(['Indicador', 'Valor']);
  styleHeader(summary.getRow(7));
  [
    ['Pago / realizado', totals.paidCents],
    ['A realizar', totals.plannedCents],
    ['Total', totals.totalCents],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, centsToNumber(value as bigint)]);
    row.getCell(2).numFmt = MONEY_FORMAT;
  });

  const sheet = workbook.addWorksheet('Pagamentos', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Situação', key: 'status', width: 14 },
    { header: 'Parcela / referência', key: 'installment', width: 20 },
    { header: 'Compra', key: 'purchase', width: 15 },
    { header: 'Cotação', key: 'quote', width: 15 },
    { header: 'Fornecedor', key: 'supplier', width: 24 },
    { header: 'Itens', key: 'items', width: 38 },
    { header: 'Forma', key: 'method', width: 20 },
    { header: 'Origem', key: 'source', width: 22 },
    { header: 'Lojas', key: 'stores', width: 34 },
    { header: 'UF', key: 'states', width: 12 },
    { header: 'Valor', key: 'amount', width: 17, style: { numFmt: MONEY_FORMAT } },
    { header: 'Comprovantes', key: 'attachments', width: 15 },
  ];
  styleHeader(sheet.getRow(1));

  input.rows.forEach((row) => {
    sheet.addRow({
      date: formatDate(row.date),
      status: row.status === 'paid' ? 'Realizado' : 'A realizar',
      installment: row.installmentLabel,
      purchase: row.purchaseCode,
      quote: row.quoteCode,
      supplier: row.supplierName,
      items: row.itemSummary,
      method: paymentMethodLabel(row),
      source: row.sourceLabel || 'Origem não informada',
      stores: storeLabels(row, storesById),
      states: row.states.join(', ') || '—',
      amount: centsToNumber(row.amountCents),
      attachments: row.attachments.length,
    });
  });

  sheet.autoFilter = `A1:M${Math.max(1, sheet.rowCount)}`;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'top', wrapText: true };
    }
  });

  return workbook.xlsx.writeBuffer();
}

export async function createFinancePaymentsPdf(
  input: FinancePaymentsExportInput,
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const totals = paymentTotals(input.rows);
  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  document.setTextColor(31, 111, 92);
  document.setFontSize(16);
  document.text('Implanta 27', 12, 13);
  document.setTextColor(30, 34, 32);
  document.setFontSize(12);
  document.text('Financeiro · Pagamentos', 12, 20);
  document.setFontSize(7.5);
  document.text(`Gerado em: ${formatDateTime(input.generatedAt)}`, 12, 26);
  document.text(`Filtros: ${input.filtersText || 'Todos'}`, 12, 31, { maxWidth: 270 });
  document.text(
    `Realizado: ${formatCurrency(totals.paidCents)}   |   A realizar: ${formatCurrency(totals.plannedCents)}   |   Total: ${formatCurrency(totals.totalCents)}   |   ${input.rows.length} lançamento(s)`,
    12,
    36,
    { maxWidth: 270 },
  );

  autoTable(document, {
    startY: 41,
    theme: 'striped',
    head: [[
      'Data',
      'Situação',
      'Compra / fornecedor',
      'Itens',
      'Forma / origem',
      'Lojas / UF',
      'Valor',
      'Comp.',
    ]],
    body: input.rows.map((row) => [
      `${formatDate(row.date)}\n${row.installmentLabel}`,
      row.status === 'paid' ? 'Realizado' : 'A realizar',
      `${row.purchaseCode}\n${row.supplierName}\n${row.quoteCode}`,
      row.itemSummary,
      `${paymentMethodLabel(row)}\n${row.sourceLabel || 'Origem não informada'}`,
      `${storeLabels(row, storesById)}\n${row.states.join(', ') || '—'}`,
      formatCurrency(row.amountCents),
      String(row.attachments.length),
    ]),
    headStyles: { fillColor: [31, 111, 92], fontSize: 6.2 },
    styles: { fontSize: 5.8, cellPadding: 1.4, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 18 },
      2: { cellWidth: 35 },
      3: { cellWidth: 52 },
      4: { cellWidth: 35 },
      5: { cellWidth: 55 },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 12, halign: 'center' },
    },
    margin: { left: 7, right: 7, bottom: 10 },
    didDrawPage: (data) => {
      document.setFontSize(6.5);
      document.setTextColor(90, 96, 92);
      document.text(`Página ${data.pageNumber}`, 287, 203, { align: 'right' });
    },
  });

  return document.output('arraybuffer');
}

export async function downloadFinancePaymentsExcel(input: FinancePaymentsExportInput) {
  const bytes = await createFinancePaymentsWorkbook(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-pagamentos-${fileStamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadFinancePaymentsPdf(input: FinancePaymentsExportInput) {
  const bytes = await createFinancePaymentsPdf(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/pdf' }),
    `financeiro-pagamentos-${fileStamp(input.generatedAt)}.pdf`,
  );
}
