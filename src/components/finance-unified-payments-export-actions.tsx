import { FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  downloadFinanceUnifiedPaymentsPdf,
} from '../data/exports/finance-unified-payments-exports';
import {
  downloadFinanceUnifiedPaymentsExcelWithStoreSummary,
} from '../data/exports/finance-unified-payments-store-summary-export';
import { exportErrorMessage } from '../data/exports/export-errors';
import {
  FINANCE_PAYMENT_ORIGIN_LABELS,
  type FinancePaymentOrigin,
  type FinancePaymentsView,
  type UnifiedFinancePaymentRow,
} from '../domain/finance-payments';
import type { Store } from '../domain/types';

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

interface FinanceUnifiedPaymentsExportActionsProps {
  rows: UnifiedFinancePaymentRow[];
  summaryRows: UnifiedFinancePaymentRow[];
  stores: Store[];
  view: FinancePaymentsView;
  originFilter: string;
  storeFilter: string;
  stateFilter: string;
  supplierFilter: string;
  methodFilter: string;
  dateFrom: string;
  dateTo: string;
  query: string;
  hasDeepFilter: boolean;
  onError: (message: string) => void;
}

function formatDate(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function FinanceUnifiedPaymentsExportActions({
  rows,
  summaryRows,
  stores,
  view,
  originFilter,
  storeFilter,
  stateFilter,
  supplierFilter,
  methodFilter,
  dateFrom,
  dateTo,
  query,
  hasDeepFilter,
  onError,
}: FinanceUnifiedPaymentsExportActionsProps) {
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const filtersText = useMemo(() => {
    const parts = [`Situação: ${VIEW_LABELS[view]}`];
    if (originFilter) {
      parts.push(
        `Origem: ${
          FINANCE_PAYMENT_ORIGIN_LABELS[originFilter as FinancePaymentOrigin] || originFilter
        }`,
      );
    }
    if (stateFilter) parts.push(`UF: ${stateFilter}`);
    if (storeFilter) {
      const selectedStore = stores.find((store) => store.id === storeFilter);
      if (selectedStore) parts.push(`Loja: ${selectedStore.code} · ${selectedStore.name}`);
    }
    if (supplierFilter) parts.push(`Fornecedor/prestador: ${supplierFilter}`);
    if (methodFilter) parts.push(`Forma: ${PAYMENT_LABELS[methodFilter] || methodFilter}`);
    if (dateFrom) parts.push(`De: ${formatDate(dateFrom)}`);
    if (dateTo) parts.push(`Até: ${formatDate(dateTo)}`);
    if (query.trim()) parts.push(`Busca: ${query.trim()}`);
    if (hasDeepFilter) parts.push('Filtro de item/serviço do Detalhe da Loja ativo');
    return parts.join(' | ');
  }, [
    dateFrom,
    dateTo,
    hasDeepFilter,
    methodFilter,
    originFilter,
    query,
    stateFilter,
    storeFilter,
    stores,
    supplierFilter,
    view,
  ]);

  const exportPayments = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const input = {
        rows,
        summaryRows,
        stores,
        view,
        generatedAt: new Date(),
        filtersText,
      };
      if (format === 'pdf') await downloadFinanceUnifiedPaymentsPdf(input);
      else await downloadFinanceUnifiedPaymentsExcelWithStoreSummary(input);
    } catch (error) {
      onError(exportErrorMessage(error, 'Não foi possível gerar a exportação de Pagamentos.'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="button button--secondary"
        disabled={Boolean(exporting) || !rows.length}
        onClick={() => void exportPayments('pdf')}
      >
        <FileText size={16} />
        {exporting === 'pdf' ? 'Gerando...' : 'PDF'}
      </button>
      <button
        type="button"
        className="button button--secondary"
        disabled={Boolean(exporting) || !rows.length}
        onClick={() => void exportPayments('excel')}
      >
        <FileSpreadsheet size={16} />
        {exporting === 'excel' ? 'Gerando...' : 'Excel'}
      </button>
    </div>
  );
}
