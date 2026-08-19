import {
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  MapPin,
  ReceiptText,
  Store,
  Truck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  downloadQuoteSummaryExcel,
  downloadQuoteSummaryPdf,
  type QuoteSummaryFilters,
} from '../data/exports/quote-summary-exports';
import { formatBRL } from '../domain/supply-calculations';
import {
  buildQuoteSummary,
  CONSOLIDATED_STORE_SUMMARY_KEY,
} from '../domain/supply-quote-summary';
import type { SupplyQuote } from '../domain/types';
import { EmptyState, Modal } from './ui';
import './quote-summary-enhancements.css';

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
  const [allocateConsolidated, setAllocateConsolidated] = useState(false);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const summary = useMemo(
    () => buildQuoteSummary(quotes, { allocateConsolidated }),
    [quotes, allocateConsolidated],
  );
  const availableStates = useMemo(
    () =>
      [...new Set(quotes.flatMap((quote) => quote.stores.map((store) => store.state)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [quotes],
  );
  const activeStates = selectedStates.filter((state) => availableStates.includes(state));
  const visibleRows = summary.totalsByStore.filter((row) => {
    if (!activeStates.length) return true;
    if (row.key === CONSOLIDATED_STORE_SUMMARY_KEY) return false;
    return Boolean(row.state && activeStates.includes(row.state));
  });
  const visibleShippingCents = visibleRows.reduce((total, row) => total + row.shippingCents, 0n);
  const visibleTotalCents = visibleRows.reduce((total, row) => total + row.totalCents, 0n);
  const visibleItemCount = activeStates.length
    ? visibleRows.reduce((total, row) => total + row.itemCount, 0)
    : summary.totalItems;
  const visibleQuoteCount = activeStates.length
    ? quotes.filter((quote) => quote.stores.some((store) => activeStates.includes(store.state))).length
    : summary.totalQuotes;
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleState = (state: string) => {
    setSelectedStates((current) =>
      current.includes(state) ? current.filter((item) => item !== state) : [...current, state],
    );
  };

  const exportSummary = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    setError(null);
    const input = {
      quotes,
      summary: { ...summary, totalsByStore: visibleRows },
      filters: {
        ...filters,
        states: activeStates,
        allocationMode: allocateConsolidated ? ('allocated' as const) : ('original' as const),
      },
      generatedAt: new Date(),
    };
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

      <div className="quote-summary-kpis quote-summary-kpis--with-freight">
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
        <article className="quote-summary-kpis__freight">
          <Truck size={20} />
          <span>Total de frete</span>
          <strong>{formatBRL(summary.totalShippingCents)}</strong>
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
        <header className="quote-store-summary__toolbar">
          <div>
            <h3>Totais por loja</h3>
            <p>
              {allocateConsolidated
                ? 'Valor consolidado rateado igualmente entre as lojas de cada cotacao. O cadastro original nao e alterado.'
                : 'Todas as lojas que constam nas cotacoes, inclusive consolidadas. Valores sem rateio entre lojas.'}
              {activeStates.length ? ` Exibindo: ${activeStates.join(', ')}.` : ''}
            </p>
          </div>
          <div className="quote-store-summary__controls">
            <button
              type="button"
              className={`button ${allocateConsolidated ? 'button--primary' : 'button--secondary'}`}
              aria-pressed={allocateConsolidated}
              onClick={() => setAllocateConsolidated((current) => !current)}
            >
              <Calculator size={17} />
              {allocateConsolidated ? 'Ver valor original' : 'Ver valor rateado'}
            </button>

            <details className="quote-state-filter">
              <summary>
                <MapPin size={17} />
                <span>
                  {activeStates.length ? `UFs: ${activeStates.join(', ')}` : 'Todas as UFs'}
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="quote-state-filter__menu">
                <button
                  type="button"
                  className={!activeStates.length ? 'active' : ''}
                  onClick={() => setSelectedStates([])}
                >
                  Todas as UFs
                </button>
                {availableStates.map((state) => (
                  <label key={state}>
                    <input
                      type="checkbox"
                      checked={activeStates.includes(state)}
                      onChange={() => toggleState(state)}
                    />
                    <span>{state}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        </header>
        {visibleRows.length ? (
          <div className="quote-store-summary__table">
            <div className="quote-store-summary__header quote-store-summary__header--with-freight">
              <span>Loja</span>
              <span>Qtd. cotacoes</span>
              <span>Qtd. itens</span>
              <span>Frete</span>
              <span>Valor total</span>
            </div>
            {visibleRows.map((row) => (
              <div
                className="quote-store-summary__row quote-store-summary__row--with-freight"
                key={row.key}
              >
                <strong>{row.label}</strong>
                <span>{row.quoteCount}</span>
                <span>{row.itemCount}</span>
                <span>{formatBRL(row.shippingCents)}</span>
                <strong>{formatBRL(row.totalCents)}</strong>
              </div>
            ))}
            <div className="quote-store-summary__row quote-store-summary__row--with-freight quote-store-summary__total">
              <strong>{activeStates.length ? 'Total UFs selecionadas' : 'Total geral'}</strong>
              <strong>{visibleQuoteCount}</strong>
              <strong>{visibleItemCount}</strong>
              <strong>
                {formatBRL(activeStates.length ? visibleShippingCents : summary.totalShippingCents)}
              </strong>
              <strong>{formatBRL(activeStates.length ? visibleTotalCents : summary.totalValueCents)}</strong>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Sem cotacoes no resumo"
            detail="Os filtros atuais nao retornaram dados para consolidar nesta selecao de UFs."
          />
        )}
      </section>
    </Modal>
  );
}
