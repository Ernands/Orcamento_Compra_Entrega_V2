import type { FinanceUnifiedPaymentsExportInput } from './finance-unified-payments-exports';
import { createFinanceUnifiedPaymentsWorkbook } from './finance-unified-payments-exports';

const HEADER_FILL = 'FF1F6F5C';
const HEADER_TEXT = 'FFFFFFFF';
const MONEY_FORMAT = 'R$ #,##0.00';

const VIEW_LABELS = {
  paid: 'PAGO',
  planned: 'A PAGAR PROGRAMADO',
  unscheduled: 'A PAGAR SEM PROGRAMAÇÃO',
} as const;

interface StoreSummaryRow {
  storeId: string;
  label: string;
  worksCents: bigint;
  equipmentCents: bigint;
  furnitureCents: bigint;
  totalCents: bigint;
}

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
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

function storeSummaryRows(input: FinanceUnifiedPaymentsExportInput): StoreSummaryRow[] {
  const storesById = new Map(input.stores.map((store) => [store.id, store]));
  const result = new Map<string, StoreSummaryRow>();

  input.rows.forEach((payment) => {
    payment.storeAllocations.forEach((allocation) => {
      const store = storesById.get(allocation.storeId);
      const fallbackLocation = store?.city || store?.name || allocation.storeCode;
      const label = store
        ? `${store.code} · ${fallbackLocation.toLocaleUpperCase('pt-BR')} - ${store.state}`
        : `${allocation.storeCode} · ${allocation.state || 'UF não informada'}`;
      const current = result.get(allocation.storeId) || {
        storeId: allocation.storeId,
        label,
        worksCents: 0n,
        equipmentCents: 0n,
        furnitureCents: 0n,
        totalCents: 0n,
      };

      current.worksCents += allocation.originAllocations.works;
      current.equipmentCents += allocation.originAllocations.equipment;
      current.furnitureCents += allocation.originAllocations.furniture;
      current.totalCents += allocation.amountCents;
      result.set(allocation.storeId, current);
    });
  });

  return [...result.values()].sort((a, b) => {
    if (a.totalCents === b.totalCents) return a.label.localeCompare(b.label, 'pt-BR');
    return a.totalCents > b.totalCents ? -1 : 1;
  });
}

export async function createFinanceUnifiedPaymentsWorkbookWithStoreSummary(
  input: FinanceUnifiedPaymentsExportInput,
): Promise<ArrayBuffer> {
  const [baseBytes, { Workbook }] = await Promise.all([
    createFinanceUnifiedPaymentsWorkbook(input),
    import('exceljs'),
  ]);
  const workbook = new Workbook();
  await workbook.xlsx.load(baseBytes);

  const summary = workbook.getWorksheet('Resumo');
  if (!summary) return baseBytes;

  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 22;
  summary.getColumn(3).width = 22;
  summary.getColumn(4).width = 22;
  summary.getColumn(5).width = 22;

  const detailRows = storeSummaryRows(input);
  const titleRowNumber = Math.max(14, summary.rowCount + 2);
  const headerRowNumber = titleRowNumber + 1;

  summary.mergeCells(titleRowNumber, 1, titleRowNumber, 5);
  const titleCell = summary.getCell(titleRowNumber, 1);
  titleCell.value = VIEW_LABELS[input.view];
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  titleCell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 12 };
  titleCell.alignment = { vertical: 'middle' };

  const headerRow = summary.getRow(headerRowNumber);
  ['LOJA', 'Obras e Serviços', 'Equipamentos', 'Mobiliário', 'Valor Total'].forEach((value, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = value;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  detailRows.forEach((entry, index) => {
    const row = summary.getRow(headerRowNumber + 1 + index);
    row.getCell(1).value = entry.label;
    row.getCell(2).value = centsToNumber(entry.worksCents);
    row.getCell(3).value = centsToNumber(entry.equipmentCents);
    row.getCell(4).value = centsToNumber(entry.furnitureCents);
    row.getCell(5).value = centsToNumber(entry.totalCents);
    [2, 3, 4, 5].forEach((column) => {
      row.getCell(column).numFmt = MONEY_FORMAT;
    });
  });

  const unallocatedCents = input.rows.reduce((sum, payment) => sum + payment.unallocatedCents, 0n);
  if (unallocatedCents > 0n) {
    const row = summary.getRow(headerRowNumber + 1 + detailRows.length);
    row.getCell(1).value = 'NÃO DISTRIBUÍDO';
    row.getCell(5).value = centsToNumber(unallocatedCents);
    row.getCell(5).numFmt = MONEY_FORMAT;
    row.getCell(1).font = { italic: true };
    row.getCell(5).font = { italic: true };
  }

  summary.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  summary.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  return workbook.xlsx.writeBuffer();
}

export async function downloadFinanceUnifiedPaymentsExcelWithStoreSummary(
  input: FinanceUnifiedPaymentsExportInput,
) {
  const bytes = await createFinanceUnifiedPaymentsWorkbookWithStoreSummary(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-pagamentos-${input.view}-${fileStamp(input.generatedAt)}.xlsx`,
  );
}
