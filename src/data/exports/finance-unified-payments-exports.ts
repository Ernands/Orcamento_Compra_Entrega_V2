import {
  financePaymentPrimaryOrigin,
  financePaymentTotals,
  FINANCE_PAYMENT_ORIGIN_LABELS,
  type FinancePaymentOrigin,
  type FinancePaymentsView,
  type UnifiedFinancePaymentRow,
  type UnifiedFinancePaymentStoreAllocation,
} from '../../domain/finance-payments';
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

const VIEW_LABELS: Record<FinancePaymentsView, string> = {
  paid: 'Pago',
  planned: 'A pagar programado',
  unscheduled: 'A pagar sem programação',
};

export interface FinanceUnifiedPaymentsExportInput {
  rows: UnifiedFinancePaymentRow[];
  summaryRows: UnifiedFinancePaymentRow[];
  stores: Store[];
  view: FinancePaymentsView;
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

function formatDate(value: string | null): string {
  if (!value) return 'Não informado';
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

function originLabel(row: UnifiedFinancePaymentRow): string {
  const origins = (Object.keys(row.originAllocations) as FinancePaymentOrigin[]).filter(
    (origin) => row.originAllocations[origin] > 0n,
  );
  if (origins.length === 1) return FINANCE_PAYMENT_ORIGIN_LABELS[origins[0]];
  if (origins.length > 1) {
    return origins.map((origin) => FINANCE_PAYMENT_ORIGIN_LABELS[origin]).join(' + ');
  }
  return FINANCE_PAYMENT_ORIGIN_LABELS[financePaymentPrimaryOrigin(row)];
}

function allocationOriginLabel(allocation: UnifiedFinancePaymentStoreAllocation): string {
  const origins = (Object.keys(allocation.originAllocations) as FinancePaymentOrigin[]).filter(
    (origin) => allocation.originAllocations[origin] > 0n,
  );
  if (!origins.length) return 'Não atribuída';
  return origins.map((origin) => FINANCE_PAYMENT_ORIGIN_LABELS[origin]).join(' + ');
}

function paymentMethodLabel(row: UnifiedFinancePaymentRow): string {
  if (!row.paymentMethod) return 'Não informada';
  return PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod;
}

function referenceLabel(row: UnifiedFinancePaymentRow): string {
  return row.referenceCodes.join(' + ') || 'Sem referência';
}

function storeLabel(row: UnifiedFinancePaymentRow, storesById: Map<string, Store>): string {
  const labels = row.storeIds
    .map((id) => storesById.get(id))
    .filter((store): store is Store => Boolean(store))
    .map((store) => `${store.code} · ${store.name}`);
  if (labels.length) return labels.join('\n');
  if (row.storeCodes.length) return row.storeCodes.join(', ');
  return 'Sem loja definida';
}

export async function createFinanceUnifiedPaymentsWorkbook(
  input: FinanceUnifiedPaymentsExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const totals = financePaymentTotals(input.summaryRows);
  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  const summary = workbook.addWorksheet('Resumo', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [{ key: 'label', width: 32 }, { key: 'value', width: 30 }];
  summary.addRow(['Implanta 27 · Financeiro']);
  summary.mergeCells('A1:B1');
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  summary.addRow(['Relatório', 'Pagamentos']);
  summary.addRow(['Visualização exportada', VIEW_LABELS[input.view]]);
  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summary.addRow(['Filtros', input.filtersText || 'Todos']);
  summary.addRow(['Registros exportados', input.rows.length]);
  summary.addRow([]);
  summary.addRow(['Indicador', 'Valor']);
  styleHeader(summary.getRow(8));
  [
    ['Pago', totals.paidCents],
    ['A pagar programado', totals.plannedCents],
    ['A pagar sem programação', totals.unscheduledCents],
    ['Compromissos totais', totals.commitmentCents],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, centsToNumber(value as bigint)]);
    row.getCell(2).numFmt = MONEY_FORMAT;
  });

  const sheet = workbook.addWorksheet('Pagamentos', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { header: 'Situação', key: 'status', width: 24 },
    { header: 'Data / vencimento', key: 'date', width: 17 },
    { header: 'Origem', key: 'origin', width: 22 },
    { header: 'Referência', key: 'reference', width: 22 },
    { header: 'Fornecedor / prestador', key: 'supplier', width: 28 },
    { header: 'Item / serviço', key: 'description', width: 42 },
    { header: 'Loja(s)', key: 'stores', width: 38 },
    { header: 'UF', key: 'states', width: 12 },
    { header: 'Forma', key: 'method', width: 21 },
    { header: 'Identificação / parcela', key: 'installment', width: 28 },
    { header: 'Valor', key: 'amount', width: 17, style: { numFmt: MONEY_FORMAT } },
  ];
  styleHeader(sheet.getRow(1));

  input.rows.forEach((row) => {
    sheet.addRow({
      status: VIEW_LABELS[row.status],
      date: formatDate(row.date),
      origin: originLabel(row),
      reference: referenceLabel(row),
      supplier: row.supplierName,
      description: row.description,
      stores: storeLabel(row, storesById),
      states: row.states.join(', ') || '—',
      method: paymentMethodLabel(row),
      installment: row.sourceLabel || row.installmentLabel,
      amount: centsToNumber(row.amountCents),
    });
  });

  sheet.autoFilter = `A1:K${Math.max(1, sheet.rowCount)}`;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });

  const storesSheet = workbook.addWorksheet('Pagamentos por loja', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  storesSheet.columns = [
    { header: 'Situação', key: 'status', width: 24 },
    { header: 'Data / vencimento', key: 'date', width: 17 },
    { header: 'Loja', key: 'store', width: 32 },
    { header: 'Cidade', key: 'city', width: 22 },
    { header: 'UF', key: 'state', width: 9 },
    { header: 'Origem', key: 'origin', width: 24 },
    { header: 'Referência', key: 'reference', width: 22 },
    { header: 'Fornecedor / prestador', key: 'supplier', width: 28 },
    { header: 'Forma', key: 'method', width: 21 },
    { header: 'Identificação / parcela', key: 'installment', width: 28 },
    { header: 'Valor da loja', key: 'amount', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Observação', key: 'note', width: 34 },
  ];
  styleHeader(storesSheet.getRow(1));

  input.rows.forEach((row) => {
    row.storeAllocations.forEach((allocation) => {
      const store = storesById.get(allocation.storeId);
      storesSheet.addRow({
        status: VIEW_LABELS[row.status],
        date: formatDate(row.date),
        store: store ? `${store.code} · ${store.name}` : allocation.storeCode,
        city: store?.city || '—',
        state: store?.state || allocation.state || '—',
        origin: allocationOriginLabel(allocation),
        reference: referenceLabel(row),
        supplier: row.supplierName,
        method: paymentMethodLabel(row),
        installment: row.sourceLabel || row.installmentLabel,
        amount: centsToNumber(allocation.amountCents),
        note: 'Valor atribuído pelo custo real da loja na compra/serviço.',
      });
    });
    if (row.unallocatedCents > 0n) {
      storesSheet.addRow({
        status: VIEW_LABELS[row.status],
        date: formatDate(row.date),
        store: 'Não distribuído',
        city: '—',
        state: '—',
        origin: originLabel(row),
        reference: referenceLabel(row),
        supplier: row.supplierName,
        method: paymentMethodLabel(row),
        installment: row.sourceLabel || row.installmentLabel,
        amount: centsToNumber(row.unallocatedCents),
        note: 'Parcela sem distribuição de loja confirmada; não atribuída artificialmente.',
      });
    }
  });

  storesSheet.autoFilter = `A1:L${Math.max(1, storesSheet.rowCount)}`;
  storesSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });

  return workbook.xlsx.writeBuffer();
}

export async function createFinanceUnifiedPaymentsPdf(
  input: FinanceUnifiedPaymentsExportInput,
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const totals = financePaymentTotals(input.summaryRows);
  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  document.setTextColor(31, 111, 92);
  document.setFontSize(16);
  document.text('Implanta 27', 12, 13);
  document.setTextColor(30, 34, 32);
  document.setFontSize(12);
  document.text(`Financeiro · Pagamentos · ${VIEW_LABELS[input.view]}`, 12, 20);
  document.setFontSize(7.2);
  document.text(`Gerado em: ${formatDateTime(input.generatedAt)}`, 12, 26);
  document.text(`Filtros: ${input.filtersText || 'Todos'}`, 12, 31, { maxWidth: 270 });
  document.text(
    `Pago: ${formatCurrency(totals.paidCents)}   |   Programado: ${formatCurrency(totals.plannedCents)}   |   Sem programação: ${formatCurrency(totals.unscheduledCents)}   |   Total: ${formatCurrency(totals.commitmentCents)}`,
    12,
    36,
    { maxWidth: 270 },
  );
  document.text(`${input.rows.length} registro(s) na visualização exportada`, 12, 40);

  autoTable(document, {
    startY: 44,
    theme: 'striped',
    head: [[
      'Data',
      'Origem',
      'Referência',
      'Fornecedor / prestador',
      'Item / serviço',
      'Loja / UF',
      'Forma / parcela',
      'Valor',
    ]],
    body: input.rows.map((row) => [
      formatDate(row.date),
      originLabel(row),
      referenceLabel(row),
      row.supplierName,
      row.description,
      `${storeLabel(row, storesById)}\n${row.states.join(', ') || '—'}`,
      `${paymentMethodLabel(row)}\n${row.sourceLabel || row.installmentLabel}`,
      formatCurrency(row.amountCents),
    ]),
    headStyles: { fillColor: [31, 111, 92], fontSize: 6.1 },
    styles: { fontSize: 5.6, cellPadding: 1.35, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 26 },
      2: { cellWidth: 30 },
      3: { cellWidth: 34 },
      4: { cellWidth: 52 },
      5: { cellWidth: 50 },
      6: { cellWidth: 40 },
      7: { cellWidth: 24, halign: 'right' },
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

export async function downloadFinanceUnifiedPaymentsExcel(input: FinanceUnifiedPaymentsExportInput) {
  const bytes = await createFinanceUnifiedPaymentsWorkbook(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-pagamentos-${input.view}-${fileStamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadFinanceUnifiedPaymentsPdf(input: FinanceUnifiedPaymentsExportInput) {
  const bytes = await createFinanceUnifiedPaymentsPdf(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/pdf' }),
    `financeiro-pagamentos-${input.view}-${fileStamp(input.generatedAt)}.pdf`,
  );
}
