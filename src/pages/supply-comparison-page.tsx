import { Clock3, ExternalLink, Search, Tag, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import {
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../data/supplies/supplies-repository';
import { calculateQuoteLine, formatBRL, moneyToCents } from '../domain/supply-calculations';
import { getGroupedComparisonHighlights } from '../domain/supply-comparison';
import { SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
import {
  getEffectiveSupplyQuoteStatus,
  SUPPLY_QUOTE_STATUS_LABELS,
} from '../domain/supply-quote-status';
import type {
  SupplyItem,
  SupplyNeed,
  SupplyQuote,
  SupplyQuoteItem,
  SupplyQuoteStatus,
} from '../domain/types';

interface ComparisonRow {
  quote: SupplyQuote;
  item: SupplyQuoteItem;
}

const COMPARISON_STATUS_OPTIONS: SupplyQuoteStatus[] = [
  'received',
  'draft',
  'expired',
  'cancelled',
];

function getGroupedHighlights(rows: ComparisonRow[]) {
  return getGroupedComparisonHighlights(rows.map(({ item }) => item));
}

export function SupplyComparisonPage() {
  const [quotes, setQuotes] = useState<SupplyQuote[]>([]);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [needs, setNeeds] = useState<SupplyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState('');
  const [itemId, setItemId] = useState('');
  const [needId, setNeedId] = useState('');
  const [context, setContext] = useState('all');
  const [statuses, setStatuses] = useState<SupplyQuoteStatus[]>(['received']);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedQuotes, loadedItems, loadedNeeds] = await Promise.all([
        listSupplyQuotes(),
        listSupplyItems(),
        listSupplyNeeds(),
      ]);
      setQuotes(loadedQuotes);
      setItems(loadedItems);
      setNeeds(loadedNeeds);
    } catch {
      setError('Nao foi possivel carregar o comparativo.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const stores = useMemo(
    () => [...new Map(needs.map((need) => [need.storeId, need])).values()],
    [needs],
  );
  const availableNeeds = needs.filter(
    (need) => (!storeId || need.storeId === storeId) && (!itemId || need.supplyItemId === itemId),
  );
  const toggleStatus = (status: SupplyQuoteStatus) => {
    setStatuses((current) => {
      if (!current.includes(status)) return [...current, status];
      if (current.length === 1) return current;
      return current.filter((entry) => entry !== status);
    });
  };
  const statusSummary =
    statuses.length === COMPARISON_STATUS_OPTIONS.length
      ? 'Todos os status'
      : statuses.map((status) => SUPPLY_QUOTE_STATUS_LABELS[status]).join(', ');
  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return quotes.flatMap((quote): ComparisonRow[] => {
      if (!statuses.includes(getEffectiveSupplyQuoteStatus(quote))) return [];
      if (context !== 'all' && quote.contextType !== context) return [];
      return quote.items
        .filter(
          (item) =>
            (!storeId ||
              item.storeId === storeId ||
              (item.storeId === null && quote.stores.some((store) => store.id === storeId))) &&
            (!itemId || item.supplyItemId === itemId) &&
            (!needId || item.storeNeedId === needId) &&
            (!search ||
              [quote.supplierName, item.itemName, item.offeredBrandModel || '', quote.code]
                .join(' ')
                .toLocaleLowerCase('pt-BR')
                .includes(search)),
        )
        .map((item) => ({ quote, item }));
    });
  }, [context, itemId, needId, query, quotes, statuses, storeId]);
  const highlights = useMemo(() => getGroupedHighlights(rows), [rows]);

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Comparativo</h2>
          <p>Analise preco, frete e prazo sem registrar decisao ou aprovacao.</p>
        </div>
        <div className="page-heading__actions">
          <div className="summary-number">
            <strong>{rows.length}</strong>
            <span>alternativas</span>
          </div>
        </div>
      </header>
      <div className="comparison-filters">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar alternativas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fornecedor, item ou marca"
          />
        </label>
        <details className="comparison-status-filter">
          <summary aria-label="Filtrar status no comparativo">
            <span>Status</span>
            <strong>{statusSummary}</strong>
          </summary>
          <div className="comparison-status-filter__menu">
            {COMPARISON_STATUS_OPTIONS.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={statuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                <span>{SUPPLY_QUOTE_STATUS_LABELS[status]}</span>
              </label>
            ))}
            <div className="comparison-status-filter__actions">
              <button type="button" onClick={() => setStatuses(['received'])}>
                Somente recebidas
              </button>
              <button type="button" onClick={() => setStatuses([...COMPARISON_STATUS_OPTIONS])}>
                Todos
              </button>
            </div>
          </div>
        </details>
        <select
          aria-label="Filtrar loja no comparativo"
          value={storeId}
          onChange={(event) => {
            setStoreId(event.target.value);
            setNeedId('');
          }}
        >
          <option value="">Todas lojas</option>
          {stores.map((store) => (
            <option key={store.storeId} value={store.storeId}>
              {store.storeCode} - {store.storeName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar item no comparativo"
          value={itemId}
          onChange={(event) => {
            setItemId(event.target.value);
            setNeedId('');
          }}
        >
          <option value="">Todos itens</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} - {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar necessidade no comparativo"
          value={needId}
          onChange={(event) => setNeedId(event.target.value)}
        >
          <option value="">Todas necessidades</option>
          {availableNeeds.map((need) => (
            <option key={need.id} value={need.id}>
              {need.storeCode} - {need.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar contexto"
          value={context}
          onChange={(event) => setContext(event.target.value)}
        >
          <option value="all">Todos contextos</option>
          <option value="store">Por loja</option>
          <option value="consolidated">Consolidado</option>
        </select>
      </div>
      <div className="comparison-legend">
        <span>
          <Tag size={14} />
          Menor preco unitario
        </span>
        <span>
          <Truck size={14} />
          Menor custo conhecido
        </span>
        <span>
          <Clock3 size={14} />
          Menor prazo
        </span>
      </div>
      {loading ? (
        <InlineLoading label="Carregando comparativo" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length ? (
        <div className="comparison-table-wrap">
          <div className="comparison-table">
            <div className="comparison-table__header">
              <span>Alternativa</span>
              <span>Item / destino</span>
              <span>Quantidade</span>
              <span>Preco unitario</span>
              <span>Subtotal</span>
              <span>Frete</span>
              <span>Custo total</span>
              <span>Prazo</span>
              <span>Validade</span>
            </div>
            {rows.map(({ quote, item }) => {
              const calculation = calculateQuoteLine(item);
              return (
                <article className="comparison-row" key={item.id}>
                  <div>
                    <strong>{quote.supplierName}</strong>
                    <span>{SUPPLIER_CHANNEL_LABELS[quote.channel]}</span>
                    <small>
                      {quote.originCity
                        ? `${quote.originCity}/${quote.originState}`
                        : 'Origem nao informada'}{' '}
                      - {quote.code}
                    </small>
                    {item.productUrl && /^https?:\/\//i.test(item.productUrl) && (
                      <a
                        className="quote-product-link"
                        href={item.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} />
                        Ver produto
                      </a>
                    )}
                  </div>
                  <div>
                    <strong>{item.itemName}</strong>
                    <span>{item.offeredBrandModel || 'Marca/modelo nao informado'}</span>
                    <small>
                      {item.storeCode ||
                        `Consolidado: ${quote.stores.map((store) => store.code).join(', ')}`}
                    </small>
                  </div>
                  <span>
                    {item.quantity} {item.unit}
                  </span>
                  <span
                    className={highlights.lowestUnitPriceIds.has(item.id) ? 'comparison-best' : ''}
                  >
                    {formatBRL(moneyToCents(item.unitPrice))}
                    {highlights.lowestUnitPriceIds.has(item.id) && <small>Menor preco</small>}
                  </span>
                  <span>{formatBRL(calculation.subtotalCents)}</span>
                  <span>
                    {item.shippingType === 'pending'
                      ? 'A consultar'
                      : item.shippingType === 'free'
                        ? 'Gratis'
                        : formatBRL(calculation.shippingCents || 0n)}
                  </span>
                  <span className={highlights.lowestTotalIds.has(item.id) ? 'comparison-best' : ''}>
                    {formatBRL(calculation.totalCents)}
                    {highlights.lowestTotalIds.has(item.id) && <small>Menor custo</small>}
                  </span>
                  <span
                    className={highlights.shortestLeadTimeIds.has(item.id) ? 'comparison-best' : ''}
                  >
                    {item.deliveryDays === null ? 'Nao informado' : `${item.deliveryDays} dias`}
                    {highlights.shortestLeadTimeIds.has(item.id) && <small>Menor prazo</small>}
                  </span>
                  <span>
                    {quote.validUntil || 'Sem validade'}
                    <StatusBadge status={getEffectiveSupplyQuoteStatus(quote)} />
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Nenhuma alternativa encontrada"
          detail="Ajuste os filtros ou registre novas cotacoes."
        />
      )}
    </section>
  );
}
