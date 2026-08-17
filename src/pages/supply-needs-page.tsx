import { Link2, Search, Unlink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  linkNeedToSupplyItem,
  listSupplyItems,
  listSupplyNeeds,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed } from '../domain/types';

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
    setItemId(need?.supplyItemId || '');
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
      title="Vincular item"
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
            {saving ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SupplyNeedsPage() {
  const { can } = useSession();
  const [needs, setNeeds] = useState<SupplyNeed[]>([]);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [linkState, setLinkState] = useState('unlinked');
  const [linking, setLinking] = useState<SupplyNeed | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedNeeds, loadedItems] = await Promise.all([listSupplyNeeds(), listSupplyItems()]);
      setNeeds(loadedNeeds);
      setItems(loadedItems);
    } catch {
      setError('Nao foi possivel carregar as necessidades.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stores = useMemo(
    () =>
      [...new Map(needs.map((need) => [need.storeId, need])).values()].sort((a, b) =>
        a.storeCode.localeCompare(b.storeCode),
      ),
    [needs],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return needs.filter((need) => {
      const item = need.supplyItemId ? itemById.get(need.supplyItemId) : null;
      return (
        (!search ||
          [need.title, need.storeCode, need.storeName, item?.name || '']
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(search)) &&
        (!storeId || need.storeId === storeId) &&
        (!status || need.status === status) &&
        (!priority || need.priority === priority) &&
        (!linkState || (linkState === 'linked' ? Boolean(need.supplyItemId) : !need.supplyItemId))
      );
    });
  }, [itemById, linkState, needs, priority, query, status, storeId]);

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Necessidades</h2>
          <p>Demandas das lojas acessiveis, separadas do catalogo global de itens.</p>
        </div>
        <div className="summary-number">
          <strong>{needs.filter((need) => !need.supplyItemId).length}</strong>
          <span>sem item</span>
        </div>
      </header>

      <div className="needs-filter-grid">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar necessidades"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Necessidade, loja ou item"
          />
        </label>
        <select
          aria-label="Filtrar loja"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
        >
          <option value="">Todas lojas</option>
          {stores.map((store) => (
            <option key={store.storeId} value={store.storeId}>
              {store.storeCode} - {store.storeName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos status</option>
          <option value="identified">Identificada</option>
          <option value="under_review">Em analise</option>
          <option value="resolved">Resolvida</option>
          <option value="cancelled">Cancelada</option>
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
        <select
          aria-label="Filtrar vinculo"
          value={linkState}
          onChange={(event) => setLinkState(event.target.value)}
        >
          <option value="">Com e sem item</option>
          <option value="unlinked">Sem item</option>
          <option value="linked">Com item</option>
        </select>
      </div>

      {loading ? (
        <InlineLoading label="Carregando necessidades" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length ? (
        <div className="needs-list">
          <div className="needs-list__header">
            <span>Necessidade</span>
            <span>Loja</span>
            <span>Quantidade</span>
            <span>Item vinculado</span>
            <span>Status</span>
            <span />
          </div>
          {filtered.map((need) => {
            const item = need.supplyItemId ? itemById.get(need.supplyItemId) : null;
            return (
              <article className="needs-row" key={need.id}>
                <div>
                  <strong>{need.title}</strong>
                  <span>
                    {need.category} · prioridade {need.priority}
                  </span>
                </div>
                <div>
                  <strong>{need.storeCode}</strong>
                  <span>
                    {need.storeCity} / {need.storeState}
                  </span>
                </div>
                <strong>
                  {need.quantity} {need.unit || 'un'}
                </strong>
                <div className="need-item-link">
                  {item ? (
                    <Link to={`/suprimentos/itens/${item.id}`}>
                      {item.code} - {item.name}
                    </Link>
                  ) : (
                    <span>
                      <Unlink size={15} />
                      Sem item
                    </span>
                  )}
                </div>
                <StatusBadge status={need.status} />
                {can('needs.edit') && (
                  <button
                    className="button button--secondary button--small"
                    onClick={() => setLinking(need)}
                  >
                    <Link2 size={15} />
                    {item ? 'Alterar' : 'Vincular'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma necessidade encontrada"
          detail="Ajuste os filtros para consultar outras demandas."
        />
      )}

      <LinkNeedModal need={linking} items={items} onClose={() => setLinking(null)} onSaved={load} />
    </section>
  );
}
