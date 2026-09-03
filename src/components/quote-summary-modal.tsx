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
import { selectLowestPriceQuotesByItem } from '../domain/supply-quote-lowest-price';
import {
  buildQuoteSummary,
  CONSOLIDATED_STORE_SUMMARY_KEY,
  formatSummaryQuantity,
  type QuoteAllocationSource,
} from '../domain/supply-quote-summary';
import type { SupplyQuote } from '../domain/types';
import { EmptyState, Modal } from './ui';
import './quote-summary-enhancements.css';
import './quote-summary-v2.css';

type SummaryView = 'consolidated' | 'destination' | 'store';
type SummaryPriceMode = 'all' | 'lowest';

const SOURCE_LABELS: Record<QuoteAllocationSource, string> = {
  destination_profile: 'Destino real · Prospector/UF',
  direct_store: 'Loja direta',
  legacy_fallback: 'Fallback igualitario',
  unallocated: 'Sem cobertura',
};

function sourcesLabel(sources: QuoteAllocationSource[]) {
  return sources.map((source) => SOURCE_LABELS[source]).join(' + ');
}

function coveragePercent(basisPoints: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: basisPoints % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(basisPoints / 100);
}

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
  const [view, setView] = useState<SummaryView>('consolidated');
  const [priceMode, setPriceMode] = useState<SummaryPriceMode>('all');
  const [allocateConsolidated, setAllocateConsolidated] = useState(false);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableStates = useMemo(
    () =>
      [
        ...new Set(
          quotes
            .flatMap((quote) => [
              ...quote.stores.map((store) => store.state),
              ...quote.items.flatMap((item) =>
                (item.destinations || []).map((destination) => destination.state),
              ),
            ])
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [quotes],
  );
  const activeStates = selectedStates.filter((state) => availableStates.includes(state));
  const selectedStoreId = useMemo(() => {
    if (!filters.store) return null;
    for (const quote of quotes) {
      const store = quote.stores.find(
        (entry) => `${entry.code} - ${entry.name}` === filters.store,
      );
      if (store) return store.id;
    }
    return null;
  }, [filters.store, quotes]);
  const preparedQuotes = useMemo(() => {
    if (priceMode === 'all') return quotes;
    const selection = selectLowestPriceQuotesByItem(quotes);
    return quotes.map((quote) => ({
      ...quote,
      items: quote.items.filter((item) => selection.winningItemIds.has(item.id)),
    }));
  }, [priceMode, quotes]);
  const summary = useMemo(
    () =>
      buildQuoteSummary(preparedQuotes, {
        allocateConsolidated,
        states: activeStates,
        storeIds: selectedStoreId ? [selectedStoreId] : [],
      }),
    [activeStates, allocateConsolidated, preparedQuotes, selectedStoreId],
  );

  const toggleState = (state: string) => {
    setSelectedStates((current) =>
      current.includes(state) ? current.filter((item) => item !== state) : [...current, state],
    );
  };

  const exportSummary = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    setError(null);
    const visibleQuoteIds = new Set(summary.allocations.map((allocation) => allocation.quoteId));
    const input = {
      quotes: preparedQuotes.filter((quote) => visibleQuoteIds.has(quote.id)),
      summary,
      filters: {
        ...filters,
        states: activeStates,
        allocationMode: allocateConsolidated ? ('allocated' as const) : ('original' as const),
        priceMode: priceMode === 'lowest' ? 'Menor preco por item' : 'Todas as cotacoes',
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
      description="Valores recalculados sobre os filtros atuais. Cotacoes canceladas nunca entram nos calculos financeiros."
      onClose={onClose}
    >
      <div className="quote-summary-actions">
        <div>
          <span>Filtros aplicados</span>
          <strong>
            {filters.search || 'Sem pesquisa'} · {filters.status || 'Todos os status'} ·{' '}
            {filters.store || 'Todas as lojas'}
            {filters.category ? ` · ${filters.category}` : ''}
            {filters.area ? ` · ${filters.area}` : ''}
            {priceMode === 'lowest' ? ' · Menor preco por item' : ''}
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
      {summary.excludedCancelledQuotes > 0 && (
        <p className="quote-summary-note">
          {summary.excludedCancelledQuotes}{' '}
          {summary.excludedCancelledQuotes === 1
            ? 'cotacao cancelada foi excluida'
            : 'cotacoes canceladas foram excluidas'}{' '}
          dos valores.
        </p>
      )}

      <div className="quote-summary-kpis quote-summary-kpis--with-freight">
        <article>
          <ReceiptText size={20} />
          <span>Total de cotacoes</span>
          <strong>{summary.inputQuoteCount}</strong>
          {summary.inputQuoteCount !== summary.totalQuotes && (
            <small>{summary.totalQuotes} consideradas nos valores</small>
          )}
        </article>
        <article>
          <Boxes size={20} />
          <span>Itens considerados</span>
          <strong>{summary.totalItems}</strong>
        </article>
        <article>
          <Store size={20} />
          <span>Lojas cobertas</span>
          <strong>{summary.totalStores}</strong>
        </article>
        <article className="quote-summary-kpis__freight">
          <Truck size={20} />
          <span>Frete</span>
          <strong>{formatBRL(summary.totalShippingCents)}</strong>
          {summary.shippingPendingCount > 0 && (
            <small>{summary.shippingPendingCount} frete(s) pendente(s)</small>
          )}
        </article>
        <article className="quote-summary-kpis__primary">
          <ReceiptText size={20} />
          <span>Valor total</span>
          <strong>{formatBRL(summary.totalValueCents)}</strong>
        </article>
      </div>

      <div className="quote-summary-view-tabs" role="tablist" aria-label="Visao do resumo de cotacoes">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'consolidated'}
          className={view === 'consolidated' ? 'is-active' : ''}
          onClick={() => setView('consolidated')}
        >
          <ReceiptText size={17} /> Consolidado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'destination'}
          className={view === 'destination' ? 'is-active' : ''}
          onClick={() => setView('destination')}
        >
          <MapPin size={17} /> Prospector / UF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'store'}
          className={view === 'store' ? 'is-active' : ''}
          onClick={() => setView('store')}
        >
          <Store size={17} /> Loja
        </button>
      </div>

      <section className="quote-summary-filter-bar">
        <div>
          <strong>Cobertura e rateio</strong>
          <span>Destinos reais sempre prevalecem; fallback so e usado para legado sem destino.</span>
        </div>
        <div className="quote-store-summary__controls">
          <button
            type="button"
            className={`button ${priceMode === 'lowest' ? 'button--primary' : 'button--secondary'}`}
            aria-pressed={priceMode === 'lowest'}
            onClick={() => setPriceMode((current) => (current === 'lowest' ? 'all' : 'lowest'))}
          >
            <ReceiptText size={17} />
            {priceMode === 'lowest' ? 'Usando menor preco' : 'Menor preco por item'}
          </button>
          <button
            type="button"
            className={`button ${allocateConsolidated ? 'button--primary' : 'button--secondary'}`}
            aria-pressed={allocateConsolidated}
            onClick={() => setAllocateConsolidated((current) => !current)}
          >
            <Calculator size={17} />
            {allocateConsolidated ? 'Nao ratear legado' : 'Ratear legado sem destino'}
          </button>
          <details className="quote-state-filter">
            <summary>
              <MapPin size={17} />
              <span>{activeStates.length ? `UFs: ${activeStates.join(', ')}` : 'Todas as UFs'}</span>
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
      </section>

      {view === 'consolidated' && (
        <div className="quote-summary-consolidated">
          <div className="quote-summary-financial-grid">
            <article><span>Produtos</span><strong>{formatBRL(summary.totalProductsCents)}</strong></article>
            <article><span>Descontos</span><strong>- {formatBRL(summary.totalDiscountCents)}</strong></article>
            <article><span>Outros custos</span><strong>{formatBRL(summary.totalOtherCostsCents)}</strong></article>
            <article><span>Frete</span><strong>{formatBRL(summary.totalShippingCents)}</strong></article>
            <article><span>Media por loja coberta</span><strong>{formatBRL(summary.averagePerStoreCents)}</strong></article>
            <article><span>Destinos no resumo</span><strong>{summary.totalDestinations}</strong></article>
          </div>
          <div className="quote-context-summary">
            <article><Building2 size={19} /><span>Prospector/UF</span><strong>{formatBRL(summary.coverage.destinationProfileCents)}</strong></article>
            <article><Store size={19} /><span>Loja direta</span><strong>{formatBRL(summary.coverage.directStoreCents)}</strong></article>
            <article><Calculator size={19} /><span>Fallback legado</span><strong>{formatBRL(summary.coverage.legacyFallbackCents)}</strong></article>
            <article><MapPin size={19} /><span>Sem cobertura</span><strong>{formatBRL(summary.coverage.unallocatedCents)}</strong></article>
          </div>
          <div className="quote-summary-coverage">
            <strong>{coveragePercent(summary.coverage.realCoverageBasisPoints)}% com cobertura real</strong>
            <span>Destino Prospector/UF ou loja direta. Fallback e valores nao alocados ficam destacados separadamente.</span>
          </div>
        </div>
      )}

      {view === 'destination' && (
        <section className="quote-store-summary">
          <header className="quote-store-summary__toolbar">
            <div>
              <h3>Totais por Prospector / UF</h3>
              <p>Produto e custos comuns sao proporcionais a quantidade do destino; o frete permanece no proprio destino.</p>
            </div>
          </header>
          {summary.totalsByDestination.length ? (
            <div className="quote-summary-data-table">
              <div className="quote-summary-data-table__header quote-summary-data-table__destination">
                <span>Destino</span><span>UF</span><span>Lojas</span><span>Qtd.</span><span>Produtos</span><span>Frete</span><span>Total</span><span>Cobertura</span>
              </div>
              {summary.totalsByDestination.map((row) => (
                <div className="quote-summary-data-table__row quote-summary-data-table__destination" key={row.key}>
                  <strong>{row.label}</strong>
                  <span>{row.state || '—'}</span>
                  <span>{row.storeCount}</span>
                  <span>{formatSummaryQuantity(row.quantityThousandths)}</span>
                  <span>{formatBRL(row.productCents)}</span>
                  <span>{row.shippingPending ? `${formatBRL(row.shippingCents)} *` : formatBRL(row.shippingCents)}</span>
                  <strong>{formatBRL(row.totalCents)}</strong>
                  <small>{sourcesLabel(row.sources)}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem destinos no resumo" detail="Os filtros atuais nao retornaram valores para esta visao." />
          )}
        </section>
      )}

      {view === 'store' && (
        <section className="quote-store-summary">
          <header className="quote-store-summary__toolbar">
            <div>
              <h3>Totais por loja</h3>
              <p>
                {allocateConsolidated
                  ? 'Destinos reais sao respeitados. Legado sem destino e rateado igualmente entre as lojas da cotacao.'
                  : 'Destinos reais sao respeitados. Legado sem destino permanece como Consolidado / Nao distribuido.'}
              </p>
            </div>
          </header>
          {summary.totalsByStore.length ? (
            <div className="quote-summary-data-table">
              <div className="quote-summary-data-table__header quote-summary-data-table__store">
                <span>Loja</span><span>Cidade / UF</span><span>Qtd.</span><span>Itens</span><span>Produtos</span><span>Frete</span><span>Total</span><span>Origem</span>
              </div>
              {summary.totalsByStore.map((row) => (
                <div className="quote-summary-data-table__row quote-summary-data-table__store" key={row.key}>
                  <strong>{row.label}</strong>
                  <span>{row.key === CONSOLIDATED_STORE_SUMMARY_KEY ? '—' : `${row.city || '—'} / ${row.state || '—'}`}</span>
                  <span>{formatSummaryQuantity(row.quantityThousandths)}</span>
                  <span>{row.itemCount}</span>
                  <span>{formatBRL(row.productCents)}</span>
                  <span>{row.shippingPending ? `${formatBRL(row.shippingCents)} *` : formatBRL(row.shippingCents)}</span>
                  <strong>{formatBRL(row.totalCents)}</strong>
                  <small>{sourcesLabel(row.sources)}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem lojas no resumo" detail="Os filtros atuais nao retornaram valores para esta visao." />
          )}
        </section>
      )}

      {summary.shippingPendingCount > 0 && (
        <p className="quote-summary-note">* Ha frete pendente. Os totais exibidos sao parciais ate o preenchimento do frete.</p>
      )}
    </Modal>
  );
}
