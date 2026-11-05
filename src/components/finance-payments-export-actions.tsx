import { FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  downloadFinancePaymentsExcel,
  downloadFinancePaymentsPdf,
} from '../data/exports/finance-payments-exports';
import { exportErrorMessage } from '../data/exports/export-errors';
import type { FinancePaymentEvent } from '../domain/finance-types';
import type { Store } from '../domain/types';

interface FinancePaymentsExportActionsProps {
  rows: FinancePaymentEvent[];
  stores: Store[];
  month: string;
  query: string;
  stateFilter: string;
  storeFilter: string;
  onError: (message: string) => void;
}

function formatMonth(value: string): string {
  if (!value) return 'Todos os meses';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function FinancePaymentsExportActions({
  rows,
  stores,
  month,
  query,
  stateFilter,
  storeFilter,
  onError,
}: FinancePaymentsExportActionsProps) {
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const filtersText = useMemo(() => {
    const parts = [`Mês: ${formatMonth(month)}`];
    if (query.trim()) parts.push(`Busca: ${query.trim()}`);
    if (stateFilter) parts.push(`UF: ${stateFilter}`);
    if (storeFilter) {
      const selectedStore = stores.find((store) => store.id === storeFilter);
      if (selectedStore) parts.push(`Loja: ${selectedStore.code} · ${selectedStore.name}`);
    }
    return parts.join(' | ');
  }, [month, query, stateFilter, storeFilter, stores]);

  const exportPayments = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const input = {
        rows,
        stores,
        generatedAt: new Date(),
        filtersText,
      };
      if (format === 'pdf') await downloadFinancePaymentsPdf(input);
      else await downloadFinancePaymentsExcel(input);
    } catch (error) {
      onError(exportErrorMessage(error, 'Não foi possível gerar a exportação de Pagamentos.'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="finance-panel__tools">
      <span>{rows.length} lançamentos</span>
      <button
        type="button"
        className="button button--secondary button--small"
        disabled={Boolean(exporting) || !rows.length}
        onClick={() => void exportPayments('pdf')}
      >
        <FileText size={15} />
        {exporting === 'pdf' ? 'Gerando...' : 'PDF'}
      </button>
      <button
        type="button"
        className="button button--secondary button--small"
        disabled={Boolean(exporting) || !rows.length}
        onClick={() => void exportPayments('excel')}
      >
        <FileSpreadsheet size={15} />
        {exporting === 'excel' ? 'Gerando...' : 'Excel'}
      </button>
    </div>
  );
}
