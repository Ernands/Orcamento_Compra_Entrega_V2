import {
  Boxes,
  Calculator,
  Layers3,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  Search,
  Store as StoreIcon,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import {
  deletePlannedBudgetItem,
  listPlannedBudget,
  listPlannedBudgetStores,
  savePlannedBudgetItem,
  savePlannedBudgetSegment,
  setPlannedBudgetItemActive,
  setPlannedBudgetSegmentActive,
} from '../data/planned-budget/planned-budget-repository';
import { listSupplyItems } from '../data/supplies/supplies-repository';
import { plannedBudgetAllocations } from '../domain/planned-budget-calculations';
import type {
  PlannedBudgetData,
  PlannedBudgetItem,
  PlannedBudgetItemValues,
  PlannedBudgetSegment,
  PlannedBudgetSegmentValues,
} from '../domain/planned-budget-types';
import { formatQuantityV2 } from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents, quantityToThousandths } from '../domain/supply-calculations';
import type { Store, SupplyItem } from '../domain/types';
import './supply-planned-budget-page.css';

const EMPTY_DATA: PlannedBudgetData = { segments: [], items: [] };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function roundedDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

function segmentQuantity(segment: PlannedBudgetSegment): bigint {
  return segment.stores.reduce(
    (sum, store) => sum + quantityToThousandths(store.quantity),
    0n,
  );
}

function segmentTotalCents(segment: PlannedBudgetSegment, unitPrice: string): bigint {
  return roundedDivide(moneyToCents(unitPrice || '0') * segmentQuantity(segment), 1000n);
}

function financialGroupLabel(item: SupplyItem) {
  if (item.financialGroup === 'equipment') return 'Equipamento';
  if (item.financialGroup === 'furniture') return 'Mobiliário';
  if (item.financialGroup === 'general') return 'Itens gerais';
  return item.groupName || item.category;
}

function SegmentModal({
  segment,
  items,
  stores,
  onClose,
  onSaved,
}: {
  segment: PlannedBudgetSegment | null;
  items: SupplyItem[];
  stores: Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [itemQuery, setItemQuery] = useState('');
  const [supplyItemId, setSupplyItemId] = useState(segment?.supplyItemId || '');
  const [name, setName] = useState(segment?.name || '');
  const [active, setActive] = useState(segment?.active ?? true);
  const [notes, setNotes] = useState(segment?.notes || '');
  const [storeQuantities, setStoreQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(segment?.stores.map((store) => [store.storeId, store.quantity]) || []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLocaleLowerCase('pt-BR');
    return items
      .filter((item) => item.active)
      .filter((item) =>
        !q
          ? true
          : [item.code, item.name, item.groupName, item.category]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(q)),
      )
      .slice(0, 80);
  }, [itemQuery, items]);

  const selectedItem = items.find((item) => item.id === supplyItemId) || null;
  const selectedStores = stores.filter((store) => Boolean(storeQuantities[store.id]));

  const toggleStore = (storeId: string, checked: boolean) => {
    setStoreQuantities((current) => {
      const next = { ...current };
      if (checked) next[storeId] = current[storeId] || '1';
      else delete next[storeId];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplyItemId) {
      setError('Selecione um item para o segmento.');
      return;
    }
    if (!name.trim()) {
      setError('Informe o nome do segmento.');
      return;
    }
    const selected = Object.entries(storeQuantities).filter(([, quantity]) => {
      try {
        return quantityToThousandths(quantity) > 0n;
      } catch {
        return false;
      }
    });
    if (!selected.length) {
      setError('Selecione pelo menos uma loja e informe a quantidade.');
      return;
    }

    const values: PlannedBudgetSegmentValues = {
      id: segment?.id || null,
      supplyItemId,
      name,
      active,
      notes,
      stores: selected.map(([storeId, quantity]) => ({ storeId, quantity })),
    };

    setSaving(true);
    setError(null);
    try {
      await savePlannedBudgetSegment(values);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(messageFrom(saveError, 'Não foi possível salvar o segmento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={segment ? 'Editar segmento' : 'Cadastrar segmento'}
      description="Selecione o item, nomeie o segmento e determine lojas e quantidade por loja."
      onClose={onClose}
      className="planned-budget-modal planned-budget-segment-modal"
    >
      <form className="planned-budget-form" onSubmit={submit}>
        <section className="planned-budget-form__block">
          <header>
            <PackagePlus size={18} />
            <div>
              <strong>Item do segmento</strong>
              <small>Pesquisa diretamente o cadastro da aba Itens.</small>
            </div>
          </header>
          <label className="search-field">
            <Search size={17} />
            <input
              value={itemQuery}
              onChange={(event) => setItemQuery(event.target.value)}
              placeholder="Pesquisar código, item, grupo ou categoria"
            />
          </label>
          <div className="planned-budget-item-picker">
            {filteredItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === supplyItemId ? 'is-selected' : ''}
                onClick={() => setSupplyItemId(item.id)}
              >
                <span>
                  <strong>{item.code} · {item.name}</strong>
                  <small>{financialGroupLabel(item)} · {item.defaultUnit}</small>
                </span>
                {item.id === supplyItemId && <span className="planned-budget-check">Selecionado</span>}
              </button>
            ))}
          </div>
          {selectedItem && (
            <div className="planned-budget-selection-summary">
              <strong>{selectedItem.code} · {selectedItem.name}</strong>
              <span>{financialGroupLabel(selectedItem)}</span>
            </div>
          )}
        </section>

        <section className="planned-budget-form__grid">
          <label className="field">
            <span>Nome do segmento</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Ex.: Todas as lojas · 1 unidade"
              required
            />
          </label>
          <label className="field planned-budget-active-field">
            <span>Situação</span>
            <select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        </section>

        <section className="planned-budget-form__block">
          <header>
            <StoreIcon size={18} />
            <div>
              <strong>Lojas e quantidades</strong>
              <small>O segmento define automaticamente a quantidade do item em cada loja.</small>
            </div>
          </header>
          <div className="planned-budget-store-grid">
            {stores.map((store) => {
              const selected = Object.prototype.hasOwnProperty.call(storeQuantities, store.id);
              return (
                <article className={selected ? 'is-selected' : ''} key={store.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleStore(store.id, event.target.checked)}
                    />
                    <span>
                      <strong>{store.code} · {store.name}</strong>
                      <small>{store.city}/{store.state}</small>
                    </span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Quantidade para ${store.code}`}
                    disabled={!selected}
                    value={selected ? storeQuantities[store.id] || '' : ''}
                    onChange={(event) =>
                      setStoreQuantities((current) => ({
                        ...current,
                        [store.id]: event.target.value,
                      }))
                    }
                    placeholder="Qtd."
                  />
                </article>
              );
            })}
          </div>
          <div className="planned-budget-store-total">
            <span>{selectedStores.length} loja(s) selecionada(s)</span>
            <strong>
              {formatQuantityV2(
                String(
                  Number(
                    selectedStores.reduce(
                      (sum, store) => sum + Number(storeQuantities[store.id] || 0),
                      0,
                    ),
                  ),
                ),
              )}{' '}
              unidade(s)
            </strong>
          </div>
        </section>

        <label className="field">
          <span>Observações</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar segmento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetItemModal({
  budgetItem,
  items,
  segments,
  onClose,
  onSaved,
}: {
  budgetItem: PlannedBudgetItem | null;
  items: SupplyItem[];
  segments: PlannedBudgetSegment[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [supplyItemId, setSupplyItemId] = useState(budgetItem?.supplyItemId || '');
  const [segmentId, setSegmentId] = useState(budgetItem?.segmentId || '');
  const [unitPrice, setUnitPrice] = useState(budgetItem?.unitPrice || '');
  const [active, setActive] = useState(budgetItem?.active ?? true);
  const [notes, setNotes] = useState(budgetItem?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return items
      .filter((item) => item.active)
      .filter((item) =>
        !q
          ? true
          : [item.code, item.name, item.groupName, item.category]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(q)),
      )
      .slice(0, 80);
  }, [items, query]);

  const itemSegments = segments.filter((segment) => segment.supplyItemId === supplyItemId);
  const selectedItem = items.find((item) => item.id === supplyItemId) || null;
  const selectedSegment = segments.find((segment) => segment.id === segmentId) || null;

  useEffect(() => {
    if (segmentId && !itemSegments.some((segment) => segment.id === segmentId)) {
      setSegmentId('');
    }
  }, [itemSegments, segmentId]);

  const previewTotal = useMemo(() => {
    if (!selectedSegment || !unitPrice.trim()) return 0n;
    try {
      return segmentTotalCents(selectedSegment, unitPrice);
    } catch {
      return 0n;
    }
  }, [selectedSegment, unitPrice]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplyItemId || !segmentId) {
      setError('Selecione o item e um segmento correspondente.');
      return;
    }
    try {
      if (moneyToCents(unitPrice) < 0n) throw new Error();
    } catch {
      setError('Informe um valor unitário válido.');
      return;
    }

    const values: PlannedBudgetItemValues = {
      id: budgetItem?.id || null,
      supplyItemId,
      segmentId,
      unitPrice,
      active,
      notes,
    };

    setSaving(true);
    setError(null);
    try {
      await savePlannedBudgetItem(values);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(messageFrom(saveError, 'Não foi possível salvar o item do orçamento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={budgetItem ? 'Editar item do orçamento' : 'Adicionar item'}
      description="Selecione o item, informe o valor unitário e escolha o segmento que define lojas e quantidades."
      onClose={onClose}
      className="planned-budget-modal"
    >
      <form className="planned-budget-form" onSubmit={submit}>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar item, código, grupo ou categoria"
          />
        </label>
        <div className="planned-budget-item-picker planned-budget-item-picker--compact">
          {filteredItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === supplyItemId ? 'is-selected' : ''}
              onClick={() => {
                setSupplyItemId(item.id);
                if (item.id !== supplyItemId) setSegmentId('');
              }}
            >
              <span>
                <strong>{item.code} · {item.name}</strong>
                <small>{financialGroupLabel(item)}</small>
              </span>
              {item.id === supplyItemId && <span className="planned-budget-check">Selecionado</span>}
            </button>
          ))}
        </div>

        <div className="planned-budget-form__grid">
          <label className="field">
            <span>Segmento</span>
            <select
              value={segmentId}
              onChange={(event) => setSegmentId(event.target.value)}
              disabled={!supplyItemId}
              required
            >
              <option value="">Selecione</option>
              {itemSegments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name} · {segment.stores.length} loja(s){segment.active ? '' : ' · INATIVO'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor unitário</span>
            <input
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
          </label>
          <label className="field">
            <span>Situação</span>
            <select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        </div>

        {selectedItem && selectedSegment && (
          <div className="planned-budget-preview">
            <div>
              <span>Item / grupo</span>
              <strong>{selectedItem.name}</strong>
              <small>{financialGroupLabel(selectedItem)}</small>
            </div>
            <div>
              <span>Distribuição</span>
              <strong>{selectedSegment.stores.length} loja(s)</strong>
              <small>{formatQuantityV2(String(Number(segmentQuantity(selectedSegment)) / 1000))} unidade(s)</small>
            </div>
            <div>
              <span>Total previsto</span>
              <strong>{formatBRL(previewTotal)}</strong>
            </div>
          </div>
        )}

        <label className="field">
          <span>Observações</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SupplyPlannedBudgetPage() {
  const { can } = useSession();
  const canManage = can('planned_budget.manage');
  const [data, setData] = useState<PlannedBudgetData>(EMPTY_DATA);
  const [catalogItems, setCatalogItems] = useState<SupplyItem[]>([]);
  const [stores, setStores] = useState<
    Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [segmentModal, setSegmentModal] = useState<PlannedBudgetSegment | 'new' | null>(null);
  const [itemModal, setItemModal] = useState<PlannedBudgetItem | 'new' | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextData, nextItems, nextStores] = await Promise.all([
        listPlannedBudget(),
        listSupplyItems(),
        listPlannedBudgetStores(),
      ]);
      setData(nextData);
      setCatalogItems(nextItems);
      setStores(nextStores);
    } catch (loadError) {
      setError(messageFrom(loadError, 'Não foi possível carregar o Orçamento Previsto.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allocations = useMemo(() => plannedBudgetAllocations(data.items), [data.items]);
  const totalCents = allocations.reduce((sum, row) => sum + row.totalCents, 0n);
  const coveredStores = new Set(allocations.map((row) => row.storeId)).size;
  const activeItems = data.items.filter((item) => item.active && item.segment.active).length;
  const activeSegments = data.segments.filter((segment) => segment.active).length;

  const filteredItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return data.items.filter((budgetItem) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && budgetItem.active && budgetItem.segment.active) ||
        (status === 'inactive' && (!budgetItem.active || !budgetItem.segment.active));
      if (!matchesStatus) return false;
      if (!q) return true;
      return [
        budgetItem.item.code,
        budgetItem.item.name,
        budgetItem.item.groupName,
        budgetItem.item.category,
        budgetItem.segment.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(q));
    });
  }, [data.items, query, status]);

  const toggleItem = async (item: PlannedBudgetItem) => {
    setActionId(item.id);
    try {
      await setPlannedBudgetItemActive(item.id, !item.active);
      await load();
    } catch (actionError) {
      setError(messageFrom(actionError, 'Não foi possível alterar a situação do item.'));
    } finally {
      setActionId(null);
    }
  };

  const removeItem = async (item: PlannedBudgetItem) => {
    if (!window.confirm(`Excluir ${item.item.name} do Orçamento Previsto? Esta ação não exclui o item do cadastro.`)) {
      return;
    }
    setActionId(item.id);
    try {
      await deletePlannedBudgetItem(item.id);
      await load();
    } catch (actionError) {
      setError(messageFrom(actionError, 'Não foi possível excluir o item do orçamento.'));
    } finally {
      setActionId(null);
    }
  };

  const toggleSegment = async (segment: PlannedBudgetSegment) => {
    setActionId(segment.id);
    try {
      await setPlannedBudgetSegmentActive(segment.id, !segment.active);
      await load();
    } catch (actionError) {
      setError(messageFrom(actionError, 'Não foi possível alterar a situação do segmento.'));
    } finally {
      setActionId(null);
    }
  };

  if (loading) return <InlineLoading label="Carregando Orçamento Previsto" />;
  if (error && !data.segments.length && !data.items.length) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="page-stack planned-budget-page">
      <header className="page-heading planned-budget-heading">
        <div>
          <span className="eyebrow">Suprimentos · Planejamento</span>
          <h2>Orçamento Previsto</h2>
          <p>
            Defina segmentos, lojas, quantidades e valores previstos sem depender das compras realizadas.
          </p>
        </div>
        {canManage && (
          <div className="page-heading__actions">
            <button className="button button--secondary" onClick={() => setSegmentModal('new')}>
              <Layers3 size={17} />
              Cadastrar segmento
            </button>
            <button className="button button--primary" onClick={() => setItemModal('new')}>
              <Plus size={18} />
              Adicionar item
            </button>
          </div>
        )}
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="planned-budget-kpis">
        <article>
          <Calculator size={20} />
          <span>Total previsto ativo</span>
          <strong>{formatBRL(totalCents)}</strong>
        </article>
        <article>
          <Boxes size={20} />
          <span>Itens ativos</span>
          <strong>{activeItems}</strong>
        </article>
        <article>
          <Layers3 size={20} />
          <span>Segmentos ativos</span>
          <strong>{activeSegments}</strong>
        </article>
        <article>
          <StoreIcon size={20} />
          <span>Lojas cobertas</span>
          <strong>{coveredStores}</strong>
        </article>
      </section>

      <section className="planned-budget-panel planned-budget-panel--segments">
        <header>
          <div>
            <Layers3 size={19} />
            <div>
              <h3>Segmentos cadastrados</h3>
              <p>Cada segmento pertence a um item e define lojas e quantidade por loja.</p>
            </div>
          </div>
          <span>{data.segments.length} segmento(s)</span>
        </header>
        {data.segments.length ? (
          <div className="planned-budget-table-scroll">
            <table className="planned-budget-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Segmento</th>
                  <th>Lojas / Quantidades</th>
                  <th>Qtd. total</th>
                  <th>Situação</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {data.segments.map((segment) => (
                  <tr key={segment.id}>
                    <td>
                      <strong>{segment.item.code}</strong>
                      <span>{segment.item.name}</span>
                      <small>{financialGroupLabel(segment.item)}</small>
                    </td>
                    <td>
                      <strong>{segment.name}</strong>
                      {segment.notes && <small>{segment.notes}</small>}
                    </td>
                    <td>
                      <div className="planned-budget-store-chips">
                        {segment.stores.map((store) => (
                          <span key={store.id}>
                            {store.storeCode} · {formatQuantityV2(store.quantity)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><strong>{formatQuantityV2(String(Number(segmentQuantity(segment)) / 1000))}</strong></td>
                    <td>
                      <span className={`planned-budget-status planned-budget-status--${segment.active ? 'active' : 'inactive'}`}>
                        {segment.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="planned-budget-actions">
                          <button
                            type="button"
                            className="button button--secondary button--small"
                            onClick={() => setSegmentModal(segment)}
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            className="button button--secondary button--small"
                            disabled={actionId === segment.id}
                            onClick={() => void toggleSegment(segment)}
                          >
                            <Power size={14} />
                            {segment.active ? 'Inativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum segmento cadastrado"
            detail="Cadastre o primeiro segmento para definir lojas e quantidades previstas."
          />
        )}
      </section>

      <section className="planned-budget-panel planned-budget-panel--items">
        <header>
          <div>
            <PackagePlus size={19} />
            <div>
              <h3>Itens do orçamento</h3>
              <p>Somente itens e segmentos ativos compõem o Orçado itens do Financeiro.</p>
            </div>
          </div>
          <span>{filteredItems.length} item(ns)</span>
        </header>
        <div className="planned-budget-filters">
          <label className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar item, grupo ou segmento"
            />
          </label>
          <label>
            Situação
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </label>
        </div>

        {filteredItems.length ? (
          <div className="planned-budget-table-scroll">
            <table className="planned-budget-table planned-budget-table--items">
              <thead>
                <tr>
                  <th>Item / Grupo</th>
                  <th>Segmento</th>
                  <th>Distribuição</th>
                  <th>Valor unitário</th>
                  <th>Valor total</th>
                  <th>Situação</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((budgetItem) => {
                  const total = budgetItem.active && budgetItem.segment.active
                    ? segmentTotalCents(budgetItem.segment, budgetItem.unitPrice)
                    : 0n;
                  return (
                    <tr key={budgetItem.id}>
                      <td>
                        <strong>{budgetItem.item.code} · {budgetItem.item.name}</strong>
                        <span>{financialGroupLabel(budgetItem.item)}</span>
                        <small>{budgetItem.item.groupName || budgetItem.item.category}</small>
                      </td>
                      <td>
                        <strong>{budgetItem.segment.name}</strong>
                        <small>{budgetItem.segment.stores.length} loja(s)</small>
                      </td>
                      <td>
                        <div className="planned-budget-store-chips">
                          {budgetItem.segment.stores.map((store) => (
                            <span key={store.id}>
                              {store.storeCode} · {formatQuantityV2(store.quantity)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td><strong>{formatBRL(moneyToCents(budgetItem.unitPrice))}</strong></td>
                      <td><strong>{formatBRL(total)}</strong></td>
                      <td>
                        <span className={`planned-budget-status planned-budget-status--${
                          budgetItem.active && budgetItem.segment.active ? 'active' : 'inactive'
                        }`}>
                          {budgetItem.active && budgetItem.segment.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="planned-budget-actions">
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={() => setItemModal(budgetItem)}
                            >
                              <Pencil size={14} />
                              Editar
                            </button>
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              disabled={actionId === budgetItem.id}
                              onClick={() => void toggleItem(budgetItem)}
                            >
                              <Power size={14} />
                              {budgetItem.active ? 'Inativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              className="button button--secondary button--small planned-budget-delete"
                              disabled={actionId === budgetItem.id}
                              onClick={() => void removeItem(budgetItem)}
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum item no orçamento"
            detail="Adicione itens e informe valor unitário e segmento."
          />
        )}
      </section>

      {segmentModal && (
        <SegmentModal
          segment={segmentModal === 'new' ? null : segmentModal}
          items={catalogItems}
          stores={stores}
          onClose={() => setSegmentModal(null)}
          onSaved={load}
        />
      )}

      {itemModal && (
        <BudgetItemModal
          budgetItem={itemModal === 'new' ? null : itemModal}
          items={catalogItems}
          segments={data.segments}
          onClose={() => setItemModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
