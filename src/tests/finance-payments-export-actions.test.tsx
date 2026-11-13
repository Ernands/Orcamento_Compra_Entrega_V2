import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceUnifiedPaymentsExportActions } from '../components/finance-unified-payments-export-actions';
import type { FinanceUnifiedPaymentsExportInput } from '../data/exports/finance-unified-payments-exports';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), excel: vi.fn() }));
vi.mock('../data/exports/finance-unified-payments-exports', () => ({
  downloadFinanceUnifiedPaymentsPdf: mocks.pdf,
}));
vi.mock('../data/exports/finance-unified-payments-store-summary-export', () => ({
  downloadFinanceUnifiedPaymentsExcelWithStoreSummary: mocks.excel,
}));

function renderActions(overrides: {
  rows?: UnifiedFinancePaymentRow[];
  summaryRows?: UnifiedFinancePaymentRow[];
  occurrenceValuesOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const rows = overrides.rows ?? Array.from({ length: 125 }, (_, i) => ({
    id: 'payment-' + i,
  }) as UnifiedFinancePaymentRow);
  const summaryRows = overrides.summaryRows ?? rows;
  const onError = vi.fn();
  render(
    <FinanceUnifiedPaymentsExportActions
      rows={rows}
      summaryRows={summaryRows}
      stores={[]}
      view="paid"
      originFilter=""
      storeFilter=""
      stateFilter="CE"
      supplierFilter=""
      methodFilter=""
      dateFrom={overrides.dateFrom ?? '2026-09-30'}
      dateTo={overrides.dateTo ?? '2026-09-30'}
      occurrenceValuesOnly={overrides.occurrenceValuesOnly ?? true}
      query="CMP"
      hasDeepFilter={false}
      onError={onError}
    />,
  );
  return { rows, summaryRows, onError };
}

beforeEach(() => {
  mocks.pdf.mockReset().mockResolvedValue(undefined);
  mocks.excel.mockReset().mockResolvedValue(undefined);
});

describe('exportações de Pagamentos — conferência funcional', () => {
  it('exporta todas as 125 linhas filtradas, não somente a primeira página de 50', async () => {
    const { rows, summaryRows } = renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(mocks.excel).toHaveBeenCalledTimes(1));
    const input = mocks.excel.mock.calls[0][0] as FinanceUnifiedPaymentsExportInput;
    expect(input.rows).toBe(rows);
    expect(input.rows).toHaveLength(125);
    expect(input.summaryRows).toBe(summaryRows);
    expect(input.view).toBe('paid');
    expect(input.filtersText).toContain('UF: CE');
    expect(input.filtersText).toContain('De: 30/09/2026');
    expect(input.filtersText).toContain('Até: 30/09/2026');
    expect(input.filtersText).toContain('Valores: somente ocorrências financeiras dentro do período filtrado');
    expect(input.filtersText).toContain('Busca: CMP');
  });

  it('mantém o mesmo escopo de filtros também no PDF', async () => {
    const { rows } = renderActions({ occurrenceValuesOnly: false });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
    const input = mocks.pdf.mock.calls[0][0] as FinanceUnifiedPaymentsExportInput;
    expect(input.rows).toBe(rows);
    expect(input.filtersText).not.toContain('somente ocorrências');
  });

  it('informa a exceção dos reembolsos que preservam o valor líquido integral', async () => {
    const adjusted = {
      id: 'cmp-38-payment',
      refundCents: 122040n,
    } as UnifiedFinancePaymentRow;
    renderActions({ rows: [adjusted], summaryRows: [adjusted] });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
    const input = mocks.pdf.mock.calls[0][0] as FinanceUnifiedPaymentsExportInput;
    expect(input.filtersText).toContain('somente ocorrências financeiras');
    expect(input.filtersText).toContain(
      'Exceção: pagamentos com reembolso preservam o valor líquido integral',
    );
  });

  it('não permite exportar sem registros e não apresenta valor parcial como total oficial', () => {
    renderActions({ rows: [], summaryRows: [] });
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.excel).not.toHaveBeenCalled();
  });

  it('mostra falha de geração ao usuário sem alterar lançamentos', async () => {
    mocks.excel.mockRejectedValueOnce(new Error('Arquivo não pôde ser gerado'));
    const { onError } = renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Arquivo não pôde ser gerado'));
    expect(screen.getByRole('button', { name: 'Excel' })).toBeEnabled();
  });
});
