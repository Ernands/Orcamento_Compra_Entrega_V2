import { calculateQuoteLine, calculateQuoteTotals } from '../../domain/supply-calculations';
import {
  getEffectiveSupplyQuoteStatus,
  SUPPLY_QUOTE_STATUS_LABELS,
} from '../../domain/supply-quote-status';
import type { QuoteAllocationSource, QuoteSummary } from '../../domain/supply-quote-summary';
import type { SupplyQuote } from '../../domain/types';

export interface QuoteSummaryFilters {
  search: string;
  status: string;
  store: string;
  category?: string;
  area?: string;
  states?: string[];
  allocationMode?: 'original' | 'allocated';
  priceMode?: string;
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
const PERCENT_FORMAT = '0.00%';

const SOURCE_LABELS: Record<QuoteAllocationSource, string> = {
  destination_profile: 'Destino real - Prospector/UF',
  direct_store: 'Loja direta',
  legacy_fallback: 'Fallback igualitario',
  unallocated: 'Sem cobertura',
};

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
}

function quantityToNumber(value: bigint): number {
  return Number(value) / 1000;
}

function sourceLabels(sources: QuoteAllocationSource[]): string {
  return sources.map((source) => SOURCE_LABELS[source]).join(' + ');
}

function formatMoney(value: bigint): string {
  return centsToNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatPercentFromBasisPoints(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 10000);
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
  if (filters.priceMode) parts.push(`Precos: ${filters.priceMode}`);

  if (filters.states) {
    parts.push(`UFs: ${filters.states.length ? filters.states.join(', ') : 'Todas'}`);
  }
  if (filters.allocationMode) {
    parts.push(
      `Legado sem destino: ${filters.allocationMode === 'allocated' ? 'Rateado' : 'Nao rateado'}`,
    );
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
    { key: 'label', width: 38 },
    { key: 'value', width: 28 },
  ];
  summarySheet.addRow(['Implanta 27', 'Resumo de Cotacoes']);
  summarySheet.mergeCells('A1:B1');
  summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_COLOR } };
  summarySheet.addRow(['Gerado em', formatDateTime(input.generatedAt)]);
  summarySheet.addRow(['Filtros aplicados', filtersAsText(input.filters)]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Indicador', 'Valor']);
  styleHeader(summarySheet.getRow(5));
  summarySheet.addRow(['Total de cotacoes', input.summary.inputQuoteCount]);
  summarySheet.addRow(['Cotacoes consideradas nos valores', input.summary.totalQuotes]);
  summarySheet.addRow(['Valor dos produtos', centsToNumber(input.summary.totalProductsCents)]);
  summarySheet.addRow(['Total de frete', centsToNumber(input.summary.totalShippingCents)]);
  summarySheet.addRow(['Valor total das cotacoes', centsToNumber(input.summary.totalValueCents)]);
  summarySheet.addRow(['Descontos', centsToNumber(input.summary.totalDiscountCents)]);
  summarySheet.addRow(['Outros custos', centsToNumber(input.summary.totalOtherCostsCents)]);
  summarySheet.addRow(['Lojas cobertas', input.summary.totalStores]);
  summarySheet.addRow(['Destinos no resumo', input.summary.totalDestinations]);
  summarySheet.addRow(['Cobertura real', input.summary.coverage.realCoverageBasisPoints / 10000]);
  summarySheet.addRow(['Fallback legado', centsToNumber(input.summary.coverage.legacyFallbackCents)]);
  summarySheet.addRow(['Sem cobertura', centsToNumber(input.summary.coverage.unallocatedCents)]);
  summarySheet.addRow(['Cotacoes por loja', input.summary.storeQuotes]);
  summarySheet.addRow(['Cotacoes consolidadas', input.summary.consolidatedQuotes]);
  summarySheet.addRow(['Fretes pendentes', input.summary.shippingPendingCount]);
  ['B8', 'B9', 'B10', 'B11', 'B12', 'B16', 'B17'].forEach((cell) => {
    summarySheet.getCell(cell).numFmt = MONEY_FORMAT;
  });
  summarySheet.getCell('B15').numFmt = PERCENT_FORMAT;
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

  const destinationsSheet = workbook.addWorksheet('Prospector UF', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  destinationsSheet.columns = [
    { header: 'Destino', key: 'destination', width: 36 },
    { header: 'UF', key: 'state', width: 9 },
    { header: 'Lojas', key: 'storeCount', width: 10 },
    { header: 'Cotacoes', key: 'quoteCount', width: 12 },
    { header: 'Itens', key: 'itemCount', width: 10 },
    { header: 'Quantidade', key: 'quantity', width: 14 },
    { header: 'Produtos', key: 'products', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Descontos', key: 'discounts', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Outros custos', key: 'otherCosts', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Frete', key: 'shipping', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Valor total', key: 'total', width: 20, style: { numFmt: MONEY_FORMAT } },
    { header: 'Cobertura', key: 'source', width: 32 },
  ];
  styleHeader(destinationsSheet.getRow(1));
  input.summary.totalsByDestination.forEach((row) => {
    destinationsSheet.addRow({
      destination: row.label,
      state: row.state || '',
      storeCount: row.storeCount,
      quoteCount: row.quoteCount,
      itemCount: row.itemCount,
      quantity: quantityToNumber(row.quantityThousandths),
      products: centsToNumber(row.productCents),
      discounts: centsToNumber(row.discountCents),
      otherCosts: centsToNumber(row.otherCostsCents),
      shipping: centsToNumber(row.shippingCents),
      total: centsToNumber(row.totalCents),
      source: sourceLabels(row.sources),
    });
  });
  destinationsSheet.autoFilter = `A1:L${Math.max(1, destinationsSheet.rowCount)}`;

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
    { header: 'Quantidade', key: 'quantity', width: 14 },
    { header: 'Produtos', key: 'products', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Descontos', key: 'discounts', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Outros custos', key: 'otherCosts', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Origem', key: 'source', width: 32 },
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
      quantity: quantityToNumber(row.quantityThousandths),
      products: centsToNumber(row.productCents),
      discounts: centsToNumber(row.discountCents),
      otherCosts: centsToNumber(row.otherCostsCents),
      source: sourceLabels(row.sources),
    });
  });
  storesSheet.autoFilter = `A1:K${Math.max(1, storesSheet.rowCount)}`;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

interface AutoTableAwareDocument {
  lastAutoTable?: { finalY: number };
}

export async function createQuoteSummaryPdf(input: QuoteSummaryExportInput): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const autoTableDocument = document as typeof document & AutoTableAwareDocument;
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
      ['Total de cotacoes', String(input.summary.inputQuoteCount)],
      ['Cotacoes consideradas nos valores', String(input.summary.totalQuotes)],
      ['Valor dos produtos', formatMoney(input.summary.totalProductsCents)],
      ['Total de frete', formatMoney(input.summary.totalShippingCents)],
      ['Valor total das cotacoes', formatMoney(input.summary.totalValueCents)],
      ['Descontos', formatMoney(input.summary.totalDiscountCents)],
      ['Outros custos', formatMoney(input.summary.totalOtherCostsCents)],
      ['Lojas cobertas', String(input.summary.totalStores)],
      ['Destinos', String(input.summary.totalDestinations)],
      ['Cobertura real', formatPercentFromBasisPoints(input.summary.coverage.realCoverageBasisPoints)],
      ['Fallback legado', formatMoney(input.summary.coverage.legacyFallbackCents)],
      ['Sem cobertura', formatMoney(input.summary.coverage.unallocatedCents)],
    ],
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 8.5 },
  });

  let nextStartY = (autoTableDocument.lastAutoTable?.finalY || 118) + 7;
  if (nextStartY > 235) {
    document.addPage();
    nextStartY = 16;
  }

  autoTable(document, {
    startY: nextStartY,
    theme: 'striped',
    head: [['Prospector / destino', 'UF', 'Lojas', 'Produtos', 'Frete', 'Total']],
    body: input.summary.totalsByDestination.map((row) => [
      row.label,
      row.state || '',
      String(row.storeCount),
      formatMoney(row.productCents),
      formatMoney(row.shippingCents),
      formatMoney(row.totalCents),
    ]),
    headStyles: { fillColor: [31, 111, 92] },
    styles: { fontSize: 7.2, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 10 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { top: 16, bottom: 14 },
  });

  nextStartY = (autoTableDocument.lastAutoTable?.finalY || 118) + 7;
  if (nextStartY > 235) {
    document.addPage();
    nextStartY = 16;
  }

  autoTable(document, {
    startY: nextStartY,
    theme: 'striped',
    head: [['Loja', 'UF', 'Cotacoes', 'Itens', 'Frete', 'Valor total']],
    body: input.summary.totalsByStore.map((row) => [
      row.label,
      row.state || '',
      String(row.quoteCount),
      String(row.itemCount),
      formatMoney(row.shippingCents),
      formatMoney(row.totalCents),
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
