import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  MessageSquareText,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Truck,
  Video,
} from 'lucide-react';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import { useSession } from '../app/session-provider';
import {
  deletePurchaseDeliveryDestination,
  deletePurchaseDeliveryItem,
  listPurchaseDeliveryMatrix,
  savePurchaseDeliveryCell,
  savePurchaseDeliveryDestination,
  savePurchaseDeliveryItem,
} from '../data/purchase-delivery/purchase-delivery-repository';
import type {
  PurchaseDeliveryCell,
  PurchaseDeliveryDestination,
  PurchaseDeliveryDestinationValues,
  PurchaseDeliveryHeaderTone,
  PurchaseDeliveryItem,
  PurchaseDeliveryItemValues,
  PurchaseDeliveryMatrix,
  PurchaseDeliveryStatus,
} from '../domain/purchase-delivery-types';
import {
  PURCHASE_DELIVERY_STATUS_LABELS,
  purchaseDeliveryPending,
} from '../domain/purchase-delivery-types';
import './supply-purchase-delivery-page.css';

const EMPTY_MATRIX: PurchaseDeliveryMatrix = { destinations: [], items: [], cells: [] };

const STATUS_OPTIONS: PurchaseDeliveryStatus[] = [
  'none',
  'matrix',
  'purchased',
  'green_text',
  'delivered',
  'shipping_note',
  'orange_text',
  'attention',
  'issue',
  'do_not_buy',
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseQuantity(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return 0;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error('Informe uma quantidade válida.');
  return number;
}

function formatQuantity(value: number | null): string {
  if (value === null) return '';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function ItemModal({
  item,
  nextPosition,
  onClose,
  onSaved,
}: {
  item: PurchaseDeliveryItem | null;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(item?.name || '');
  const [purchaseTotal, setPurchaseTotal] = useState(item ? String(item.purchaseTotal) : '0');
  const [acquiredQuantity, setAcquiredQuantity] = useState(item ? String(item.acquiredQuantity) : '0');
  const [notes, setNotes] = useState(item?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome do item.');
      return;
    }

    const values: PurchaseDeliveryItemValues = {
      name,
      purchaseTotal: parseQuantity(purchaseTotal),
      acquiredQuantity: parseQuantity(acquiredQuantity),
      notes,
    };

    setSaving(true);
    setError(null);
    try {
      await savePurchaseDeliveryItem(item, values, item?.position || nextPosition);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar o item.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item || !window.confirm(`Excluir o item “${item.name}” e todas as marcações dele?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePurchaseDeliveryItem(item.id);
      await onSaved();
      onClose();
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Não foi possível excluir o item.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={item ? 'Editar item' : 'Adicionar item'}
      description="Controle manual: estes valores não são preenchidos pelos outros módulos."
      onClose={onClose}
      className="purchase-delivery-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Item
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <div className="form-grid form-grid--two">
          <label className="field">
            Compra Total
            <input inputMode="decimal" value={purchaseTotal} onChange={(event) => setPurchaseTotal(event.target.value)} />
          </label>
          <label className="field">
            Qt. Adquirida
            <input inputMode="decimal" value={acquiredQuantity} onChange={(event) => setAcquiredQuantity(event.target.value)} />
          </label>
        </div>
        <label className="field">
          Observação do item
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions purchase-delivery-modal__actions">
          {item && (
            <button type="button" className="button button--secondary purchase-delivery-danger" onClick={() => void remove()} disabled={saving}>
              Excluir item
            </button>
          )}
          <span className="purchase-delivery-modal__spacer" />
          <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
          <button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function DestinationModal({
  destination,
  nextPosition,
  onClose,
  onSaved,
}: {
  destination: PurchaseDeliveryDestination | null;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(destination?.label || '');
  const [keyword, setKeyword] = useState(destination?.keyword || '');
  const [isVideoService, setIsVideoService] = useState(destination?.isVideoService || false);
  const [headerTone, setHeaderTone] = useState<PurchaseDeliveryHeaderTone>(destination?.headerTone || 'video_light');
  const [notes, setNotes] = useState(destination?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim()) {
      setError('Informe o nome da loja ou prospector.');
      return;
    }
    const values: PurchaseDeliveryDestinationValues = { label, keyword, isVideoService, headerTone, notes };
    setSaving(true);
    setError(null);
    try {
      await savePurchaseDeliveryDestination(destination, values, destination?.position || nextPosition);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar a coluna.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!destination || !window.confirm(`Excluir “${destination.label}” e todas as marcações dessa coluna?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePurchaseDeliveryDestination(destination.id);
      await onSaved();
      onClose();
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Não foi possível excluir a coluna.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={destination ? 'Editar loja / prospector' : 'Adicionar loja / prospector'}
      description="A coluna é independente do cadastro de lojas do sistema."
      onClose={onClose}
      className="purchase-delivery-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Nome da coluna
          <input value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
        </label>
        <label className="field">
          Palavra-chave / referência
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Opcional" />
        </label>
        <label className="purchase-delivery-check">
          <input type="checkbox" checked={isVideoService} onChange={(event) => setIsVideoService(event.target.checked)} />
          <span>Loja com vídeo atendimento</span>
        </label>
        {isVideoService && (
          <label className="field">
            Tom do nome da loja
            <select value={headerTone} onChange={(event) => setHeaderTone(event.target.value as PurchaseDeliveryHeaderTone)}>
              <option value="video_light">Roxo claro</option>
              <option value="video_dark">Roxo escuro</option>
            </select>
          </label>
        )}
        <label className="field">
          Observação da coluna
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions purchase-delivery-modal__actions">
          {destination && (
            <button type="button" className="button button--secondary purchase-delivery-danger" onClick={() => void remove()} disabled={saving}>
              Excluir coluna
            </button>
          )}
          <span className="purchase-delivery-modal__spacer" />
          <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
          <button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CellModal({
  item,
  destination,
  cell,
  onClose,
  onSaved,
}: {
  item: PurchaseDeliveryItem;
  destination: PurchaseDeliveryDestination;
  cell: PurchaseDeliveryCell | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(cell?.quantity === null || cell?.quantity === undefined ? '' : String(cell.quantity));
  const [status, setStatus] = useState<PurchaseDeliveryStatus>(cell?.status || 'none');
  const [note, setNote] = useState(cell?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let parsedQuantity: number | null = null;
    try {
      parsedQuantity = status === 'do_not_buy' || !quantity.trim() ? null : parseQuantity(quantity);
    } catch (quantityError) {
      setError(errorMessage(quantityError, 'Quantidade inválida.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await savePurchaseDeliveryCell(cell, {
        itemId: item.id,
        destinationId: destination.id,
        quantity: parsedQuantity,
        status,
        note,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar a marcação.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Editar compra / entrega"
      description={`${item.name} · ${destination.label}`}
      onClose={onClose}
      className="purchase-delivery-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid form-grid--two">
          <label className="field">
            Quantidade
            <input
              inputMode="decimal"
              value={quantity}
              disabled={status === 'do_not_buy'}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Ex.: 1"
            />
          </label>
          <label className="field">
            Situação / cor
            <select value={status} onChange={(event) => setStatus(event.target.value as PurchaseDeliveryStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{PURCHASE_DELIVERY_STATUS_LABELS[option]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Observação / pendência
          <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
          <button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function SupplyPurchaseDeliveryPage() {
  const { can } = useSession();
  const canManage = can('purchase_delivery.manage');
  const [matrix, setMatrix] = useState<PurchaseDeliveryMatrix>(EMPTY_MATRIX);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [showPendencies, setShowPendencies] = useState(false);
  const [itemEditor, setItemEditor] = useState<PurchaseDeliveryItem | null | undefined>(undefined);
  const [destinationEditor, setDestinationEditor] = useState<PurchaseDeliveryDestination | null | undefined>(undefined);
  const [cellEditor, setCellEditor] = useState<{
    item: PurchaseDeliveryItem;
    destination: PurchaseDeliveryDestination;
    cell: PurchaseDeliveryCell | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMatrix(await listPurchaseDeliveryMatrix());
    } catch (loadError) {
      setError(errorMessage(loadError, 'Não foi possível carregar o gerenciamento de compra/entrega.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cellMap = useMemo(() => {
    const map = new Map<string, PurchaseDeliveryCell>();
    for (const cell of matrix.cells) map.set(`${cell.itemId}:${cell.destinationId}`, cell);
    return map;
  }, [matrix.cells]);

  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filteredItems = useMemo(() => matrix.items.filter((item) => {
    if (normalizedSearch && !item.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)) return false;
    if (!pendingOnly) return true;
    if (purchaseDeliveryPending(item) !== 0) return true;
    return matrix.cells.some((cell) =>
      cell.itemId === item.id &&
      (Boolean(cell.note) || ['shipping_note', 'attention', 'issue'].includes(cell.status)),
    );
  }), [matrix.items, matrix.cells, normalizedSearch, pendingOnly]);

  const pendencies = useMemo(() => matrix.cells
    .filter((cell) => Boolean(cell.note) || ['shipping_note', 'attention', 'issue'].includes(cell.status))
    .map((cell) => ({
      cell,
      item: matrix.items.find((item) => item.id === cell.itemId),
      destination: matrix.destinations.find((destination) => destination.id === cell.destinationId),
    }))
    .filter((entry) => entry.item && entry.destination), [matrix]);

  if (loading && !matrix.items.length) return <InlineLoading label="Carregando gerenciamento compra/entrega" />;
  if (error && !matrix.items.length) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="page-stack purchase-delivery-page">
      <section className="purchase-delivery-hero">
        <div>
          <span className="eyebrow">SUPRIMENTOS</span>
          <h1>Gerenciamento compra/entrega</h1>
          <p>Controle manual e independente de quantidades, compras, entregas e pendências.</p>
        </div>
        {canManage && (
          <div className="purchase-delivery-hero__actions">
            <button className="button button--secondary" onClick={() => setDestinationEditor(null)}>
              <Plus size={16} /> Loja / Prospector
            </button>
            <button className="button button--primary" onClick={() => setItemEditor(null)}>
              <Plus size={16} /> Item
            </button>
          </div>
        )}
      </section>

      <section className="purchase-delivery-toolbar">
        <label className="purchase-delivery-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar item" />
        </label>
        <button
          className={`button button--secondary${pendingOnly ? ' purchase-delivery-filter--active' : ''}`}
          onClick={() => setPendingOnly((current) => !current)}
        >
          <SlidersHorizontal size={16} /> {pendingOnly ? 'Mostrando pendentes' : 'Somente pendentes'}
        </button>
        <button
          className={`button button--secondary${showPendencies ? ' purchase-delivery-filter--active' : ''}`}
          onClick={() => setShowPendencies((current) => !current)}
        >
          <MessageSquareText size={16} /> Pendências ({pendencies.length})
        </button>
        <span className="purchase-delivery-count">{filteredItems.length} itens · {matrix.destinations.length} colunas</span>
      </section>

      <section className="purchase-delivery-legend" aria-label="Legenda">
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--matrix" /> Matriz / distribuir</span>
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--delivered" /> Entregue</span>
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--shipping_note" /> Envio com observação</span>
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--purchased" /> Verde da planilha</span>
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--attention" /> Laranja da planilha</span>
        <span><i className="purchase-delivery-swatch purchase-delivery-cell--do_not_buy" /> X = não comprar</span>
        <span className="purchase-delivery-legend__video"><Video size={14} /> Nome roxo = vídeo atendimento</span>
      </section>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <section className="purchase-delivery-matrix-card">
        <div className="purchase-delivery-scroll">
          <table className="purchase-delivery-table">
            <thead>
              <tr>
                <th className="purchase-delivery-sticky purchase-delivery-sticky--item" rowSpan={2}>Item</th>
                <th className="purchase-delivery-sticky purchase-delivery-sticky--pending" rowSpan={2}>Pendente</th>
                <th className="purchase-delivery-sticky purchase-delivery-sticky--total" rowSpan={2}>Compra Total</th>
                <th className="purchase-delivery-sticky purchase-delivery-sticky--acquired" rowSpan={2}>Qt. Adquirida</th>
                <th className="purchase-delivery-group-heading" colSpan={Math.max(matrix.destinations.length, 1)}>Lojas / Prospectores</th>
              </tr>
              <tr>
                {matrix.destinations.map((destination) => (
                  <th key={destination.id} className={`purchase-delivery-destination purchase-delivery-destination--${destination.headerTone}`}>
                    {destination.keyword && <span className="purchase-delivery-keyword">{destination.keyword}</span>}
                    <strong>{destination.label}</strong>
                    {destination.isVideoService && <span className="purchase-delivery-video"><Video size={12} /> vídeo</span>}
                    {canManage && (
                      <button className="purchase-delivery-edit-header" onClick={() => setDestinationEditor(destination)} title="Editar coluna">
                        <Pencil size={13} />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const pending = purchaseDeliveryPending(item);
                return (
                  <tr key={item.id}>
                    <td className="purchase-delivery-sticky purchase-delivery-sticky--item purchase-delivery-item-name">
                      <span>{item.name}</span>
                      {canManage && (
                        <button onClick={() => setItemEditor(item)} title="Editar item"><Pencil size={13} /></button>
                      )}
                    </td>
                    <td className={`purchase-delivery-sticky purchase-delivery-sticky--pending purchase-delivery-number ${pending < 0 ? 'is-negative' : pending > 0 ? 'is-positive' : 'is-zero'}`}>
                      {formatQuantity(pending)}
                    </td>
                    <td className="purchase-delivery-sticky purchase-delivery-sticky--total purchase-delivery-number">{formatQuantity(item.purchaseTotal)}</td>
                    <td className="purchase-delivery-sticky purchase-delivery-sticky--acquired purchase-delivery-number">{formatQuantity(item.acquiredQuantity)}</td>
                    {matrix.destinations.map((destination) => {
                      const cell = cellMap.get(`${item.id}:${destination.id}`) || null;
                      const status = cell?.status || 'none';
                      const text = status === 'do_not_buy' ? 'X' : formatQuantity(cell?.quantity ?? null) || '·';
                      return (
                        <td key={destination.id} className="purchase-delivery-cell-wrap">
                          <button
                            className={`purchase-delivery-cell purchase-delivery-cell--${status}${cell?.note ? ' has-note' : ''}`}
                            title={cell?.note || PURCHASE_DELIVERY_STATUS_LABELS[status]}
                            onClick={() => canManage && setCellEditor({ item, destination, cell })}
                            disabled={!canManage}
                          >
                            {text}
                            {cell?.note && <MessageSquareText size={11} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filteredItems.length && (
          <EmptyState title="Nenhum item encontrado" detail="Altere a busca ou retire o filtro de pendências." />
        )}
      </section>

      {showPendencies && (
        <section className="purchase-delivery-pendencies">
          <header>
            <div>
              <AlertTriangle size={18} />
              <div><h2>Pendências e observações</h2><p>Lista gerada somente a partir deste controle manual.</p></div>
            </div>
            <span>{pendencies.length} registros</span>
          </header>
          {pendencies.length ? (
            <div className="purchase-delivery-pendencies__list">
              {pendencies.map(({ cell, item, destination }) => item && destination && (
                <button
                  key={cell.id}
                  onClick={() => canManage && setCellEditor({ item, destination, cell })}
                  disabled={!canManage}
                >
                  <strong>{destination.label}</strong>
                  <span>{item.name}</span>
                  <em>{cell.note || PURCHASE_DELIVERY_STATUS_LABELS[cell.status]}</em>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem pendências registradas" detail="Inclua uma observação em qualquer célula da matriz." />
          )}
        </section>
      )}

      <section className="purchase-delivery-note">
        <PackageCheck size={18} />
        <div><strong>Controle independente</strong><span>Nada nesta página é preenchido automaticamente por Compras, Orçamento Previsto ou Financeiro.</span></div>
        <Truck size={18} />
      </section>

      {itemEditor !== undefined && (
        <ItemModal
          key={itemEditor?.id || 'new-item'}
          item={itemEditor}
          nextPosition={Math.max(0, ...matrix.items.map((item) => item.position)) + 1}
          onClose={() => setItemEditor(undefined)}
          onSaved={load}
        />
      )}
      {destinationEditor !== undefined && (
        <DestinationModal
          key={destinationEditor?.id || 'new-destination'}
          destination={destinationEditor}
          nextPosition={Math.max(0, ...matrix.destinations.map((destination) => destination.position)) + 1}
          onClose={() => setDestinationEditor(undefined)}
          onSaved={load}
        />
      )}
      {cellEditor && (
        <CellModal
          key={`${cellEditor.item.id}:${cellEditor.destination.id}`}
          {...cellEditor}
          onClose={() => setCellEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
