import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  PackagePlus,
  Plus,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { SupplyItemFormModal } from '../components/supply-item-form-modal';
import { EmptyState, ErrorState, IconButton, InlineLoading, StatusBadge } from '../components/ui';
import {
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed, SupplyQuote } from '../domain/types';

type SortKey = 'name' | 'code' | 'category' | 'updatedAt';

const PAGE_SIZES = [10, 20, 50];

export function SupplyItemsPage() {
  const { can } = useSession();
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [needs, setNeeds] = useState<SupplyNeed[]>([]);
  const [quotes, setQuotes] = useState<SupplyQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [groupName, setGroupName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<SupplyItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedItems, loadedNeeds, loadedQuotes] = await Promise.all([
        listSupplyItems(),
        listSupplyNeeds(),
        listSupplyQuotes(),
      ]);
      setItems(loadedItems);
      setNeeds(loadedNeeds);
      setQuotes(loadedQuotes);
    } catch {
      setError('Nao foi possivel carregar o catalogo de itens.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [areaName, category, groupName, pageSize, query, sortAscending, sortKey, status, type]);

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort(),
    [items],
  );
  const groups = useMemo(
    () => [...new Set(items.map((item) => item.groupName).filter(Boolean))].sort() as string[],
    [items],
  );
  const areas = useMemo(
    () => [...new Set(items.map((item) => item.areaName).filter(Boolean))].sort() as string[],
    [items],
  );
  const needCounts = useMemo(() => {
    const counts = new Map<string, number>();
    needs.forEach((need) => {
      if (need.supplyItemId)
        counts.set(need.supplyItemId, (counts.get(need.supplyItemId) || 0) + 1);
    });
    return counts;
  }, [needs]);
  const quoteCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    quotes.forEach((quote) =>
      quote.items.forEach((line) => {
        const quoteIds = counts.get(line.supplyItemId) || new Set<string>();
        quoteIds.add(quote.id);
        counts.set(line.supplyItemId, quoteIds);
      }),
    );
    return new Map([...counts].map(([itemId, quoteIds]) => [itemId, quoteIds.size]));
  }, [quotes]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return items
      .filter((item) => {
        const searchText = [
          item.code,
          item.name,
          item.description || '',
          item.category,
          item.subcategory || '',
          item.groupName || '',
          item.areaName || '',
          item.brandReference || '',
        ]
          .join(' ')
          .toLocaleLowerCase('pt-BR');
        return (
          (!normalizedQuery || searchText.includes(normalizedQuery)) &&
          (!category || item.category === category) &&
          (!groupName || item.groupName === groupName) &&
          (!areaName || item.areaName === areaName) &&
          (!type || item.type === type) &&
          (!status || (status === 'active' ? item.active : !item.active))
        );
      })
      .sort((a, b) => {
        const left = String(a[sortKey] || '');
        const right = String(b[sortKey] || '');
        return left.localeCompare(right, 'pt-BR') * (sortAscending ? 1 : -1);
      });
  }, [areaName, category, groupName, items, query, sortAscending, sortKey, status, type]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Itens</h2>
          <p>Catalogo global reutilizado pelas demandas das lojas e pelas cotacoes.</p>
        </div>
        {can('items.manage') && (
          <button
            className="button button--primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={18} />
            Novo item
          </button>
        )}
      </header>

      <div className="catalog-context">
        <PackagePlus size={20} />
        <span>Item e o cadastro global. Necessidade e a quantidade demandada por uma loja.</span>
        {can('needs.view') && <Link to="/suprimentos/necessidades">Abrir necessidades</Link>}
      </div>

      <div className="item-filter-grid">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar itens"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Codigo, nome, categoria ou referencia"
          />
        </label>
        <select
          aria-label="Filtrar categoria"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Todas categorias</option>
          {categories.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar grupo"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
        >
          <option value="">Todos grupos</option>
          {groups.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar area"
          value={areaName}
          onChange={(event) => setAreaName(event.target.value)}
        >
          <option value="">Todas areas</option>
          {areas.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar tipo"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">Todos tipos</option>
          <option value="product">Produto</option>
          <option value="service">Servico</option>
        </select>
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Ativos e inativos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      <div className="list-toolbar">
        <span>{filtered.length} itens encontrados</span>
        <label>
          Ordenar
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="name">Nome</option>
            <option value="code">Codigo</option>
            <option value="category">Categoria</option>
            <option value="updatedAt">Atualizacao</option>
          </select>
        </label>
        <IconButton
          label={sortAscending ? 'Ordem crescente' : 'Ordem decrescente'}
          onClick={() => setSortAscending((value) => !value)}
        >
          <ArrowDownAZ size={18} className={sortAscending ? '' : 'icon-flipped'} />
        </IconButton>
      </div>

      {loading ? (
        <InlineLoading label="Carregando itens" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : visibleItems.length ? (
        <div className="item-catalog-list">
          <div className="item-catalog-list__header">
            <span>Item</span>
            <span>Classificacao</span>
            <span>Unidade</span>
            <span>Necessidades</span>
            <span>Cotacoes</span>
            <span>Status</span>
            <span />
          </div>
          {visibleItems.map((item) => (
            <article className="item-catalog-row" key={item.id}>
              <div className="supply-identity">
                <small>{item.code}</small>
                <strong>{item.name}</strong>
                <span>{item.type === 'product' ? 'Produto' : 'Servico'}</span>
              </div>
              <div className="item-classification">
                <strong>{item.category}</strong>
                <span>
                  {[item.groupName, item.areaName].filter(Boolean).join(' / ') ||
                    'Sem grupo e area'}
                </span>
              </div>
              <span>
                {item.defaultQuantity ? `${item.defaultQuantity} ` : ''}
                {item.defaultUnit}
              </span>
              <strong>{needCounts.get(item.id) || 0}</strong>
              <strong>{quoteCounts.get(item.id) || 0}</strong>
              <StatusBadge status={item.active ? 'active' : 'inactive'} />
              <div className="row-actions">
                <Link
                  className="icon-button"
                  to={`/suprimentos/itens/${item.id}`}
                  aria-label={`Abrir ${item.name}`}
                  title="Abrir item"
                >
                  <Eye size={17} />
                </Link>
                {can('items.manage') && (
                  <IconButton
                    label={`Editar ${item.name}`}
                    onClick={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                  >
                    <Edit3 size={17} />
                  </IconButton>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum item encontrado"
          detail="Ajuste os filtros ou cadastre um novo item."
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <footer className="pagination-bar">
          <label>
            Por pagina
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <span>
            Pagina {currentPage} de {pageCount}
          </span>
          <IconButton
            label="Pagina anterior"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton
            label="Proxima pagina"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </footer>
      )}

      <SupplyItemFormModal
        open={formOpen}
        item={editing}
        onClose={() => setFormOpen(false)}
        onSaved={async () => load()}
      />
    </section>
  );
}
