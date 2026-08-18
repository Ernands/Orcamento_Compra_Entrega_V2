import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit3,
  FilePlus2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import {
  EmptyState,
  ErrorState,
  IconButton,
  InlineLoading,
  Modal,
  StatusBadge,
} from '../components/ui';
import { deleteSupplyQuote } from '../data/supplies/quote-delete-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  listSuppliers,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
  saveSupplyQuote,
  setSupplyQuoteStatus,
} from '../data/supplies/supplies-repository';
import {
  calculateQuoteLine,
  calculateQuoteTotals,
  formatBRL,
  moneyToCents,
} from '../domain/supply-calculations';
import { SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
import { getEffectiveSupplyQuoteStatus } from '../domain/supply-quote-status';
import type {
  Store,
  Supplier,
  SupplyItem,
  SupplyNeed,
  SupplyQuote,
  SupplyQuoteItemValues,
  SupplyQuoteStatus,
  SupplyQuoteValues,
} from '../domain/types';

let lineSequence = 0;
function emptyLine(): SupplyQuoteItemValues {
  lineSequence += 1;
  return {
    key: `quote-line-${lineSequence}`,
    supplyItemId: '',
    storeNeedId: '',
    storeId: '',
    quantity: '1',
    unit: 'un',
    unitPrice: '0',
    discountAmount: '0',
    shippingType: 'pending',
    shippingAmount: '',
    otherCosts: '0',
    deliveryDays: '',
    minimumQuantity: '',
    offeredBrandModel: '',
    notes: '',
    productUrl: '',
    capturedAt: '',
  };
}

function safeCalculateLine(line: SupplyQuoteItemValues) {
  try {
    return calculateQuoteLine(line);
  } catch {
    return null;
  }
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyQuote(): SupplyQuoteValues {
  return {
    id: null,
    supplierId: '',
    supplierChannelId: '',
    quoteDate: todayLocal(),
    validUntil: '',
    contact: '',
    contextType: 'store',
    status: 'draft',
    notes: '',
    storeIds: [],
    items: [emptyLine()],
  };
}

function quoteValues(quote: SupplyQuote | null): SupplyQuoteValues {
  if (!quote) return emptyQuote();
  return {
    id: quote.id,
    supplierId: quote.supplierId,
    supplierChannelId: quote.supplierChannelId,
    quoteDate: quote.quoteDate,
    validUntil: quote.validUntil || '',
    contact: quote.contact || '',
    contextType: quote.contextType,
    status: quote.status,
    notes: quote.notes || '',
    storeIds: quote.stores.map((store) => store.id),
    items: quote.items.map((item) => ({
      key: item.id,
      supplyItemId: item.supplyItemId,
      storeNeedId: item.storeNeedId || '',
      storeId: item.storeId || '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      shippingType: item.shippingType,
      shippingAmount: item.shippingAmount || '',
      otherCosts: item.otherCosts,
      deliveryDays: item.deliveryDays === null ? '' : String(item.deliveryDays),
      minimumQuantity: item.minimumQuantity || '',
      offeredBrandModel: item.offeredBrandModel || '',
      notes: item.notes || '',
      productUrl: item.productUrl || '',
      capturedAt: item.capturedAt ? item.capturedAt.slice(0, 16) : '',
    })),
  };
}

function QuoteModal({
  open,
  quote,
  initialNeedId,
  items,
  needs,
  suppliers,
  stores,
  onClose,
  onSaved,
}: {
  open: boolean;
  quote: SupplyQuote | null;
  initialNeedId: string | null;
  items: SupplyItem[];
  needs: SupplyNeed[];
  suppliers: Supplier[];
  stores: Store[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<SupplyQuoteValues>(emptyQuote());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = quoteValues(quote);
    const initialNeed =
      !quote && initialNeedId ? needs.find((need) => need.id === initialNeedId) : null;
    if (initialNeed) {
      next.storeIds = [initialNeed.storeId];
      next.items[0] = {
        ...next.items[0],
        storeNeedId: initialNeed.id,
        storeId: initialNeed.storeId,
        supplyItemId: initialNeed.supplyItemId || '',
        quantity: String(initialNeed.quantity),
        unit: initialNeed.unit || 'un',
      };
    }
    setValues(next);
    setError(null);
  }, [initialNeedId, needs, open, quote]);

  const set = <K extends keyof SupplyQuoteValues>(key: K, value: SupplyQuoteValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const setLine = <K extends keyof SupplyQuoteItemValues>(
    index: number,
    key: K,
    value: SupplyQuoteItemValues[K],
  ) =>
    setValues((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    }));

  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId);
  const channels = selectedSupplier?.channels.filter((channel) => channel.active) || [];
  const visibleNeeds = needs.filter(
    (need) =>
      values.storeIds.includes(need.storeId) && !['cancelled', 'resolved'].includes(need.status),
  );
  const totals = useMemo(() => {
    try {
      return calculateQuoteTotals(values.items);
    } catch {
      return null;
    }
  }, [values.items]);
  const allStoresSelected = stores.length > 0 && values.storeIds.length === stores.length;

  const selectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((entry) => entry.id === supplierId);
    setValues((current) => ({
      ...current,
      supplierId,
      supplierChannelId: supplier?.channels.find((channel) => channel.active)?.id || '',
      contact: supplier?.contactName || supplier?.email || supplier?.phone || '',
    }));
  };

  const selectNeed = (index: number, needId: string) => {
    const need = needs.find((entry) => entry.id === needId);
    if (!need) {
      setLine(index, 'storeNeedId', '');
      return;
    }
    const item = items.find((entry) => entry.id === need.supplyItemId);
    setValues((current) => ({
      ...current,
      storeIds:
        current.contextType === 'store'
          ? [need.storeId]
          : [...new Set([...current.storeIds, need.storeId])],
      items: current.items.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              storeNeedId: need.id,
              storeId: need.storeId,
              supplyItemId: need.supplyItemId || line.supplyItemId,
              quantity: String(need.quantity),
              unit: need.unit || item?.defaultUnit || line.unit,
            }
          : line,
      ),
    }));
  };

  const selectItem = (index: number, itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    setLine(index, 'supplyItemId', itemId);
    if (item) setLine(index, 'unit', item.defaultUnit);
  };

  const changeContext = (contextType: SupplyQuoteValues['contextType']) => {
    setValues((current) => ({
      ...current,
      contextType,
      storeIds: contextType === 'store' ? current.storeIds.slice(0, 1) : current.storeIds,
      items: current.items.map((line) =>
        contextType === 'store' ? { ...line, storeId: current.storeIds[0] || line.storeId } : line,
      ),
    }));
  };

  const toggleStore = (storeId: string) => {
    setValues((current) => {
      const selected = current.storeIds.includes(storeId)
        ? current.storeIds.filter((id) => id !== storeId)
        : [...current.storeIds, storeId];
      return {
        ...current,
        storeIds: selected,
        items: current.items.map((line) =>
          selected.includes(line.storeId) ? line : { ...line, storeId: '' },
        ),
      };
    });
  };

  const toggleAllStores = () => {
    setValues((current) => {
      const selected =
        stores.length > 0 && current.storeIds.length === stores.length
          ? []
          : stores.map((store) => store.id);
      return {
        ...current,
        storeIds: selected,
        items: current.items.map((line) =>
          selected.includes(line.storeId) ? line : { ...line, storeId: '' },
        ),
      };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !values.supplierId ||
      !values.supplierChannelId ||
      !values.quoteDate ||
      !values.storeIds.length
    ) {
      setError('Informe fornecedor, canal, data e lojas da cotacao.');
      return;
    }
    if (values.contextType === 'consolidated' && values.storeIds.length < 2) {
      setError('A cotacao consolidada exige pelo menos duas lojas.');
      return;
    }
    if (values.validUntil && values.validUntil < values.quoteDate) {
      setError('A validade nao pode ser anterior a data da cotacao.');
      return;
    }
    try {
      values.items.forEach((line) => {
        if (!line.supplyItemId || !line.quantity || !line.unit || !line.unitPrice)
          throw new Error();
        if (values.contextType === 'store' && !line.storeId) throw new Error();
        if (line.shippingType === 'informed' && line.shippingAmount === '') throw new Error();
        const calculation = calculateQuoteLine(line);
        if (calculation.totalCents < 0n) throw new Error();
      });
    } catch {
      setError('Revise item, loja, quantidade, preco, desconto e frete das linhas.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveSupplyQuote(values);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel salvar a cotacao. Verifique escopo, itens ativos e necessidades.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      className="quote-modal"
      open={open}
      title={quote ? `Editar ${quote.code}` : 'Nova cotacao'}
      description="Fornecedor, contexto e itens historicos da proposta."
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="quote-form-section">
          <h3>Cabecalho</h3>
          <div className="form-grid form-grid--three">
            <label className="field">
              Fornecedor
              <select
                aria-label="Fornecedor"
                value={values.supplierId}
                onChange={(event) => selectSupplier(event.target.value)}
                required
              >
                <option value="">Selecione</option>
                {suppliers
                  .filter((supplier) => supplier.active)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code} - {supplier.tradeName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Canal / origem
              <select
                aria-label="Canal / origem"
                value={values.supplierChannelId}
                onChange={(event) => set('supplierChannelId', event.target.value)}
                required
              >
                <option value="">Selecione</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {SUPPLIER_CHANNEL_LABELS[channel.type]}
                    {channel.label ? ` - ${channel.label}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Contato
              <input
                value={values.contact}
                onChange={(event) => set('contact', event.target.value)}
              />
            </label>
            <label className="field">
              Data da cotacao
              <input
                type="date"
                value={values.quoteDate}
                onChange={(event) => set('quoteDate', event.target.value)}
                required
              />
            </label>
            <label className="field">
              Validade
              <input
                type="date"
                value={values.validUntil}
                onChange={(event) => set('validUntil', event.target.value)}
                min={values.quoteDate}
              />
            </label>
            <label className="field">
              Status
              <select value={values.status} disabled>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>
        </div>

        <div className="quote-form-section">
          <h3>Contexto</h3>
          <div className="segmented" role="group" aria-label="Contexto da cotacao">
            <button
              type="button"
              className={values.contextType === 'store' ? 'is-active' : ''}
              onClick={() => changeContext('store')}
            >
              Uma loja
            </button>
            <button
              type="button"
              className={values.contextType === 'consolidated' ? 'is-active' : ''}
              onClick={() => changeContext('consolidated')}
            >
              Consolidada
            </button>
          </div>

          {values.contextType === 'store' ? (
            <label className="field quote-store-select">
              Loja
              <select
                aria-label="Loja da cotacao"
                value={values.storeIds[0] || ''}
                onChange={(event) => {
                  const storeId = event.target.value;
                  setValues((current) => ({
                    ...current,
                    storeIds: storeId ? [storeId] : [],
                    items: current.items.map((line) => ({ ...line, storeId })),
                  }));
                }}
                required
              >
                <option value="">Selecione</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} - {store.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="stack-form" style={{ gap: 12 }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 9,
                  width: 'fit-content',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={allStoresSelected}
                  onChange={toggleAllStores}
                  disabled={!stores.length}
                />
                <span>Selecionar todas as lojas</span>
                <small style={{ color: 'var(--muted)', fontWeight: 500 }}>
                  {values.storeIds.length}/{stores.length} selecionadas
                </small>
              </label>
              <div className="store-check-grid">
                {stores.map((store) => (
                  <label key={store.id}>
                    <input
                      type="checkbox"
                      checked={values.storeIds.includes(store.id)}
                      onChange={() => toggleStore(store.id)}
                    />
                    <span>
                      <strong>{store.code}</strong>
                      <small>
                        {store.city}/{store.state}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="quote-form-section">
          <div className="quote-form-section__heading">
            <h3>Itens cotados</h3>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => {
                const line = emptyLine();
                if (values.contextType === 'store') line.storeId = values.storeIds[0] || '';
                set('items', [...values.items, line]);
              }}
            >
              <Plus size={16} />
              Adicionar item
            </button>
          </div>
          <div className="quote-line-list">
            {values.items.map((line, index) => {
              const calculation = safeCalculateLine(line);
              return (
                <article className="quote-line-editor" key={line.key}>
                  <header>
                    <strong>Item {index + 1}</strong>
                    {values.items.length > 1 && (
                      <IconButton
                        label={`Remover item ${index + 1}`}
                        onClick={() =>
                          set(
                            'items',
                            values.items.filter((_, lineIndex) => lineIndex !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </header>
                  <div className="form-grid form-grid--three">
                    <label className="field">
                      Necessidade
                      <select
                        aria-label={`Necessidade ${index + 1}`}
                        value={line.storeNeedId}
                        onChange={(event) => selectNeed(index, event.target.value)}
                      >
                        <option value="">Sem vinculo especifico</option>
                        {visibleNeeds.map((need) => (
                          <option key={need.id} value={need.id}>
                            {need.storeCode} - {need.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Item do catalogo
                      <select
                        aria-label={`Item do catalogo ${index + 1}`}
                        value={line.supplyItemId}
                        onChange={(event) => selectItem(index, event.target.value)}
                        required
                      >
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
                    <label className="field">
                      Loja
                      <select
                        aria-label={`Loja do item ${index + 1}`}
                        value={line.storeId}
                        onChange={(event) => setLine(index, 'storeId', event.target.value)}
                        disabled={values.contextType === 'store'}
                      >
                        <option value="">
                          {values.contextType === 'consolidated'
                            ? 'Preco consolidado'
                            : 'Selecione'}
                        </option>
                        {stores
                          .filter((store) => values.storeIds.includes(store.id))
                          .map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.code}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      Quantidade
                      <input
                        aria-label={`Quantidade ${index + 1}`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(event) => setLine(index, 'quantity', event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      Unidade
                      <input
                        aria-label={`Unidade ${index + 1}`}
                        value={line.unit}
                        onChange={(event) => setLine(index, 'unit', event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      Preco unitario
                      <input
                        aria-label={`Preco unitario ${index + 1}`}
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) => setLine(index, 'unitPrice', event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      Desconto
                      <input
                        aria-label={`Desconto ${index + 1}`}
                        inputMode="decimal"
                        value={line.discountAmount}
                        onChange={(event) => setLine(index, 'discountAmount', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      Frete
                      <select
                        aria-label={`Frete ${index + 1}`}
                        value={line.shippingType}
                        onChange={(event) =>
                          setLine(
                            index,
                            'shippingType',
                            event.target.value as SupplyQuoteItemValues['shippingType'],
                          )
                        }
                      >
                        <option value="pending">A consultar</option>
                        <option value="free">Gratis</option>
                        <option value="informed">Informado</option>
                      </select>
                    </label>
                    <label className="field">
                      Valor do frete
                      <input
                        aria-label={`Valor do frete ${index + 1}`}
                        inputMode="decimal"
                        value={line.shippingAmount}
                        onChange={(event) => setLine(index, 'shippingAmount', event.target.value)}
                        disabled={line.shippingType !== 'informed'}
                        required={line.shippingType === 'informed'}
                      />
                    </label>
                    <label className="field">
                      Outros custos
                      <input
                        aria-label={`Outros custos ${index + 1}`}
                        inputMode="decimal"
                        value={line.otherCosts}
                        onChange={(event) => setLine(index, 'otherCosts', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      Prazo em dias
                      <input
                        aria-label={`Prazo em dias ${index + 1}`}
                        type="number"
                        min="0"
                        value={line.deliveryDays}
                        onChange={(event) => setLine(index, 'deliveryDays', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      Quantidade minima
                      <input
                        inputMode="decimal"
                        value={line.minimumQuantity}
                        onChange={(event) => setLine(index, 'minimumQuantity', event.target.value)}
                      />
                    </label>
                    <label className="field form-grid__wide">
                      Marca / modelo ofertado
                      <input
                        value={line.offeredBrandModel}
                        onChange={(event) =>
                          setLine(index, 'offeredBrandModel', event.target.value)
                        }
                      />
                    </label>
                    <label className="field form-grid__wide">
                      URL do produto
                      <input
                        type="url"
                        value={line.productUrl}
                        onChange={(event) => setLine(index, 'productUrl', event.target.value)}
                        placeholder="https://"
                      />
                    </label>
                    <label className="field">
                      Data da captura
                      <input
                        type="datetime-local"
                        value={line.capturedAt}
                        onChange={(event) => setLine(index, 'capturedAt', event.target.value)}
                      />
                    </label>
                    <label className="field form-grid__wide">
                      Observacoes
                      <input
                        value={line.notes}
                        onChange={(event) => setLine(index, 'notes', event.target.value)}
                      />
                    </label>
                  </div>
                  <footer>
                    <span>
                      Subtotal{' '}
                      <strong>{calculation ? formatBRL(calculation.subtotalCents) : '-'}</strong>
                    </span>
                    <span>
                      Total <strong>{calculation ? formatBRL(calculation.totalCents) : '-'}</strong>
                    </span>
                    {calculation?.shippingPending && <small>Frete a consultar</small>}
                  </footer>
                </article>
              );
            })}
          </div>
        </div>

        <div className="quote-total-strip">
          <span>
            Itens<strong>{totals ? formatBRL(totals.itemsCents) : '-'}</strong>
          </span>
          <span>
            Frete<strong>{totals ? formatBRL(totals.shippingCents) : '-'}</strong>
          </span>
          <span>
            Outros custos<strong>{totals ? formatBRL(totals.otherCostsCents) : '-'}</strong>
          </span>
          <span>
            Descontos<strong>{totals ? formatBRL(totals.discountCents) : '-'}</strong>
          </span>
          <span>
            Total<strong>{totals ? formatBRL(totals.totalCents) : '-'}</strong>
          </span>
          {totals?.shippingPending && <small>Ha frete a consultar</small>}
        </div>

        <label className="field">
          Observacoes gerais
          <textarea
            rows={3}
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar cotacao'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
    : 'Nao informada';
}

const QUOTE_STATUS_TRANSITIONS: Partial<Record<SupplyQuoteStatus, SupplyQuoteStatus[]>> = {
  draft: ['received', 'cancelled'],
  received: ['cancelled', 'expired'],
};

const QUOTE_STATUS_ACTIONS: Record<
  Exclude<SupplyQuoteStatus, 'draft'>,
  { label: string; icon: typeof CheckCircle2 }
> = {
  received: { label: 'Marcar como recebida', icon: CheckCircle2 },
  cancelled: { label: 'Cancelar cotacao', icon: Ban },
  expired: { label: 'Marcar como expirada', icon: Clock3 },
};

function QuoteStatusModal({
  quote,
  onClose,
  onSaved,
}: {
  quote: SupplyQuote | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [quote]);

  const changeStatus = async (status: SupplyQuoteStatus) => {
    if (!quote) return;
    setSaving(true);
    setError(null);
    try {
      await setSupplyQuoteStatus(quote.id, status);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel alterar o status desta cotacao.');
    } finally {
      setSaving(false);
    }
  };

  const transitions = quote ? QUOTE_STATUS_TRANSITIONS[quote.status] || [] : [];
  return (
    <Modal
      open={Boolean(quote)}
      title={quote ? `Alterar status ${quote.code}` : 'Alterar status'}
      description="Os itens e valores historicos permanecerao inalterados."
      onClose={onClose}
    >
      {quote && (
        <div className="stack-form">
          <p>
            Status atual: <StatusBadge status={getEffectiveSupplyQuoteStatus(quote)} />
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="button button--secondary" onClick={onClose}>
              Fechar
            </button>
            {transitions.map((status) => {
              const action = QUOTE_STATUS_ACTIONS[status as Exclude<SupplyQuoteStatus, 'draft'>];
              const ActionIcon = action.icon;
              return (
                <button
                  type="button"
                  className={`button ${status === 'cancelled' ? 'button--danger' : 'button--primary'}`}
                  disabled={saving}
                  onClick={() => void changeStatus(status)}
                  key={status}
                >
                  <ActionIcon size={18} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function QuoteDeleteModal({
  quote,
  onClose,
  onDeleted,
}: {
  quote: SupplyQuote | null;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDeleting(false);
  }, [quote]);

  const remove = async () => {
    if (!quote) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSupplyQuote(quote.id);
      await onDeleted();
      onClose();
    } catch {
      setError('Nao foi possivel excluir a cotacao. Apenas cotacoes em Draft podem ser excluidas.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={Boolean(quote)}
      title={quote ? `Excluir ${quote.code}` : 'Excluir cotacao'}
      description="Exclusao definitiva permitida somente enquanto a cotacao estiver em Draft."
      onClose={onClose}
    >
      {quote && (
        <div className="stack-form">
          <p className="modal-copy">
            A cotacao de <strong>{quote.supplierName}</strong>, seus itens e vinculos com lojas serao
            removidos. A exclusao ficara registrada na auditoria.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => void remove()}
              disabled={deleting}
            >
              <Trash2 size={18} />
              {deleting ? 'Excluindo...' : 'Excluir cotacao'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SupplyQuotesPage() {
  const { can } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<SupplyQuote[]>([]);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [needs, setNeeds] = useState<SupplyNeed[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [storeId, setStoreId] = useState('');
  const [editing, setEditing] = useState<SupplyQuote | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusQuote, setStatusQuote] = useState<SupplyQuote | null>(null);
  const [deletingQuote, setDeletingQuote] = useState<SupplyQuote | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedQuotes, loadedItems, loadedNeeds, loadedSuppliers, loadedStores] =
        await Promise.all([
          listSupplyQuotes(),
          listSupplyItems(),
          listSupplyNeeds(),
          listSuppliers(),
          listStores(),
        ]);
      setQuotes(loadedQuotes);
      setItems(loadedItems);
      setNeeds(loadedNeeds);
      setSuppliers(loadedSuppliers);
      setStores(loadedStores);
    } catch {
      setError('Nao foi possivel carregar as cotacoes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && searchParams.get('need') && can('quotes.create')) setModalOpen(true);
  }, [can, loading, searchParams]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return quotes.filter(
      (quote) =>
        (!search ||
          [quote.code, quote.supplierName, ...quote.items.map((item) => item.itemName)]
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(search)) &&
        (!status || getEffectiveSupplyQuoteStatus(quote) === status) &&
        (!storeId || quote.stores.some((store) => store.id === storeId)),
    );
  }, [query, quotes, status, storeId]);

  const allFilteredExpanded =
    filtered.length > 0 && filtered.every((quote) => expandedIds.has(quote.id));

  const toggleQuoteDetails = (quoteId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(quoteId)) next.delete(quoteId);
      else next.add(quoteId);
      return next;
    });
  };

  const toggleAllDetails = () => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (allFilteredExpanded) filtered.forEach((quote) => next.delete(quote.id));
      else filtered.forEach((quote) => next.add(quote.id));
      return next;
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    if (searchParams.has('need')) {
      const next = new URLSearchParams(searchParams);
      next.delete('need');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Cotacoes</h2>
          <p>Historico de propostas por fornecedor, canal, loja e item.</p>
        </div>
        <div className="page-heading__actions">
          <div className="summary-number">
            <strong>{quotes.length}</strong>
            <span>cotacoes</span>
          </div>
          {can('quotes.create') && (
            <button
              className="button button--primary"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <FilePlus2 size={18} />
              Nova cotacao
            </button>
          )}
        </div>
      </header>

      <div className="supply-filter-grid supply-filter-grid--compact">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar cotacoes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar codigo, fornecedor ou item"
          />
        </label>
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos status</option>
          <option value="draft">Draft</option>
          <option value="received">Recebida</option>
          <option value="expired">Expirada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select
          aria-label="Filtrar loja"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
        >
          <option value="">Todas lojas</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.code}
            </option>
          ))}
        </select>
      </div>

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={toggleAllDetails}
          >
            {allFilteredExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            {allFilteredExpanded ? 'Recolher todos os detalhes' : 'Ver todos os detalhes'}
          </button>
        </div>
      )}

      {loading ? (
        <InlineLoading label="Carregando cotacoes" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length ? (
        <div className="quote-list">
          <div className="quote-list__header">
            <span>Cotacao</span>
            <span>Fornecedor / origem</span>
            <span>Lojas</span>
            <span>Data / validade</span>
            <span>Itens</span>
            <span>Total</span>
            <span>Status</span>
            <span />
          </div>
          {filtered.map((quote) => {
            const totals = calculateQuoteTotals(quote.items);
            const expanded = expandedIds.has(quote.id);
            return (
              <div className="quote-list__group" key={quote.id}>
                <article className="quote-row">
                  <div className="supply-identity">
                    <small>{quote.code}</small>
                    <strong>
                      {quote.contextType === 'consolidated' ? 'Consolidada' : 'Por loja'}
                    </strong>
                  </div>
                  <div>
                    <strong>{quote.supplierName}</strong>
                    <small>
                      {SUPPLIER_CHANNEL_LABELS[quote.channel]}
                      {quote.originCity ? ` - ${quote.originCity}/${quote.originState}` : ''}
                    </small>
                  </div>
                  <span>{quote.stores.map((store) => store.code).join(', ')}</span>
                  <span>
                    {formatDate(quote.quoteDate)}
                    <small>Validade: {formatDate(quote.validUntil)}</small>
                  </span>
                  <strong>{quote.items.length}</strong>
                  <span>
                    <strong>{formatBRL(totals.totalCents)}</strong>
                    {totals.shippingPending && <small>Frete pendente</small>}
                  </span>
                  <StatusBadge status={getEffectiveSupplyQuoteStatus(quote)} />
                  <div className="row-actions">
                    <IconButton
                      label={expanded ? `Recolher ${quote.code}` : `Detalhar ${quote.code}`}
                      onClick={() => toggleQuoteDetails(quote.id)}
                    >
                      {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                    </IconButton>
                    {can('quotes.edit') && quote.status === 'draft' && (
                      <>
                        <IconButton
                          label={`Editar ${quote.code}`}
                          onClick={() => {
                            setEditing(quote);
                            setModalOpen(true);
                          }}
                        >
                          <Edit3 size={17} />
                        </IconButton>
                        <IconButton
                          label={`Excluir ${quote.code}`}
                          onClick={() => setDeletingQuote(quote)}
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </>
                    )}
                    {can('quotes.edit') && QUOTE_STATUS_TRANSITIONS[quote.status]?.length && (
                      <IconButton
                        label={`Alterar status ${quote.code}`}
                        onClick={() => setStatusQuote(quote)}
                      >
                        <RefreshCcw size={17} />
                      </IconButton>
                    )}
                  </div>
                </article>

                {expanded && (
                  <div className="quote-detail-lines">
                    {quote.items.map((item) => {
                      const total = calculateQuoteLine(item);
                      return (
                        <div key={item.id}>
                          <span>
                            <strong>
                              {item.itemCode} - {item.itemName}
                            </strong>
                            <small>
                              {item.storeCode || 'Consolidado'}
                              {item.needTitle ? ` - ${item.needTitle}` : ''}
                            </small>
                          </span>
                          <span>
                            {item.quantity} {item.unit}
                          </span>
                          <span>{formatBRL(moneyToCents(item.unitPrice))}</span>
                          <span>
                            Frete:{' '}
                            {item.shippingType === 'pending'
                              ? 'A consultar'
                              : formatBRL(total.shippingCents || 0n)}
                          </span>
                          <strong>{formatBRL(total.totalCents)}</strong>
                          <span>
                            {item.deliveryDays === null
                              ? 'Prazo nao informado'
                              : `${item.deliveryDays} dias`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma cotacao encontrada"
          detail="Crie uma cotacao ou ajuste os filtros."
        />
      )}

      <QuoteModal
        open={modalOpen}
        quote={editing}
        initialNeedId={searchParams.get('need')}
        items={items}
        needs={needs}
        suppliers={suppliers}
        stores={stores}
        onClose={closeModal}
        onSaved={load}
      />
      <QuoteStatusModal quote={statusQuote} onClose={() => setStatusQuote(null)} onSaved={load} />
      <QuoteDeleteModal
        quote={deletingQuote}
        onClose={() => setDeletingQuote(null)}
        onDeleted={load}
      />
    </section>
  );
}
