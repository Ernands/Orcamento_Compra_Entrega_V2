import type {
  FinanceAccountConsolidated,
  FinanceAccountDaySummary,
  FinanceAccountManualEntry,
  FinanceAccountPaymentEvent,
} from '../../domain/finance-account-reconciliation';

const HEADER_FILL = 'FF1F6F5C';
const HEADER_TEXT = 'FFFFFFFF';
const MONEY_FORMAT = 'R$ #,##0.00';

export interface FinanceAccountReconciliationExportInput {
  days: FinanceAccountDaySummary[];
  consolidated: FinanceAccountConsolidated;
  generatedAt: Date;
  filtersText: string;
}

function numberValue(value: bigint | null): number | null {
  return value === null ? null : Number(value) / 100;
}

function currency(value: bigint | null): string {
  if (value === null) return 'Não informado';
  return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateLabel(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function statusLabel(status: FinanceAccountDaySummary['status']): string {
  return status === 'reconciled' ? 'Conciliado' : status === 'divergent' ? 'Divergente' : 'Pendente de conferência';
}

function entryTypeLabel(entry: FinanceAccountManualEntry): string {
  if (entry.type === 'investment') return 'Investimento';
  return entry.type === 'adjustment_credit' ? 'Acerto positivo' : 'Acerto negativo';
}

function styleHeader(row: { eachCell: (callback: (cell: { fill: unknown; font: unknown; alignment: unknown }) => void) => void }) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stamp(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
    '-',
    String(value.getHours()).padStart(2, '0'),
    String(value.getMinutes()).padStart(2, '0'),
  ].join('');
}

export async function createFinanceAccountReconciliationWorkbook(
  input: FinanceAccountReconciliationExportInput,
): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;

  const summary = workbook.addWorksheet('Resumo');
  summary.columns = [{ key: 'label', width: 34 }, { key: 'value', width: 28 }];
  summary.addRow(['Implanta 27 · Financeiro']);
  summary.mergeCells('A1:B1');
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  summary.addRow(['Relatório', 'Conciliação Conta']);
  summary.addRow(['Gerado em', dateTime(input.generatedAt)]);
  summary.addRow(['Filtros', input.filtersText || 'Todos']);
  summary.addRow([]);
  summary.addRow(['Indicador', 'Valor']);
  styleHeader(summary.getRow(6));
  [
    ['Investimento acumulado', input.consolidated.investmentCents],
    ['Pagamentos do sistema', input.consolidated.systemPaymentsCents],
    ['Acertos positivos', input.consolidated.adjustmentCreditCents],
    ['Acertos negativos', input.consolidated.adjustmentDebitCents],
    ['Saldo esperado', input.consolidated.expectedBalanceCents],
    ['Saldo informado BB', input.consolidated.actualBalanceCents],
    ['Diferença da conta', input.consolidated.balanceDifferenceCents],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, numberValue(value as bigint | null)]);
    row.getCell(2).numFmt = MONEY_FORMAT;
  });
  summary.addRow(['Último saldo BB', dateLabel(input.consolidated.actualBalanceDate)]);
  summary.addRow(['Dias conciliados', input.consolidated.reconciledDays]);
  summary.addRow(['Dias divergentes', input.consolidated.divergentDays]);
  summary.addRow(['Dias pendentes', input.consolidated.pendingDays]);

  const daily = workbook.addWorksheet('Conciliação diária', { views: [{ state: 'frozen', ySplit: 1 }] });
  daily.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Investimentos', key: 'investment', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Pagamentos sistema', key: 'system', width: 20, style: { numFmt: MONEY_FORMAT } },
    { header: 'Conta BB informado', key: 'bank', width: 20, style: { numFmt: MONEY_FORMAT } },
    { header: 'Acertos +', key: 'credit', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Acertos -', key: 'debit', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Diferença', key: 'difference', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Saldo esperado', key: 'expected', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Saldo BB', key: 'balance', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Diferença saldo', key: 'balanceDiff', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Situação', key: 'status', width: 24 },
  ];
  styleHeader(daily.getRow(1));
  input.days.forEach((day) => daily.addRow({
    date: dateLabel(day.date),
    investment: numberValue(day.investmentCents),
    system: numberValue(day.systemPaymentsCents),
    bank: numberValue(day.bankPaymentsCents),
    credit: numberValue(day.adjustmentCreditCents),
    debit: numberValue(day.adjustmentDebitCents),
    difference: numberValue(day.differenceCents),
    expected: numberValue(day.expectedBalanceCents),
    balance: numberValue(day.bankBalanceCents),
    balanceDiff: numberValue(day.balanceDifferenceCents),
    status: statusLabel(day.status),
  }));

  const payments = workbook.addWorksheet('Pagamentos', { views: [{ state: 'frozen', ySplit: 1 }] });
  payments.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Referência', key: 'reference', width: 22 },
    { header: 'Fornecedor / prestador', key: 'counterpart', width: 28 },
    { header: 'Descrição', key: 'description', width: 45 },
    { header: 'Forma', key: 'method', width: 20 },
    { header: 'Identificação', key: 'source', width: 28 },
    { header: 'Lojas', key: 'stores', width: 35 },
    { header: 'UF', key: 'states', width: 12 },
    { header: 'Valor', key: 'amount', width: 18, style: { numFmt: MONEY_FORMAT } },
  ];
  styleHeader(payments.getRow(1));
  input.days.flatMap((day) => day.payments).forEach((payment: FinanceAccountPaymentEvent) => payments.addRow({
    date: dateLabel(payment.date),
    reference: payment.reference,
    counterpart: payment.counterpart,
    description: payment.description,
    method: payment.paymentMethod || 'Não informada',
    source: payment.sourceLabel || '—',
    stores: payment.storeCodes.join(', ') || '—',
    states: payment.states.join(', ') || '—',
    amount: numberValue(payment.amountCents),
  }));

  const adjustments = workbook.addWorksheet('Acertos', { views: [{ state: 'frozen', ySplit: 1 }] });
  adjustments.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Tipo', key: 'type', width: 18 },
    { header: 'Motivo', key: 'reason', width: 42 },
    { header: 'Observação', key: 'notes', width: 42 },
    { header: 'Valor', key: 'amount', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Arquivos', key: 'files', width: 12 },
  ];
  styleHeader(adjustments.getRow(1));
  input.days.flatMap((day) => day.entries)
    .filter((entry) => entry.type !== 'investment')
    .forEach((entry) => adjustments.addRow({
      date: dateLabel(entry.date),
      type: entryTypeLabel(entry),
      reason: entry.reason,
      notes: entry.notes || '—',
      amount: numberValue(entry.amountCents),
      files: entry.attachments.length,
    }));

  const investments = workbook.addWorksheet('Investimentos', { views: [{ state: 'frozen', ySplit: 1 }] });
  investments.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Motivo / identificação', key: 'reason', width: 42 },
    { header: 'Observação', key: 'notes', width: 42 },
    { header: 'Valor', key: 'amount', width: 18, style: { numFmt: MONEY_FORMAT } },
    { header: 'Arquivos', key: 'files', width: 12 },
  ];
  styleHeader(investments.getRow(1));
  input.days.flatMap((day) => day.entries)
    .filter((entry) => entry.type === 'investment')
    .forEach((entry) => investments.addRow({
      date: dateLabel(entry.date),
      reason: entry.reason,
      notes: entry.notes || '—',
      amount: numberValue(entry.amountCents),
      files: entry.attachments.length,
    }));

  return workbook.xlsx.writeBuffer();
}

export async function createFinanceAccountReconciliationPdf(
  input: FinanceAccountReconciliationExportInput,
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
  document.text('Financeiro · Conciliação Conta', 12, 20);
  document.setFontSize(7.2);
  document.text(`Gerado em: ${dateTime(input.generatedAt)}`, 12, 26);
  document.text(`Filtros: ${input.filtersText || 'Todos'}`, 12, 31, { maxWidth: 270 });
  document.text(
    `Investido: ${currency(input.consolidated.investmentCents)} | Pago: ${currency(input.consolidated.systemPaymentsCents)} | Saldo esperado: ${currency(input.consolidated.expectedBalanceCents)} | Saldo BB: ${currency(input.consolidated.actualBalanceCents)} | Diferença: ${currency(input.consolidated.balanceDifferenceCents)}`,
    12, 36, { maxWidth: 270 },
  );

  autoTable(document, {
    startY: 42,
    theme: 'striped',
    head: [[
      'Data', 'Invest.', 'Pag. sistema', 'Conta BB', 'Acertos +', 'Acertos -',
      'Diferença', 'Saldo esperado', 'Saldo BB', 'Situação',
    ]],
    body: input.days.map((day) => [
      dateLabel(day.date),
      currency(day.investmentCents),
      currency(day.systemPaymentsCents),
      currency(day.bankPaymentsCents),
      currency(day.adjustmentCreditCents),
      currency(day.adjustmentDebitCents),
      currency(day.differenceCents),
      currency(day.expectedBalanceCents),
      currency(day.bankBalanceCents),
      statusLabel(day.status),
    ]),
    headStyles: { fillColor: [31, 111, 92], fontSize: 6.2 },
    styles: { fontSize: 5.8, cellPadding: 1.35, valign: 'middle' },
    margin: { left: 7, right: 7, bottom: 10 },
  });

  return document.output('arraybuffer');
}

export async function downloadFinanceAccountReconciliationExcel(input: FinanceAccountReconciliationExportInput) {
  const bytes = await createFinanceAccountReconciliationWorkbook(input);
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `financeiro-conciliacao-conta-${stamp(input.generatedAt)}.xlsx`,
  );
}

export async function downloadFinanceAccountReconciliationPdf(input: FinanceAccountReconciliationExportInput) {
  const bytes = await createFinanceAccountReconciliationPdf(input);
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `financeiro-conciliacao-conta-${stamp(input.generatedAt)}.pdf`);
}
