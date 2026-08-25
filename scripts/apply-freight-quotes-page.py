from pathlib import Path

path = Path('src/pages/supply-quotes-page.tsx')
text = path.read_text(encoding='utf-8')


def one(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found: {old[:140]!r}')
    text = text.replace(old, new, 1)

one(
"""  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
""",
"""  listSupplyFreightProfiles,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
""",
)

one(
"""  calculateQuoteTotals,
  formatBRL,
  moneyToCents,
} from '../domain/supply-calculations';
import { getGroupedComparisonHighlights } from '../domain/supply-comparison';
""",
"""  calculateQuoteTotals,
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
""",
)

one(
"""import { SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
""",
"""import { SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
import {
  buildDestinationValues,
  destinationValuesFromSaved,
  getProfileDestinationOptions,
  getStoreDestinationOptions,
  inferShippingType,
} from '../domain/supply-freight';
""",
)

one(
"""  Store,
  Supplier,
  SupplyItem,
""",
"""  Store,
  Supplier,
  SupplyComparisonMode,
  SupplyFreightProfile,
  SupplyItem,
""",
)

one(
"""  SupplyQuoteAttachment,
  SupplyQuoteItemValues,
""",
"""  SupplyQuoteAttachment,
  SupplyQuoteItemDestinationValues,
  SupplyQuoteItemValues,
""",
)

one(
"""    productUrl: '',
    capturedAt: '',
  };
""",
"""    productUrl: '',
    capturedAt: '',
    destinations: [],
  };
""",
)

one(
"""      productUrl: item.productUrl || '',
      capturedAt: item.capturedAt ? item.capturedAt.slice(0, 16) : '',
    })),
""",
"""      productUrl: item.productUrl || '',
      capturedAt: item.capturedAt ? item.capturedAt.slice(0, 16) : '',
      destinations: item.destinations.map(destinationValuesFromSaved),
    })),
""",
)

one(
"""  suppliers,
  stores,
  onClose,
""",
"""  suppliers,
  stores,
  freightProfiles,
  onClose,
""",
)

one(
"""  suppliers: Supplier[];
  stores: Store[];
  onClose: () => void;
""",
"""  suppliers: Supplier[];
  stores: Store[];
  freightProfiles: SupplyFreightProfile[];
  onClose: () => void;
""",
)

one(
"""  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId);
""",
"""  const setDestination = <K extends keyof SupplyQuoteItemDestinationValues>(
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
      setValues((current) => ({
        ...current,
        items: current.items.map((line) => ({
          ...line,
          destinations: buildLineDestinations(line, current.storeIds, mode),
        })),
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Nao foi possivel montar os destinos.');
    }
  };

  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId);
""",
)

one(
"""      items: current.items.map((line) =>
        contextType === 'store' ? { ...line, storeId: current.storeIds[0] || line.storeId } : line,
      ),
""",
"""      items: current.items.map((line) =>
        contextType === 'store'
          ? { ...line, storeId: current.storeIds[0] || line.storeId, destinations: [] }
          : { ...line, destinations: [] },
      ),
""",
)

one(
"""        items: current.items.map((line) =>
          selected.includes(line.storeId) ? line : { ...line, storeId: '' },
        ),
""",
"""        items: current.items.map((line) =>
          selected.includes(line.storeId)
            ? { ...line, destinations: [] }
            : { ...line, storeId: '', destinations: [] },
        ),
""",
)

one(
"""        items: current.items.map((line) =>
          selected.includes(line.storeId) ? line : { ...line, storeId: '' },
        ),
""",
"""        items: current.items.map((line) =>
          selected.includes(line.storeId)
            ? { ...line, destinations: [] }
            : { ...line, storeId: '', destinations: [] },
        ),
""",
)

one(
"""        if (values.contextType === 'store' && !line.storeId) throw new Error();
        if (line.shippingType === 'informed' && line.shippingAmount === '') throw new Error();
        const calculation = calculateQuoteLine(line);
""",
"""        if (values.contextType === 'store' && !line.storeId) throw new Error();
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
""",
)

one(
"""                    items: current.items.map((line) => ({ ...line, storeId })),
""",
"""                    items: current.items.map((line) => ({ ...line, storeId, destinations: [] })),
""",
)

one(
"""          <div className="quote-form-section__heading">
            <h3>Itens cotados</h3>
            <button
              type="button"
              className="button button--secondary button--small"
""",
"""          <div className="quote-form-section__heading">
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
""",
)

one(
"""                        value={line.storeId}
                        onChange={(event) => setLine(index, 'storeId', event.target.value)}
""",
"""                        value={line.storeId}
                        onChange={(event) => {
                          setLine(index, 'storeId', event.target.value);
                          setLine(index, 'destinations', []);
                        }}
""",
)

one(
"""                            <option key={store.id} value={store.id}>
                              {store.code}
                            </option>
""",
"""                            <option key={store.id} value={store.id}>
                              {store.code} - {store.name}
                            </option>
""",
)

old_freight = """                    <label className="field">
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
"""
new_freight = """                    {!line.destinations.length && (
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
"""
one(old_freight, new_freight)

old_deadline = """                    <label className="field">
                      Prazo em dias
                      <input
                        aria-label={`Prazo em dias ${index + 1}`}
                        type="number"
                        min="0"
                        value={line.deliveryDays}
                        onChange={(event) => setLine(index, 'deliveryDays', event.target.value)}
                      />
                    </label>
"""
new_deadline = """                    {!line.destinations.length && (
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
"""
one(old_deadline, new_deadline)

one(
"""                  </div>
                  <footer>
                    <span>
                      Subtotal{' '}
""",
"""                  </div>
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
""",
)

one(
"""                    {calculation?.shippingPending && <small>Frete a consultar</small>}
""",
"""                    {calculation?.shippingPending && (
                      <small>
                        {calculation.shippingCents && calculation.shippingCents > 0n
                          ? `${formatBRL(calculation.shippingCents)} de frete conhecido + pendente`
                          : 'Frete a consultar'}
                      </small>
                    )}
""",
)

# Main page state/load
one(
"""  const [stores, setStores] = useState<Store[]>([]);
  const [attachments, setAttachments] = useState<SupplyQuoteAttachment[]>([]);
""",
"""  const [stores, setStores] = useState<Store[]>([]);
  const [freightProfiles, setFreightProfiles] = useState<SupplyFreightProfile[]>([]);
  const [attachments, setAttachments] = useState<SupplyQuoteAttachment[]>([]);
""",
)

one(
"""  const [priceFilter, setPriceFilter] = useState<'all' | 'lowest'>('all');
""",
"""  const [priceFilter, setPriceFilter] = useState<'all' | 'lowest'>('all');
  const [evaluationMode, setEvaluationMode] = useState<SupplyComparisonMode>('item');
""",
)

one(
"""        loadedStores,
        loadedAttachments,
      ] = await Promise.all([
""",
"""        loadedStores,
        loadedFreightProfiles,
        loadedAttachments,
      ] = await Promise.all([
""",
)

one(
"""        listStores(),
        listSupplyQuoteAttachments(),
""",
"""        listStores(),
        listSupplyFreightProfiles(),
        listSupplyQuoteAttachments(),
""",
)

one(
"""      setStores(loadedStores);
      setAttachments(loadedAttachments);
""",
"""      setStores(loadedStores);
      setFreightProfiles(loadedFreightProfiles);
      setAttachments(loadedAttachments);
""",
)

one(
"""  const summaryQuotes = useMemo(
""",
"""  const quoteComparisonHighlights = useMemo(
    () =>
      getGroupedQuoteComparisonHighlights(
        quotes.filter((quote) =>
          ['draft', 'received', 'expired'].includes(getEffectiveSupplyQuoteStatus(quote)),
        ),
      ),
    [quotes],
  );
  const summaryQuotes = useMemo(
""",
)

one(
"""      <div className="supply-filter-grid supply-filter-grid--compact">
""",
"""      <div className="comparison-mode-switch" role="group" aria-label="Modo de avaliacao das cotacoes">
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
""",
)

one(
"""                  <span>
                    <strong>{formatBRL(totals.totalCents)}</strong>
                    {totals.shippingPending && <small>Frete pendente</small>}
                  </span>
""",
"""                  <span className="quote-detail-metric">
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
""",
)

old_details = """                  <div className="quote-detail-lines">
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
                            {item.productUrl && /^https?:\\/\\//i.test(item.productUrl) && (
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
                          <span>
                            {item.quantity} {item.unit}
                          </span>
                          <span className="quote-detail-metric">
                            {formatBRL(moneyToCents(item.unitPrice))}
                            {comparisonHighlights.lowestUnitPriceIds.has(item.id) && (
                              <small className="quote-comparison-marker">Menor preco</small>
                            )}
                          </span>
                          <span>
                            Frete:{' '}
                            {item.shippingType === 'pending'
                              ? 'A consultar'
                              : formatBRL(total.shippingCents || 0n)}
                          </span>
                          <span className="quote-detail-metric">
                            <strong>{formatBRL(total.totalCents)}</strong>
                            {comparisonHighlights.lowestTotalIds.has(item.id) && (
                              <small className="quote-comparison-marker">Menor custo</small>
                            )}
                          </span>
                          <span className="quote-detail-metric">
                            {item.deliveryDays === null
                              ? 'Prazo nao informado'
                              : `${item.deliveryDays} dias`}
                            {comparisonHighlights.shortestLeadTimeIds.has(item.id) && (
                              <small className="quote-comparison-marker">Menor prazo</small>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
"""
new_details = """                  <div className="quote-detail-lines quote-detail-lines--destinations">
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
                              {item.productUrl && /^https?:\\/\\//i.test(item.productUrl) && (
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
                          {item.destinations.length > 0 && (
                            <div className="quote-destination-list">
                              {item.destinations.map((destination) => (
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
"""
one(old_details, new_details)

one(
"""        stores={stores}
        onClose={closeModal}
""",
"""        stores={stores}
        freightProfiles={freightProfiles}
        onClose={closeModal}
""",
)

path.write_text(text, encoding='utf-8')
print('freight quotes page patch applied')
