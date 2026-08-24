import { calculateQuoteLine, calculateQuoteTotals } from '../../domain/supply-calculations';
import {
  getEffectiveSupplyQuoteStatus,
  SUPPLY_QUOTE_STATUS_LABELS,
} from '../../domain/supply-quote-status';
import type { QuoteSummary } from '../../domain/supply-quote-summary';
import type { SupplyQuote } from '../../domain/types';

export interface QuoteSummaryFilters {
  search: string;
  status: string;
  store: string;
  category?: string;
  area?: string;
  states?: string[];
  allocationMode?: 'original' | 'allocated';
}

export interface QuoteSummaryExportInput {
  quotes: SupplyQuote[];
  summary: QuoteSummary;
  filters: QuoteSummaryFilters;
  generatedAt: Date;
}

const HEADER_COLOR = 'FF1F6F5C';
const HEADER_TEXT_COLOR = 'FFFFFFFF';
const LIGHT_FILL = 'FFEAF3F0';
const MONEY_FORMAT = 'R$ #,##0.00';

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
}

function formatDate(value: string | null): string {
  if (!value) return 'Nao informada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function filtersAsText(filters: QuoteSummaryFilters): string {
  const parts = [
    `Pesquisa: ${filters.search || 'Todas'}`,
    `Status: ${filters.status || 'Todos'}`,
    `Loja: ${filters.store || 'Todas'}`,
  ];

  if (filters.category) parts.push(`Categoria: ${filters.category}`);
  if (filters.area) parts.push(`Area: ${filters.area}`);

  if (filters.states) {
    parts.push(`UFs: ${filters.states.length ? filters.states.join(', ') : 'Todas'}`);
  }
  if (filters.allocationMode) {
    parts.push(`Valores: ${filters.allocationMode === 'allocated' ? 'Rateados' : 'Originais'}`);
  }

  return parts.join(' | ');
}

function styleHeader(row: {
  eachCell: (
    callback: (cell: { fill: unknown; font: unknown; alignment: unknown }) => void,
  ) => void;
}) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT_COLOR } };
    cell.alignment = { vertical: 'middle' };
  });
}

export async function createQuoteSummaryWorkbook(
  input: QuoteSummaryExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const summarySheet = workbook.addWorksheet('Resumo', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  summarySheet.columns = [
    { key: 'label', width: 34 },
    { key: 'value', width: 24 },
  ];
  summarySheet.addRow(['Implanta 27', 'Resumo de Cotacoes']);
  summarySheet.mergeCells('A1:B1');
  summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_COLOR } };
  summarySheet.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summarySheet.addRow(['Filtros aplicados', filtersAsText(input.filters)]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Indicador', 'Valor']);
  styleHeader(summarySheet.getRow(5));
  summarySheet.addRow(['Total de cotacoes', input.summary.totalQuotes]);
  summarySheet.addRow(['Total de itens', input.summary.totalItems]);
  summarySheet.addRow(['Total valor unitario', centsToNumber(input.summary.totalUnitPriceCents)]);
  summarySheet.addRow(['Total de frete', centsToNumber(input.summary.totalShippingCents)]);
  summarySheet.addRow(['Valor total das cotacoes', centsToNumber(input.summary.totalValueCents)]);
  summarySheet.addRow(['Cotacoes por loja', input.summary.storeQuotes]);
  summarySheet.addRow(['Cotacoes consolidadas', input.summary.consolidatedQuotes]);
  summarySheet.getCell('B8').numFmt = MONEY_FORMAT;
  summarySheet.getCell('B9').numFmt = MONEY_FORMAT;
  summarySheet.getCell('B10').numFmt = MONEY_FORMAT;
  summarySheet.getRow(10).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: LIGHT_FILL },
  };

  const quotesSheet = workbook.addWorksheet('Cotacoes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  quotesSheet.columns = [
    { header: 'Codigo', key: 'code', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Contexto', key: 'context', width: 16 },
    { header: 'Fornecedor', key: 'supplier', width: 28 },
    { header: 'Canal', key: 'channel', width: 18 },
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Validade', key: 'validity', width: 14 },
    { header: 'Lojas', key: 'stores', width: 34 },
    { header: 'Quantidade de itens', key: 'itemCount', width: 20 },
    { header: 'Valor total', key: 'total', width: 18, style: { numFmt: MONEY_FORMAT } },
  ];
  styleHeader(quotesSheet.getRow(1));
  input.quotes.forEach((quote) => {
    quotesSheet.addRow({
      code: quote.code,
      status: SUPPLY_QUOTE_STATUS_LABELS[getEffectiveSupplyQuoteStatus(quote)],
      context: quote.contextType === 'store' ? 'Por loja' : 'Consolidada',
      supplier: quote.supplierName,
      channel: quote.channel,
      date: formatDate(quote.quoteDate),
      validity: formatDate(quote.validUntil),
      stores: quote.stores.map((store) => store.code).join(', '),
      itemCount: quote.items.length,
      total: centsToNumber(calculateQuoteTotals(quote.items).totalCents),
    });
  });
  quotesSheet.autoFilter = `A1:J${Math.max(1, quotesSheet.rowCount)}`;

  const itemsSheet = workbook.addWorksheet('Itens', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  itemsSheet.columns = [
    { header: 'Cotacao', key: 'quote', width: 16 },
    { header: 'Fornecedor', key: 'supplier', width: 26 },
    { header: 'Item', key: 'item', width: 34 },
    { header: 'Loja', key: 'store', width: 18 },
    { header: 'Quantidade', key: 'quantity', width: 14 },
    { header: 'Unidade', key: 'unit', width: 12 },
    { header: 'Valor unitario', key: 'unitPrice', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Desconto', key: 'discount', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Frete', key: 'shipping', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Outros custos', key: 'otherCosts', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Valor total', key: 'total', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Prazo', key: 'delivery', width: 14 },
    { header: 'URL do produto', key: 'url', width: 42 },
  ];
  styleHeader(itemsSheet.getRow(1));
  input.quotes.forEach((quote) => {
    quote.items.forEach((item) => {
      const calculation = calculateQuoteLine(item);
      itemsSheet.addRow({
        quote: quote.code,
        supplier: quote.supplierName,
        item: `${item.itemCode} - ${item.itemName}`,
        store: item.storeCode || 'Consolidado / Nao distribuido',
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discountAmount),
        shipping:
          item.shippingType === 'pending' ? null : centsToNumber(calculation.shippingCents || 0n),
        otherCosts: Number(item.otherCosts),
        total: centsToNumber(calculation.totalCents),
        delivery: item.deliveryDays === null ? 'Nao informado' : `${item.deliveryDays} dias`,
        url: item.productUrl || '',
      });
    });
  });
  itemsSheet.autoFilter = `A1:M${Math.max(1, itemsSheet.rowCount)}`;

  const storesSheet = workbook.addWorksheet('Totais por loja', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  storesSheet.columns = [
    { header: 'Loja', key: 'store', width: 38 },
    { header: 'UF', key: 'state', width: 9 },
    { header: 'Quantidade de cotacoes', key: 'quoteCount', width: 24 },
    { header: 'Quantidade de itens', key: 'itemCount', width: 22 },
    { header: 'Frete', key: 'shipping', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Valor total', key: 'total', width: 20, style: { numFmt: MONEY_FORMAT } },
  ];
  styleHeader(storesSheet.getRow(1));
  input.summary.totalsByStore.forEach((row) => {
    storesSheet.addRow({
      store: row.label,
      state: row.state || '',
      quoteCount: row.quoteCount,
      itemCount: row.itemCount,
      shipping: centsToNumber(row.shippingCents),
      total: centsToNumber(row.totalCents),
    });
  });
  storesSheet.autoFilter = `A1:F${Math.max(1, storesSheet.rowCount)}`;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

export async function createQuoteSummaryPdf(input: QuoteSummaryExportInput): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  document.setTextColor(31, 111, 92);
  document.setFontSize(16);
  document.text('Implanta 27', 14, 16);
  document.setTextColor(30, 34, 32);
  document.setFontSize(13);
  document.text('Resumo de Cotacoes', 14, 24);
  document.setFontSize(8);
  document.text(`Gerado em: ${formatDateTime(input.generatedAt)}`, 14, 31);
  document.text(filtersAsText(input.filters), 14, 36, { maxWidth: 182 });

  autoTable(document, {
    startY: 42,
    theme: 'grid',
    head: [['Indicador', 'Valor']],
    body: [
      ['Total de cotacoes', String(input.summary.totalQuotes)],
      ['Total de itens', String(input.summary.totalItems)],
      [
        'Total valor unitario',
        centsToNumber(input.summary.totalUnitPriceCents).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }),
      ],
      [
        'Total de frete',
        centsToNumber(input.summary.totalShippingCents).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }),
      ],
      [
        'Valor total das cotacoes',
        centsToNumber(input.summary.totalValueCents).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }),
      ],
      ['Cotacoes por loja', String(input.summary.storeQuotes)],
      ['Cotacoes consolidadas', String(input.summary.consolidatedQuotes)],
    ],
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 9 },
  });

  autoTable(document, {
    startY: 108,
    theme: 'striped',
    head: [['Loja', 'UF', 'Cotacoes', 'Itens', 'Frete', 'Valor total']],
    body: input.summary.totalsByStore.map((row) => [
      row.label,
      row.state || '',
      String(row.quoteCount),
      String(row.itemCount),
      centsToNumber(row.shippingCents).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      centsToNumber(row.totalCents).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    ]),
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 10 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { top: 16, bottom: 14 },
    didDrawPage: (data) => {
      document.setFontSize(7);
      document.setTextColor(90, 96, 92);
      document.text(`Pagina ${data.pageNumber}`, 196, 289, { align: 'right' });
    },
  });

  return document.output('arraybuffer');
}

export function quoteSummaryFileStamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `${parts.join('-')}-${time}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadQuoteSummaryExcel(input: QuoteSummaryExportInput): Promise<void> {
  const bytes = await createQuoteSummaryWorkbook(input);
  downloadBlob(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `resumo-cotacoes-${quoteSummaryFileStamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadQuoteSummaryPdf(input: QuoteSummaryExportInput): Promise<void> {
  const bytes = await createQuoteSummaryPdf(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/pdf' }),
    `resumo-cotacoes-${quoteSummaryFileStamp(input.generatedAt)}.pdf`,
  );
}
