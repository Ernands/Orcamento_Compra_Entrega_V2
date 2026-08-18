import { Boxes, Building2, FileSpreadsheet, FileText, ReceiptText, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  downloadQuoteSummaryExcel,
  downloadQuoteSummaryPdf,
  type QuoteSummaryFilters,
} from '../data/exports/quote-summary-exports';
import { formatBRL } from '../domain/supply-calculations';
import { buildQuoteSummary } from '../domain/supply-quote-summary';
import type { SupplyQuote } from '../domain/types';
import { EmptyState, Modal } from './ui';

export function QuoteSummaryModal({
  open,
  quotes,
  filters,
  onClose,
}: {
  open: boolean;
  quotes: SupplyQuote[];
  filters: QuoteSummaryFilters;
  onClose: () => void;
}) {
  const summary = useMemo(() => buildQuoteSummary(quotes), [quotes]);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportSummary = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    setError(null);
    const input = { quotes, summary, filters, generatedAt: new Date() };
    try {
      if (format === 'excel') await downloadQuoteSummaryExcel(input);
      else await downloadQuoteSummaryPdf(input);
    } catch {
      setError(`Nao foi possivel gerar o arquivo ${format === 'excel' ? 'Excel' : 'PDF'}.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal
      className="quote-summary-modal"
      open={open}
      title="Resumo das cotacoes"
      description="Visao geral das cotacoes filtradas na listagem."
      onClose={onClose}
    >
      <div className="quote-summary-actions">
        <div>
          <span>Filtros aplicados</span>
          <strong>
            {filters.search || 'Sem pesquisa'} · {filters.status || 'Todos os status'} ·{' '}
            {filters.store || 'Todas as lojas'}
          </strong>
        </div>
        <button
          type="button"
          className="button button--secondary"
          disabled={Boolean(exporting)}
          onClick={() => void exportSummary('excel')}
        >
          <FileSpreadsheet size={17} />
          {exporting === 'excel' ? 'Gerando Excel...' : 'Exportar Excel'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={Boolean(exporting)}
          onClick={() => void exportSummary('pdf')}
        >
          <FileText size={17} />
          {exporting === 'pdf' ? 'Gerando PDF...' : 'Exportar PDF'}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="quote-summary-kpis">
        <article>
          <ReceiptText size={20} />
          <span>Total de cotacoes</span>
          <strong>{summary.totalQuotes}</strong>
        </article>
        <article>
          <Boxes size={20} />
          <span>Total de itens</span>
          <strong>{summary.totalItems}</strong>
        </article>
        <article>
          <ReceiptText size={20} />
          <span>Total valor unitario</span>
          <strong>{formatBRL(summary.totalUnitPriceCents)}</strong>
        </article>
        <article className="quote-summary-kpis__primary">
          <ReceiptText size={20} />
          <span>Valor total das cotacoes</span>
          <strong>{formatBRL(summary.totalValueCents)}</strong>
        </article>
      </div>

      <div className="quote-context-summary">
        <article>
          <Store size={19} />
          <span>Cotacoes por loja</span>
          <strong>{summary.storeQuotes}</strong>
        </article>
        <article>
          <Building2 size={19} />
          <span>Cotacoes consolidadas</span>
          <strong>{summary.consolidatedQuotes}</strong>
        </article>
      </div>

      <section className="quote-store-summary">
        <header>
          <div>
            <h3>Totais por loja</h3>
            <p>Valores consolidados sem rateio artificial entre lojas.</p>
          </div>
        </header>
        {summary.totalsByStore.length ? (
          <div className="quote-store-summary__table">
            <div className="quote-store-summary__header">
              <span>Loja</span>
              <span>Qtd. cotacoes</span>
              <span>Qtd. itens</span>
              <span>Valor total</span>
            </div>
            {summary.totalsByStore.map((row) => (
              <div className="quote-store-summary__row" key={row.key}>
                <strong>{row.label}</strong>
                <span>{row.quoteCount}</span>
                <span>{row.itemCount}</span>
                <strong>{formatBRL(row.totalCents)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem cotacoes no resumo"
            detail="Os filtros atuais nao retornaram dados para consolidar."
          />
        )}
      </section>
    </Modal>
  );
}
