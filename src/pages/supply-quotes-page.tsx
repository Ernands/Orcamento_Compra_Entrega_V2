import {
  Ban,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  Edit3,
  ExternalLink,
  FilePlus2,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { ItemMultiFilter, matchesSelectedItems, type ItemFilterOption } from '../components/item-multi-filter';
import { QuoteAttachmentsModal, QuoteAttachmentsPanel } from '../components/quote-attachments';
import { QuoteSummaryModal } from '../components/quote-summary-modal';
import {
  EmptyState,
  ErrorState,
  IconButton,
  InlineLoading,
  Modal,
  StatusBadge,
} from '../components/ui';
import { listStores } from '../data/stores/stores-repository';
import { listSupplyQuoteAttachments } from '../data/attachments/quote-attachments-repository';
import { approveSupplyQuoteForPurchase, type PaymentMethod } from '../data/purchases/purchases-repository';
import {
  EMPTY_QUOTE_PAYMENT_TERMS,
  getQuotePaymentTerms,
  saveSupplyQuoteWithPaymentTerms,
  type QuotePaymentTerms,
} from '../data/purchases/quote-payment-terms-repository';
import {
  deleteSupplyQuote,
  listSuppliers,
  listSupplyFreightProfiles,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
  setSupplyQuoteStatus,
} from '../data/supplies/supplies-repository';
import {
  calculateQuoteLine,
  calculateQuoteTotals,
  formatBRL,
  getQuoteLineDeliveryDays,
  moneyToCents,
  quantityToThousandths,
} from '../domain/supply-calculations';
import {
  getGroupedComparisonHighlights,
  getGroupedQuoteComparisonHighlights,
  getQuoteDeliveryDays,
} from '../domain/supply-comparison';
import { SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
import {
  buildDestinationValues,
  destinationValuesFromSaved,
  getProfileDestinationOptions,
  getStoreDestinationOptions,
  inferShippingType,
} from '../domain/supply-freight';
import { selectLowestPriceQuotesByItem } from '../domain/supply-quote-lowest-price';
import {
  getEffectiveSupplyQuoteStatus,
  SUPPLY_QUOTE_STATUS_LABELS,
} from '../domain/supply-quote-status';
import type {
  Store,
  Supplier,
  SupplyComparisonMode,
  SupplyFreightProfile,
  SupplyItem,
  SupplyNeed,
  SupplyQuote,
  SupplyQuoteAttachment,
  SupplyQuoteItemDestinationValues,
  SupplyQuoteItemValues,
  SupplyQuoteStatus,
  SupplyQuoteValues,
} from '../domain/types';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferencia bancaria',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

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
    destinations: [],
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
      destinations: (item.destinations || []).map(destinationValuesFromSaved),
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
  freightProfiles,
  onClose,
  onSaved,
  canEdit,
  onAttachmentsChanged,
}: {
  open: boolean;
  quote: SupplyQuote | null;
  initialNeedId: string | null;
  items: SupplyItem[];
  needs: SupplyNeed[];
  suppliers: Supplier[];
  stores: Store[];
  freightProfiles: SupplyFreightProfile[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
  onAttachmentsChanged: () => Promise<void>;
}) {
  const [values, setValues] = useState<SupplyQuoteValues>(emptyQuote());
  const [paymentTerms, setPaymentTerms] = useState<QuotePaymentTerms>(EMPTY_QUOTE_PAYMENT_TERMS);
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
    setPaymentTerms(EMPTY_QUOTE_PAYMENT_TERMS);
    if (quote) {
      void getQuotePaymentTerms(quote.id)
        .then(setPaymentTerms)
        .catch(() => setError('Nao foi possivel carregar as condicoes de pagamento.'));
    }
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

  const setDestination = <K extends keyof SupplyQuoteItemDestinationValues>(
    lineIndex: number,
    destinationIndex: number,
    key: K,
    value: SupplyQuoteItemDestinationValues[K],
  ) =>
    setValues((current) => ({
      ...current,
      items: current.items.map((line, currentLineIndex) =>
        currentLineIndex === lineIndex
          ? {
              ...line,
              destinations: line.destinations.map((destination, currentDestinationIndex) =>
                currentDestinationIndex === destinationIndex
                  ? { ...destination, [key]: value }
                  : destination,
              ),
            }
          : line,
      ),
    }));

  const setDestinationShipping = (lineIndex: number, destinationIndex: number, value: string) => {
    let shippingType: SupplyQuoteItemDestinationValues['shippingType'] = 'pending';
    try {
      shippingType = inferShippingType(value);
    } catch {
      shippingType = 'informed';
    }
    setValues((current) => ({
      ...current,
      items: current.items.map((line, currentLineIndex) =>
        currentLineIndex === lineIndex
          ? {
              ...line,
              destinations: line.destinations.map((destination, currentDestinationIndex) =>
                currentDestinationIndex === destinationIndex
                  ? { ...destination, shippingAmount: value, shippingType }
                  : destination,
              ),
            }
          : line,
      ),
    }));
  };

  const buildLineDestinations = (
    line: SupplyQuoteItemValues,
    quoteStoreIds: string[],
    mode: 'profile' | 'store',
  ) => {
    if (mode === 'profile') {
      const { options, uncoveredStoreIds } = getProfileDestinationOptions(
        quoteStoreIds,
        freightProfiles,
        line.storeId,
      );
      if (uncoveredStoreIds.length) {
        const uncoveredNames = uncoveredStoreIds
          .map((storeId) => stores.find((store) => store.id === storeId)?.code || storeId)
          .join(', ');
        throw new Error(
          `Lojas sem perfil de frete: ${uncoveredNames}. Use "Lojas da cotacao" para este item.`,
        );
      }
      if (!options.length) throw new Error('Nenhum perfil de frete atende o escopo deste item.');
      return buildDestinationValues(line.quantity, line.unit, options);
    }
    const options = getStoreDestinationOptions(quoteStoreIds, stores, line.storeId);
    if (!options.length) throw new Error('Nenhuma loja de destino disponivel para este item.');
    return buildDestinationValues(line.quantity, line.unit, options);
  };

  const applyDestinationMode = (lineIndex: number, mode: 'profile' | 'store') => {
    setError(null);
    try {
      const line = values.items[lineIndex];
      setLine(lineIndex, 'destinations', buildLineDestinations(line, values.storeIds, mode));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Nao foi possivel montar os destinos.');
    }
  };

  const applyDestinationModeToAll = (mode: 'profile' | 'store') => {
    setError(null);
    try {
      const destinationsByLine = values.items.map((line) =>
        buildLineDestinations(line, values.storeIds, mode),
      );
      setValues((current) => ({
        ...current,
        items: current.items.map((line, index) => ({
          ...line,
          destinations: destinationsByLine[index] || [],
        })),
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Nao foi possivel montar os destinos.');
    }
  };

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
        contextType === 'store'
          ? { ...line, storeId: current.storeIds[0] || line.storeId, destinations: [] }
          : { ...line, destinations: [] },
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
          selected.includes(line.storeId)
            ? { ...line, destinations: [] }
            : { ...line, storeId: '', destinations: [] },
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
          selected.includes(line.storeId)
            ? { ...line, destinations: [] }
            : { ...line, storeId: '', destinations: [] },
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
        if (!line.destinations.length && line.shippingType === 'informed' && line.shippingAmount === '') {
          throw new Error();
        }
        if (line.destinations.length) {
          let destinationQuantity = 0n;
          line.destinations.forEach((destination) => {
            destinationQuantity += quantityToThousandths(destination.quantity);
            if (destination.shippingAmount.trim() !== '' && moneyToCents(destination.shippingAmount) < 0n) {
              throw new Error();
            }
            if (destination.deliveryDays && Number(destination.deliveryDays) < 0) throw new Error();
          });
          if (destinationQuantity !== quantityToThousandths(line.quantity)) throw new Error();
        }
        const calculation = calculateQuoteLine(line);
        if (calculation.totalCents < 0n) throw new Error();
      });
      if (paymentTerms.entryAmount) moneyToCents(paymentTerms.entryAmount);
      if (paymentTerms.installmentCount && Number(paymentTerms.installmentCount) < 1) throw new Error();
    } catch {
      setError('Revise item, loja, quantidade, preco, desconto, frete e condicoes de pagamento.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveSupplyQuoteWithPaymentTerms(values, paymentTerms);
      await onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : 'Nao foi possivel salvar a cotacao. Verifique escopo, itens ativos e necessidades.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      className="quote-modal"
      open={open}
      title={quote ? `Editar ${quote.code}` : 'Nova cotacao'}
      description="Fornecedor, contexto, pagamento e itens historicos da proposta."
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
              <input
                value={
                  quote
                    ? SUPPLY_QUOTE_STATUS_LABELS[getEffectiveSupplyQuoteStatus(quote)]
                    : SUPPLY_QUOTE_STATUS_LABELS.draft
                }
                readOnly
              />
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
                    items: current.items.map((line) => ({ ...line, storeId, destinations: [] })),
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
            <div className="quote-freight-actions">
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => applyDestinationModeToAll('profile')}
                disabled={!values.storeIds.length}
              >
                Prospectores / UF em todos
              </button>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => applyDestinationModeToAll('store')}
                disabled={!values.storeIds.length}
              >
                Lojas em todos
              </button>
            </div>
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
                        onChange={(event) => {
                          setLine(index, 'storeId', event.target.value);
                          setLine(index, 'destinations', []);
                        }}
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
                              {store.code} - {store.name}
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
                    {!line.destinations.length && (
                      <>
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
                      </>
                    )}
                    <label className="field">
                      Outros custos
                      <input
                        aria-label={`Outros custos ${index + 1}`}
                        inputMode="decimal"
                        value={line.otherCosts}
                        onChange={(event) => setLine(index, 'otherCosts', event.target.value)}
                      />
                    </label>
                    {!line.destinations.length && (
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
                    )}
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
                  <div className="freight-destination-editor">
                    <div className="freight-destination-editor__heading">
                      <div>
                        <strong>Destinos de frete</strong>
                        <small>Vazio = A consultar · 0 = Frete gratis · maior que 0 = frete informado</small>
                      </div>
                      <div className="quote-freight-actions">
                        <button type="button" onClick={() => applyDestinationMode(index, 'profile')}>
                          Prospectores / UF
                        </button>
                        <button type="button" onClick={() => applyDestinationMode(index, 'store')}>
                          Lojas da cotacao
                        </button>
                        {line.destinations.length > 0 && (
                          <button type="button" onClick={() => setLine(index, 'destinations', [])}>
                            Frete geral
                          </button>
                        )}
                      </div>
                    </div>
                    {line.destinations.length > 0 ? (
                      <div className="freight-destination-list">
                        {line.destinations.map((destination, destinationIndex) => (
                          <div className="freight-destination-row" key={destination.key}>
                            <span>
                              <strong>{destination.label}</strong>
                              <small>
                                {destination.destinationCount} {destination.destinationCount === 1 ? 'destino' : 'destinos'}
                              </small>
                            </span>
                            <label className="field">
                              Quantidade
                              <input
                                aria-label={`Quantidade destino ${index + 1}-${destinationIndex + 1}`}
                                inputMode="decimal"
                                value={destination.quantity}
                                onChange={(event) =>
                                  setDestination(index, destinationIndex, 'quantity', event.target.value)
                                }
                              />
                            </label>
                            <label className="field">
                              Frete
                              <input
                                aria-label={`Frete destino ${index + 1}-${destinationIndex + 1}`}
                                inputMode="decimal"
                                placeholder="A consultar"
                                value={destination.shippingAmount}
                                onChange={(event) =>
                                  setDestinationShipping(index, destinationIndex, event.target.value)
                                }
                              />
                              <small className={`freight-state freight-state--${destination.shippingType}`}>
                                {destination.shippingType === 'pending'
                                  ? 'A consultar'
                                  : destination.shippingType === 'free'
                                    ? 'Frete gratis'
                                    : 'Frete informado'}
                              </small>
                            </label>
                            <label className="field">
                              Prazo de entrega
                              <input
                                aria-label={`Prazo destino ${index + 1}-${destinationIndex + 1}`}
                                type="number"
                                min="0"
                                value={destination.deliveryDays}
                                onChange={(event) =>
                                  setDestination(index, destinationIndex, 'deliveryDays', event.target.value)
                                }
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <small className="form-help">Frete geral do item. Escolha uma distribuicao se precisar cotar por prospector/UF ou por loja.</small>
                    )}
                  </div>
                  <footer>
                    <span>
                      Subtotal{' '}
                      <strong>{calculation ? formatBRL(calculation.subtotalCents) : '-'}</strong>
                    </span>
                    <span>
                      Total <strong>{calculation ? formatBRL(calculation.totalCents) : '-'}</strong>
                    </span>
                    {calculation?.shippingPending && (
                      <small>
                        {calculation.shippingCents && calculation.shippingCents > 0n
                          ? `${formatBRL(calculation.shippingCents)} de frete conhecido + pendente`
                          : 'Frete a consultar'}
                      </small>
                    )}
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

        <div className="quote-form-section">
          <h3>Condicoes de pagamento</h3>
          <div className="form-grid form-grid--three">
            <label className="field">
              Forma de pagamento
              <select
                value={paymentTerms.paymentMethod}
                onChange={(event) =>
                  setPaymentTerms((current) => ({
                    ...current,
                    paymentMethod: event.target.value as QuotePaymentTerms['paymentMethod'],
                  }))
                }
              >
                <option value="">Nao informada</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Valor de entrada
              <input
                inputMode="decimal"
                value={paymentTerms.entryAmount}
                onChange={(event) =>
                  setPaymentTerms((current) => ({ ...current, entryAmount: event.target.value }))
                }
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Quantidade de parcelas
              <input
                inputMode="numeric"
                value={paymentTerms.installmentCount}
                onChange={(event) =>
                  setPaymentTerms((current) => ({
                    ...current,
                    installmentCount: event.target.value.replace(/\D/g, ''),
                  }))
                }
              />
            </label>
            <label className="field form-grid__wide">
              Observacoes das condicoes
              <input
                value={paymentTerms.paymentNotes}
                onChange={(event) =>
                  setPaymentTerms((current) => ({ ...current, paymentNotes: event.target.value }))
                }
                placeholder="Ex.: desconto no PIX, faturado em 30 dias..."
              />
            </label>
          </div>
        </div>

        <label className="field">
          Observacoes gerais
          <textarea
            rows={3}
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </label>
        <div className="quote-form-section">
          <h3>Anexos da cotacao</h3>
          {quote ? (
            <QuoteAttachmentsPanel
              quote={quote}
              canEdit={canEdit}
              onChanged={onAttachmentsChanged}
            />
          ) : (
            <p className="form-help">
              Salve a cotacao pela primeira vez para disponibilizar o envio de anexos.
            </p>
          )}
        </div>
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
  received: ['draft', 'cancelled', 'expired'],
};

const QUOTE_STATUS_ACTIONS: Record<SupplyQuoteStatus, { label: string; icon: typeof CheckCircle2 }> = {
  draft: { label: 'Voltar para rascunho', icon: Edit3 },
  received: { label: 'Marcar como recebida', icon: CheckCircle2 },
  cancelled: { label: 'Cancelar cotacao', icon: Ban },
  expired: { label: 'Marcar como expirada', icon: Clock3 },
};

function QuoteStatusModal({
  quote,
  onClose,
  onSaved,
  canApprovePurchase,
}: {
  quote: SupplyQuote | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canApprovePurchase: boolean;
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
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setError(
        message.includes('active purchase')
          ? 'Esta cotacao possui uma compra ativa. Devolva a compra para cotacao antes de voltar ao rascunho.'
          : message.includes('permission denied')
            ? 'Seu usuario nao possui permissao para alterar o status desta cotacao.'
            : message.includes('invalid quote status transition')
              ? 'Esta alteracao de status nao e permitida no estado atual da cotacao.'
              : 'Nao foi possivel alterar o status desta cotacao.',
      );
    } finally {
      setSaving(false);
    }
  };

  const approvePurchase = async () => {
    if (!quote) return;
    setSaving(true);
    setError(null);
    try {
      await approveSupplyQuoteForPurchase(quote.id);
      await onSaved();
      onClose();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setError(
        message.includes('already approved')
          ? 'Esta cotacao ja possui uma compra ativa.'
          : message.includes('expired')
            ? 'A cotacao esta expirada e nao pode ser aprovada para compra.'
            : message.includes('permission denied')
              ? 'Seu usuario nao possui permissao para aprovar esta cotacao para compra.'
              : message.includes('must be received')
                ? 'A cotacao precisa estar com status Recebida antes da aprovacao para compra.'
                : message.includes('active payments')
                  ? 'A compra anterior possui pagamentos ativos e nao pode ser reaprovada.'
                  : message.includes('active documents')
                    ? 'A compra anterior possui documentos ativos e nao pode ser reaprovada.'
            : 'Nao foi possivel aprovar esta cotacao para compra.',
      );
    } finally {
      setSaving(false);
    }
  };

  const transitions = quote ? QUOTE_STATUS_TRANSITIONS[quote.status] || [] : [];
  const purchaseEligible =
    Boolean(quote) &&
    quote?.status === 'received' &&
    getEffectiveSupplyQuoteStatus(quote) === 'received' &&
    canApprovePurchase;

  return (
    <Modal
      open={Boolean(quote)}
      title={quote ? `Alterar status ${quote.code}` : 'Alterar status'}
      description="Os itens e valores historicos permanecerao inalterados. Aprovar compra cria um snapshot separado CMP."
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
              const action = QUOTE_STATUS_ACTIONS[status];
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
            {purchaseEligible && (
              <button
                type="button"
                className="button button--primary"
                disabled={saving}
                onClick={() => void approvePurchase()}
              >
                <ShoppingCart size={18} />
                Aprovar compra
              </button>
            )}
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
  const [freightProfiles, setFreightProfiles] = useState<SupplyFreightProfile[]>([]);
  const [attachments, setAttachments] = useState<SupplyQuoteAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState('');
  const [area, setArea] = useState('');
  const [itemFilterIds, setItemFilterIds] = useState<string[]>([]);
  const [priceFilter, setPriceFilter] = useState<'all' | 'lowest'>('all');
  const [evaluationMode, setEvaluationMode] = useState<SupplyComparisonMode>('item');
  const [editing, setEditing] = useState<SupplyQuote | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [attachmentsQuote, setAttachmentsQuote] = useState<SupplyQuote | null>(null);
  const [statusQuote, setStatusQuote] = useState<SupplyQuote | null>(null);
  const [deleteQuote, setDeleteQuote] = useState<SupplyQuote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        loadedQuotes,
        loadedItems,
        loadedNeeds,
        loadedSuppliers,
        loadedStores,
        loadedFreightProfiles,
        loadedAttachments,
      ] = await Promise.all([
        listSupplyQuotes(),
        listSupplyItems(),
        listSupplyNeeds(),
        listSuppliers(),
        listStores(),
        listSupplyFreightProfiles(),
        listSupplyQuoteAttachments(),
      ]);
      setQuotes(loadedQuotes);
      setItems(loadedItems);
      setNeeds(loadedNeeds);
      setSuppliers(loadedSuppliers);
      setStores(loadedStores);
      setFreightProfiles(loadedFreightProfiles);
      setAttachments(loadedAttachments);
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

  useEffect(() => {
    const quoteId = searchParams.get('quote');
    if (loading || !quoteId) return;
    const target = quotes.find((quote) => quote.id === quoteId);
    if (!target) return;
    setQuery(target.code);
    setExpandedIds(new Set([target.id]));
    const next = new URLSearchParams(searchParams);
    next.delete('quote');
    setSearchParams(next, { replace: true });
  }, [loading, quotes, searchParams, setSearchParams]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [items],
  );
  const areas = useMemo(
    () =>
      [...new Set(items.map((item) => item.areaName).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items],
  );
  const quoteItemOptions = useMemo<ItemFilterOption[]>(() => {
    const options = new Map<string, ItemFilterOption>();
    quotes.forEach((quote) => quote.items.forEach((item) => {
      if (!options.has(item.supplyItemId)) {
        options.set(item.supplyItemId, {
          id: item.supplyItemId,
          code: item.itemCode,
          name: item.itemName,
        });
      }
    }));
    return [...options.values()].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'pt-BR'),
    );
  }, [quotes]);

  const baseFiltered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return quotes.filter(
      (quote) =>
        (!search ||
          [quote.code, quote.supplierName, ...quote.items.map((item) => item.itemName)]
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(search)) &&
        (!status || getEffectiveSupplyQuoteStatus(quote) === status) &&
        (!storeId || quote.stores.some((store) => store.id === storeId)) &&
        matchesSelectedItems(quote.items.map((item) => item.supplyItemId), itemFilterIds) &&
        ((!category && !area) ||
          quote.items.some((quoteItem) => {
            const catalogItem = itemById.get(quoteItem.supplyItemId);
            return (
              (!category || catalogItem?.category === category) &&
              (!area || catalogItem?.areaName === area)
            );
          })),
    );
  }, [area, category, itemById, itemFilterIds, query, quotes, status, storeId]);

  const lowestPriceSelection = useMemo(
    () => selectLowestPriceQuotesByItem(baseFiltered),
    [baseFiltered],
  );
  const filtered = useMemo(
    () =>
      priceFilter === 'lowest'
        ? baseFiltered.filter((quote) => lowestPriceSelection.quoteIds.has(quote.id))
        : baseFiltered,
    [baseFiltered, lowestPriceSelection, priceFilter],
  );

  const comparisonHighlights = useMemo(
    () =>
      getGroupedComparisonHighlights(
        quotes
          .filter((quote) =>
            ['draft', 'received', 'expired'].includes(getEffectiveSupplyQuoteStatus(quote)),
          )
          .flatMap((quote) => quote.items),
      ),
    [quotes],
  );
  const quoteComparisonHighlights = useMemo(
    () =>
      getGroupedQuoteComparisonHighlights(
        quotes.filter((quote) =>
          ['draft', 'received', 'expired'].includes(getEffectiveSupplyQuoteStatus(quote)),
        ),
      ),
    [quotes],
  );
  const summaryQuotes = useMemo(
    () =>
      status === 'cancelled'
        ? filtered
        : filtered.filter((quote) => getEffectiveSupplyQuoteStatus(quote) !== 'cancelled'),
    [filtered, status],
  );

  const attachmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    attachments.forEach((attachment) =>
      counts.set(attachment.quoteId, (counts.get(attachment.quoteId) || 0) + 1),
    );
    return counts;
  }, [attachments]);
  const allDetailsVisible =
    filtered.length > 0 && filtered.every((quote) => expandedIds.has(quote.id));
  const summaryFilters = useMemo(
    () => ({
      search: query.trim(),
      status: status ? SUPPLY_QUOTE_STATUS_LABELS[status as SupplyQuoteStatus] : '',
      store: storeId
        ? (() => {
            const store = stores.find((entry) => entry.id === storeId);
            return store ? `${store.code} - ${store.name}` : '';
          })()
        : '',
      category,
      area,
    }),
    [area, category, query, status, storeId, stores],
  );
  const toggleQuoteDetails = (quoteId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(quoteId)) next.delete(quoteId);
      else next.add(quoteId);
      return next;
    });
  };
  const toggleAllDetails = () => {
    setExpandedIds(allDetailsVisible ? new Set() : new Set(filtered.map((quote) => quote.id)));
  };
  const removeDraftQuote = async () => {
    if (!deleteQuote) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSupplyQuote(deleteQuote.id);
      setDeleteQuote(null);
      await load();
    } catch (deleteFailure) {
      const message = deleteFailure instanceof Error ? deleteFailure.message : '';
      setDeleteError(
        message.includes('remove quote attachments')
          ? 'Remova os anexos ativos antes de excluir a cotacao.'
          : 'Nao foi possivel excluir a cotacao em rascunho.',
      );
    } finally {
      setDeleting(false);
    }
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
          <button className="button button--secondary" onClick={() => setSummaryOpen(true)}>
            <ChartNoAxesCombined size={18} />
            Ver resumo
          </button>
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
          <button
            className="button button--secondary"
            disabled={!filtered.length}
            onClick={toggleAllDetails}
          >
            <ChevronsUpDown size={18} />
            {allDetailsVisible ? 'Recolher todos os detalhes' : 'Ver todos os detalhes'}
          </button>
        </div>
      </header>

      <div className="comparison-mode-switch" role="group" aria-label="Modo de avaliacao das cotacoes">
        <span>Avaliacao</span>
        <button
          type="button"
          className={evaluationMode === 'item' ? 'is-active' : ''}
          onClick={() => setEvaluationMode('item')}
        >
          Item a item
        </button>
        <button
          type="button"
          className={evaluationMode === 'quote' ? 'is-active' : ''}
          onClick={() => setEvaluationMode('quote')}
        >
          Cotacao completa
        </button>
      </div>

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
        <ItemMultiFilter
          label="Filtrar itens em cotacoes"
          options={quoteItemOptions}
          selectedIds={itemFilterIds}
          onChange={setItemFilterIds}
        />
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos status</option>
          <option value="draft">Rascunho</option>
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
        <select
          aria-label="Filtrar categoria do item"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Todas categorias</option>
          {categories.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar area do item"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        >
          <option value="">Todas areas</option>
          {areas.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar preco"
          value={priceFilter}
          onChange={(event) => setPriceFilter(event.target.value as 'all' | 'lowest')}
        >
          <option value="all">Todas cotacoes</option>
          <option value="lowest">Menor preco por item</option>
        </select>
      </div>

      {priceFilter === 'lowest' && !loading && !error && (
        <p className="form-help">
          {lowestPriceSelection.distinctItemCount} itens distintos · {filtered.length} cotacoes com
          menor preco unitario. Em empate, vence o menor custo total e depois a cotacao mais recente.
        </p>
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
            const winningItems = lowestPriceSelection.winningItemCountByQuote.get(quote.id) || 0;
            return (
              <div className="quote-list__group" key={quote.id}>
                <article className="quote-row">
                  <div className="supply-identity">
                    <small>{quote.code}</small>
                    <strong>
                      {quote.contextType === 'consolidated' ? 'Consolidada' : 'Por loja'}
                    </strong>
                    {priceFilter === 'lowest' && (
                      <small>
                        Menor preco em {winningItems} {winningItems === 1 ? 'item' : 'itens'}
                      </small>
                    )}
                  </div>
                  <div>
                    <strong>{quote.supplierName}</strong>
                    <small>
                      {SUPPLIER_CHANNEL_LABELS[quote.channel]}
                      {quote.originCity ? ` - ${quote.originCity}/${quote.originState}` : ''}
                    </small>
                  </div>
                  {quote.stores.length > 3 ? (
                    <span title={quote.stores.map((store) => `${store.code} - ${store.city}/${store.state}`).join('\n')}>
                      <strong>{quote.stores.length} lojas</strong>
                      <small>Passe para ver a relacao</small>
                    </span>
                  ) : (
                    <span>{quote.stores.map((store) => store.code).join(', ')}</span>
                  )}
                  <span>
                    {formatDate(quote.quoteDate)}
                    <small>Validade: {formatDate(quote.validUntil)}</small>
                  </span>
                  <strong>{quote.items.length}</strong>
                  <span className="quote-detail-metric">
                    <strong>{formatBRL(totals.totalCents)}</strong>
                    {totals.shippingPending && <small>Frete pendente · total parcial</small>}
                    {evaluationMode === 'quote' && quoteComparisonHighlights.lowestTotalQuoteIds.has(quote.id) && (
                      <small className="quote-comparison-marker">Menor total</small>
                    )}
                    {evaluationMode === 'quote' && quoteComparisonHighlights.shortestLeadTimeQuoteIds.has(quote.id) && (
                      <small className="quote-comparison-marker">
                        Menor prazo · {getQuoteDeliveryDays(quote)} dias
                      </small>
                    )}
                  </span>
                  <StatusBadge status={getEffectiveSupplyQuoteStatus(quote)} />
                  <div className="row-actions">
                    <IconButton
                      label={expanded ? `Recolher ${quote.code}` : `Detalhar ${quote.code}`}
                      onClick={() => toggleQuoteDetails(quote.id)}
                    >
                      {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                    </IconButton>
                    {can('quotes.edit') && (
                      <IconButton
                        label={`Editar ${quote.code}`}
                        onClick={() => {
                          setEditing(quote);
                          setModalOpen(true);
                        }}
                      >
                        <Edit3 size={17} />
                      </IconButton>
                    )}
                    <button
                      type="button"
                      className="icon-button quote-attachment-action"
                      aria-label={`Anexos ${quote.code} (${attachmentCounts.get(quote.id) || 0})`}
                      title="Anexos da cotacao"
                      onClick={() => setAttachmentsQuote(quote)}
                    >
                      <Paperclip size={17} />
                      <span className="quote-attachment-action__count">
                        {attachmentCounts.get(quote.id) || 0}
                      </span>
                    </button>
                    {can('quotes.edit') && QUOTE_STATUS_TRANSITIONS[quote.status]?.length && (
                      <IconButton
                        label={`Alterar status ${quote.code}`}
                        onClick={() => setStatusQuote(quote)}
                      >
                        <RefreshCcw size={17} />
                      </IconButton>
                    )}
                    {can('quotes.edit') && quote.status === 'draft' && (
                      <IconButton
                        label={`Excluir ${quote.code}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteQuote(quote);
                        }}
                      >
                        <Trash2 size={17} />
                      </IconButton>
                    )}
                  </div>
                </article>

                {expanded && (
                  <div className="quote-detail-lines quote-detail-lines--destinations">
                    {quote.items.map((item) => {
                      const total = calculateQuoteLine(item);
                      const deliveryDays = getQuoteLineDeliveryDays(item);
                      const freightLabel = total.shippingPending
                        ? total.shippingCents && total.shippingCents > 0n
                          ? `${formatBRL(total.shippingCents)} + pendente`
                          : 'A consultar'
                        : total.shippingCents === 0n
                          ? 'Frete gratis'
                          : formatBRL(total.shippingCents || 0n);
                      return (
                        <section className="quote-detail-item" key={item.id}>
                          <div className="quote-detail-item__summary">
                            <span>
                              <strong>{item.itemCode} - {item.itemName}</strong>
                              <small>
                                {item.storeCode
                                  ? `${item.storeCode} - ${item.storeName || ''}`
                                  : 'Consolidado'}
                                {item.needTitle ? ` - ${item.needTitle}` : ''}
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
                            </span>
                            <span>{item.quantity} {item.unit}</span>
                            <span className="quote-detail-metric">
                              {formatBRL(moneyToCents(item.unitPrice))}
                              {evaluationMode === 'item' && comparisonHighlights.lowestUnitPriceIds.has(item.id) && (
                                <small className="quote-comparison-marker">Menor preco</small>
                              )}
                            </span>
                            <span>Frete: {freightLabel}</span>
                            <span className="quote-detail-metric">
                              <strong>{formatBRL(total.totalCents)}</strong>
                              {evaluationMode === 'item' && comparisonHighlights.lowestTotalIds.has(item.id) && (
                                <small className="quote-comparison-marker">Menor custo</small>
                              )}
                            </span>
                            <span className="quote-detail-metric">
                              {deliveryDays === null ? 'Prazo nao informado' : `${deliveryDays} dias`}
                              {evaluationMode === 'item' && comparisonHighlights.shortestLeadTimeIds.has(item.id) && (
                                <small className="quote-comparison-marker">Menor prazo</small>
                              )}
                            </span>
                          </div>
                          {(item.destinations || []).length > 0 && (
                            <div className="quote-destination-list">
                              {(item.destinations || []).map((destination) => (
                                <div className="quote-destination-row" key={destination.id}>
                                  <span>
                                    <strong>{destination.label}</strong>
                                    <small>
                                      {destination.destinationCount} {destination.destinationCount === 1 ? 'destino' : 'destinos'}
                                    </small>
                                  </span>
                                  <span>{destination.quantity} {destination.unit}</span>
                                  <span>
                                    {destination.shippingType === 'pending'
                                      ? 'Frete: A consultar'
                                      : destination.shippingType === 'free'
                                        ? 'Frete gratis'
                                        : `Frete: ${formatBRL(moneyToCents(destination.shippingAmount || 0))}`}
                                  </span>
                                  <span>
                                    {destination.deliveryDays === null
                                      ? 'Prazo nao informado'
                                      : `${destination.deliveryDays} dias`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
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
        freightProfiles={freightProfiles}
        onClose={closeModal}
        onSaved={load}
        canEdit={can('quotes.edit')}
        onAttachmentsChanged={load}
      />
      <QuoteAttachmentsModal
        quote={attachmentsQuote}
        open={Boolean(attachmentsQuote)}
        canEdit={can('quotes.edit')}
        onClose={() => setAttachmentsQuote(null)}
        onChanged={load}
      />
      <QuoteSummaryModal
        open={summaryOpen}
        quotes={summaryQuotes}
        filters={summaryFilters}
        onClose={() => setSummaryOpen(false)}
      />
      <QuoteStatusModal
        quote={statusQuote}
        onClose={() => setStatusQuote(null)}
        onSaved={load}
        canApprovePurchase={can('purchases.approve' as never)}
      />
      <Modal
        open={Boolean(deleteQuote)}
        title={deleteQuote ? `Excluir ${deleteQuote.code}` : 'Excluir cotacao'}
        description="Esta acao fica disponivel somente enquanto a cotacao esta em rascunho."
        onClose={() => !deleting && setDeleteQuote(null)}
      >
        <div className="stack-form">
          <p className="modal-copy">
            A cotacao e seus itens historicos serao removidos. Esta acao nao pode ser desfeita.
          </p>
          {deleteError && <div className="form-error">{deleteError}</div>}
          <div className="form-actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={deleting}
              onClick={() => setDeleteQuote(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--danger"
              disabled={deleting}
              onClick={() => void removeDraftQuote()}
            >
              <Trash2 size={17} />
              {deleting ? 'Excluindo...' : 'Excluir rascunho'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
