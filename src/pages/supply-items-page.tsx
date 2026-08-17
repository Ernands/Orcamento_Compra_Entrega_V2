import { ChevronDown, ChevronUp, Edit3, FilePlus2, Link2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import {
  EmptyState,
  ErrorState,
  IconButton,
  InlineLoading,
  Modal,
  StatusBadge,
} from '../components/ui';
import {
  createSupplyItem,
  linkNeedToSupplyItem,
  listSupplyItems,
  listSupplyNeeds,
  updateSupplyItem,
} from '../data/supplies/supplies-repository';
import { SUPPLY_CATEGORIES } from '../domain/supply-options';
import type { SupplyItem, SupplyItemValues, SupplyNeed } from '../domain/types';

const EMPTY_ITEM: SupplyItemValues = {
  name: '',
  description: '',
  category: '',
  subcategory: '',
  type: 'product',
  defaultUnit: 'un',
  brandReference: '',
  technicalSpecification: '',
  active: true,
};

function ItemModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: SupplyItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setValues(
      item
        ? {
            name: item.name,
            description: item.description || '',
            category: item.category,
            subcategory: item.subcategory || '',
            type: item.type,
            defaultUnit: item.defaultUnit,
            brandReference: item.brandReference || '',
            technicalSpecification: item.technicalSpecification || '',
            active: item.active,
          }
        : EMPTY_ITEM,
    );
    setError(null);
  }, [item, open]);
  const set = <K extends keyof SupplyItemValues>(key: K, value: SupplyItemValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim() || !values.category.trim() || !values.defaultUnit.trim()) {
      setError('Informe nome, categoria e unidade.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (item) await updateSupplyItem(item.id, values);
      else await createSupplyItem(values);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel salvar o item.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title={item ? `Editar ${item.code}` : 'Novo item'} onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field form-grid__wide">
            Nome
            <input
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              required
            />
          </label>
          <label className="field">
            Categoria
            <input
              list="supply-categories"
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
              required
            />
            <datalist id="supply-categories">
              {SUPPLY_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Subcategoria
            <input
              value={values.subcategory}
              onChange={(event) => set('subcategory', event.target.value)}
            />
          </label>
          <label className="field">
            Tipo
            <select
              value={values.type}
              onChange={(event) => set('type', event.target.value as SupplyItemValues['type'])}
            >
              <option value="product">Produto</option>
              <option value="service">Servico</option>
            </select>
          </label>
          <label className="field">
            Unidade padrao
            <input
              value={values.defaultUnit}
              onChange={(event) => set('defaultUnit', event.target.value)}
              required
            />
          </label>
          <label className="field form-grid__wide">
            Marca / referencia
            <input
              value={values.brandReference}
              onChange={(event) => set('brandReference', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Descricao
            <textarea
              rows={2}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Especificacao tecnica
            <textarea
              rows={3}
              value={values.technicalSpecification}
              onChange={(event) => set('technicalSpecification', event.target.value)}
            />
          </label>
          <label className="toggle-field form-grid__wide">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => set('active', event.target.checked)}
            />
            <span>
              <strong>Item ativo</strong>
              <small>Disponivel para novas cotacoes.</small>
            </span>
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LinkNeedModal({
  need,
  items,
  onClose,
  onSaved,
}: {
  need: SupplyNeed | null;
  items: SupplyItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [itemId, setItemId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItemId('');
    setError(null);
  }, [need]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!need || !itemId) return;
    setSaving(true);
    setError(null);
    try {
      await linkNeedToSupplyItem(need.id, itemId);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel vincular a necessidade.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(need)}
      title="Vincular necessidade"
      description={need ? `${need.storeCode} - ${need.title}` : undefined}
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Item do catalogo
          <select value={itemId} onChange={(event) => setItemId(event.target.value)} required>
            <option value="">Selecione</option>
            {items
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.name}
                </option>
              ))}
          </select>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving || !itemId}>
            {saving ? 'Vinculando...' : 'Vincular item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SupplyItemsPage() {
  const { can } = useSession();
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [needs, setNeeds] = useState<SupplyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [storeId, setStoreId] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [priority, setPriority] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [editing, setEditing] = useState<SupplyItem | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [linkingNeed, setLinkingNeed] = useState<SupplyNeed | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedItems, loadedNeeds] = await Promise.all([listSupplyItems(), listSupplyNeeds()]);
      setItems(loadedItems);
      setNeeds(loadedNeeds);
    } catch {
      setError('Nao foi possivel carregar itens e necessidades.');
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
  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort(),
    [items],
  );
  const states = useMemo(() => [...new Set(needs.map((need) => need.storeState))].sort(), [needs]);
  const cities = useMemo(
    () =>
      [
        ...new Set(
          needs.filter((need) => !state || need.storeState === state).map((need) => need.storeCity),
        ),
      ].sort(),
    [needs, state],
  );
  const filteredNeeds = useMemo(
    () =>
      needs.filter(
        (need) =>
          (!storeId || need.storeId === storeId) &&
          (!state || need.storeState === state) &&
          (!city || need.storeCity === city) &&
          (!priority || need.priority === priority),
      ),
    [city, needs, priority, state, storeId],
  );
  const filteredItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return items.filter((item) => {
      const related = filteredNeeds.filter((need) => need.supplyItemId === item.id);
      const matchesSearch =
        !search ||
        [item.code, item.name, item.category, item.subcategory || '']
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(search);
      const needsFilterActive = Boolean(storeId || state || city || priority);
      return (
        !onlyUnlinked &&
        matchesSearch &&
        (!category || item.category === category) &&
        (!needsFilterActive || related.length > 0)
      );
    });
  }, [category, city, filteredNeeds, items, onlyUnlinked, priority, query, state, storeId]);
  const unlinkedNeeds = filteredNeeds.filter(
    (need) =>
      !need.supplyItemId &&
      (!query || need.title.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))),
  );

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Itens e Necessidades</h2>
          <p>Catalogo reutilizavel e demanda consolidada das lojas acessiveis.</p>
        </div>
        <div className="page-heading__actions">
          <div className="summary-number">
            <strong>{unlinkedNeeds.length}</strong>
            <span>sem item</span>
          </div>
          {can('items.manage') && (
            <button
              className="button button--primary"
              onClick={() => {
                setEditing(null);
                setItemModalOpen(true);
              }}
            >
              <Plus size={18} />
              Novo item
            </button>
          )}
        </div>
      </header>
      <div className="supply-filter-grid">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar itens"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar codigo, item ou necessidade"
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
          aria-label="Filtrar loja"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
        >
          <option value="">Todas lojas</option>
          {stores.map((need) => (
            <option key={need.storeId} value={need.storeId}>
              {need.storeCode}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar UF"
          value={state}
          onChange={(event) => {
            setState(event.target.value);
            setCity('');
          }}
        >
          <option value="">Todas UFs</option>
          {states.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar cidade"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        >
          <option value="">Todas cidades</option>
          {cities.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar prioridade"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">Todas prioridades</option>
          <option value="critical">Critica</option>
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={onlyUnlinked}
            onChange={(event) => setOnlyUnlinked(event.target.checked)}
          />
          Somente sem item
        </label>
      </div>
      {loading ? (
        <InlineLoading label="Carregando suprimentos" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          {!onlyUnlinked &&
            (filteredItems.length ? (
              <div className="supply-list">
                <div className="supply-list__header">
                  <span>Item</span>
                  <span>Categoria</span>
                  <span>Tipo</span>
                  <span>Lojas</span>
                  <span>Quantidade</span>
                  <span>Situacao</span>
                  <span />
                </div>
                {filteredItems.map((item) => {
                  const related = filteredNeeds.filter(
                    (need) =>
                      need.supplyItemId === item.id &&
                      !['cancelled', 'resolved'].includes(need.status),
                  );
                  const storeCount = new Set(related.map((need) => need.storeId)).size;
                  const total = related.reduce((sum, need) => sum + need.quantity, 0);
                  const expanded = expandedId === item.id;
                  return (
                    <div className="supply-list__group" key={item.id}>
                      <div className="supply-row">
                        <div className="supply-identity">
                          <small>{item.code}</small>
                          <strong>{item.name}</strong>
                          <span>{item.defaultUnit}</span>
                        </div>
                        <span>{item.category}</span>
                        <span>{item.type === 'product' ? 'Produto' : 'Servico'}</span>
                        <strong>{storeCount}</strong>
                        <strong>
                          {total.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}{' '}
                          {item.defaultUnit}
                        </strong>
                        <StatusBadge status={item.active ? 'active' : 'inactive'} />
                        <div className="row-actions">
                          <IconButton
                            label={expanded ? `Recolher ${item.name}` : `Detalhar ${item.name}`}
                            onClick={() => setExpandedId(expanded ? null : item.id)}
                          >
                            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                          </IconButton>
                          {can('items.manage') && (
                            <IconButton
                              label={`Editar ${item.name}`}
                              onClick={() => {
                                setEditing(item);
                                setItemModalOpen(true);
                              }}
                            >
                              <Edit3 size={17} />
                            </IconButton>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div className="supply-breakdown">
                          {related.length ? (
                            related.map((need) => (
                              <div key={need.id}>
                                <span>{need.storeCode}</span>
                                <strong>
                                  {need.quantity} {need.unit || item.defaultUnit}
                                </strong>
                                <small>
                                  {need.storeCity} / {need.storeState}
                                </small>
                                {can('quotes.create') && (
                                  <Link
                                    className="icon-button"
                                    to={`/suprimentos/cotacoes?need=${need.id}`}
                                    aria-label={`Cotar ${need.title} para ${need.storeCode}`}
                                    title="Iniciar cotacao"
                                  >
                                    <FilePlus2 size={16} />
                                  </Link>
                                )}
                              </div>
                            ))
                          ) : (
                            <span>Nenhuma necessidade ativa vinculada.</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Nenhum item encontrado"
                detail="Ajuste os filtros ou cadastre um novo item."
              />
            ))}
          <section className="supply-subsection">
            <header>
              <div>
                <h3>Necessidades sem item</h3>
                <p>Demandas que ainda precisam ser relacionadas ao catalogo.</p>
              </div>
              <span>{unlinkedNeeds.length} pendentes</span>
            </header>
            {unlinkedNeeds.length ? (
              <div className="unlinked-needs">
                {unlinkedNeeds.map((need) => (
                  <article key={need.id}>
                    <span className={`priority-marker priority-marker--${need.priority}`} />
                    <div>
                      <small>
                        {need.storeCode} - {need.storeCity}/{need.storeState}
                      </small>
                      <strong>{need.title}</strong>
                      <span>
                        {need.quantity} {need.unit || 'un'} - {need.category}
                      </span>
                    </div>
                    {can('needs.edit') && (
                      <button
                        className="button button--secondary button--small"
                        onClick={() => setLinkingNeed(need)}
                      >
                        <Link2 size={16} />
                        Vincular
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhuma necessidade sem item"
                detail="As demandas visiveis ja estao relacionadas ao catalogo."
              />
            )}
          </section>
        </>
      )}
      <ItemModal
        open={itemModalOpen}
        item={editing}
        onClose={() => setItemModalOpen(false)}
        onSaved={load}
      />
      <LinkNeedModal
        need={linkingNeed}
        items={items}
        onClose={() => setLinkingNeed(null)}
        onSaved={load}
      />
    </section>
  );
}
