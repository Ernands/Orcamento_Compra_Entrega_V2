import {
  ArrowLeft,
  FileText,
  History,
  MapPinned,
  PackageCheck,
  Paperclip,
  RefreshCcw,
  Search,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, IconButton, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  cancelSupplyPurchaseOrderV2,
  createPurchaseAttachmentSignedUrlV2,
  createQuoteAttachmentSignedUrlReadOnlyV2,
  createSupplyPurchaseOrderV2,
  deletePurchaseAttachmentV2,
  listSupplyPurchasesV2,
  returnPurchaseToQuoteV2,
  savePurchaseDestinationDistributionV2,
  savePurchaseOrderLineDistributionV2,
  uploadPurchaseAttachmentV3,
  validatePurchaseAttachmentV2,
} from '../data/purchases/purchases-v2-repository';
import {
  approvedDestinationAllocations,
  calculateRegistrationTotal,
  destinationExecution,
  formatQuantityV2,
  itemExecution,
  lineTotalCents,
  purchaseAllocationCoverage,
  purchaseExecutionSummary,
  purchaseStoreCosts,
  remainingDestinationQuantity,
  remainingItemQuantity,
  suggestedDeliveryDate,
} from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents, quantityToThousandths } from '../domain/supply-calculations';
import type {
  PurchaseDestinationV2,
  PurchaseDocumentType,
  PurchaseItemV2,
  PurchaseOrderLineV2,
  PurchaseOrderV2,
  PurchaseV2,
  StoreAllocationInputV2,
} from '../domain/purchase-v2-types';
import './supply-purchases-v2.css';

const CHANNEL_LABELS: Record<string, string> = {
  local_city: 'Fornecedor local',
  state_capital: 'Capital do estado',
  regional: 'Regional',
  national: 'Nacional',
  ecommerce: 'E-commerce',
};
const DOCUMENT_LABELS: Record<PurchaseDocumentType, string> = {
  invoice: 'Nota fiscal', receipt: 'Recibo', payment_proof: 'Comprovante de pagamento', boleto: 'Boleto',
  purchase_order: 'Pedido / ordem de compra', reimbursement: 'Documento de reembolso', photo: 'Foto / evidencia', other: 'Outro',
};
const OPERATIONAL_DOCUMENT_TYPES: PurchaseDocumentType[] = [
  'invoice', 'receipt', 'payment_proof', 'boleto', 'purchase_order', 'photo', 'other',
];
const QUOTE_DOCUMENT_LABELS: Record<string, string> = {
  quote: 'Cotacao / proposta', invoice: 'Nota fiscal', receipt: 'Recibo', payment_proof: 'Comprovante de pagamento',
  boleto: 'Boleto', purchase_order: 'Pedido / ordem de compra', reimbursement: 'Documento de reembolso', photo: 'Foto / evidencia', other: 'Outro',
};

function todayInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function formatDate(value: string | null): string {
  if (!value) return 'Nao informada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
function decimalFromThousandths(value: bigint): string {
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()},${fraction}` : whole.toString();
}
function purchaseStoresLabel(purchase: PurchaseV2): string {
  if (purchase.stores.length === 1) return purchase.stores[0].code;
  return `${purchase.stores.length} lojas`;
}
function channelLabel(purchase: PurchaseV2): string {
  const channel = purchase.channelType ? CHANNEL_LABELS[purchase.channelType] || purchase.channelType : 'Canal nao informado';
  const origin = [purchase.originCity, purchase.originState].filter(Boolean).join('/');
  return origin ? `${channel} · ${origin}` : channel;
}
function quotedShippingLabel(destination: PurchaseDestinationV2 | PurchaseItemV2): string {
  const type = 'quotedShippingType' in destination ? destination.quotedShippingType : 'pending';
  const amount = 'quotedShippingAmount' in destination ? destination.quotedShippingAmount : null;
  if (type === 'pending') return 'Frete cotado pendente';
  if (type === 'free') return 'Frete cotado gratis';
  return `Frete cotado ${formatBRL(moneyToCents(amount || '0'))}`;
}
function errorMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

function RegisterPurchaseModal({
  purchase,
  item,
  onClose,
  onSaved,
}: {
  purchase: PurchaseV2 | null;
  item: PurchaseItemV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [purchasedOn, setPurchasedOn] = useState(todayInput());
  const [destinationId, setDestinationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [supplierOrderRef, setSupplierOrderRef] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [deliveryTouched, setDeliveryTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = item?.destinations.find((entry) => entry.id === destinationId) || null;
  const remainingItem = item && purchase ? remainingItemQuantity(item, purchase) : 0n;
  const remainingDestination = destination && purchase ? remainingDestinationQuantity(destination, purchase) : null;
  const maxQuantity = remainingDestination === null ? remainingItem : remainingDestination < remainingItem ? remainingDestination : remainingItem;

  useEffect(() => {
    if (!item || !purchase) return;
    const firstDestination = item.destinations.length === 1 ? item.destinations[0] : null;
    setPurchasedOn(todayInput());
    setDestinationId(firstDestination?.id || '');
    const remaining = firstDestination ? remainingDestinationQuantity(firstDestination, purchase) : remainingItemQuantity(item, purchase);
    setQuantity(decimalFromThousandths(remaining));
    setUnitPrice(item.quotedUnitPrice);
    setDiscount('0');
    setShipping('');
    setOtherCosts('0');
    setSupplierOrderRef('');
    setExpectedDeliveryDate(suggestedDeliveryDate(todayInput(), firstDestination ? firstDestination.quotedDeliveryDays : item.quotedDeliveryDays));
    setDeliveryTouched(false);
    setNotes('');
    setError(null);
  }, [item, purchase]);

  useEffect(() => {
    if (!item || deliveryTouched) return;
    const days = destination ? destination.quotedDeliveryDays : item.quotedDeliveryDays;
    setExpectedDeliveryDate(suggestedDeliveryDate(purchasedOn, days));
  }, [purchasedOn, destination, item, deliveryTouched]);

  const total = useMemo(() => {
    try {
      if (!quantity.trim() || !unitPrice.trim() || !shipping.trim()) return null;
      return calculateRegistrationTotal({ quantity, unitPrice, discountAmount: discount, shippingAmount: shipping, otherCosts });
    } catch {
      return null;
    }
  }, [quantity, unitPrice, discount, shipping, otherCosts]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!purchase || !item) return;
    setError(null);
    try {
      const qty = quantityToThousandths(quantity);
      if (qty <= 0n) throw new Error('Informe uma quantidade maior que zero.');
      if (qty > maxQuantity) throw new Error('A quantidade informada supera o saldo disponivel para este item/destino.');
      if (item.destinations.length && !destination) throw new Error('Selecione o destino da compra.');
      const subtotal = (qty * moneyToCents(unitPrice) + 500n) / 1000n;
      const discountCents = moneyToCents(discount || '0');
      if (moneyToCents(unitPrice) < 0n || discountCents < 0n || moneyToCents(shipping || '0') < 0n || moneyToCents(otherCosts || '0') < 0n) {
        throw new Error('Valores negativos nao sao permitidos.');
      }
      if (discountCents > subtotal) throw new Error('O desconto nao pode superar o subtotal.');
      const calculated = calculateRegistrationTotal({ quantity, unitPrice, discountAmount: discount, shippingAmount: shipping, otherCosts });
      if (calculated < 0n) throw new Error('O total do registro nao pode ser negativo.');
      if (expectedDeliveryDate && expectedDeliveryDate < purchasedOn) throw new Error('A previsao de entrega nao pode ser anterior a data da compra.');
    } catch (failure) {
      setError(errorMessage(failure, 'Revise os valores informados.'));
      return;
    }

    setSaving(true);
    try {
      await createSupplyPurchaseOrderV2({
        purchaseId: purchase.id,
        purchasedOn,
        supplierOrderRef,
        expectedDeliveryDate,
        notes,
        lines: [{
          purchaseItemId: item.id,
          purchaseDestinationId: destination?.id || null,
          quantity,
          unitPrice,
          discountAmount: discount,
          shippingAmount: shipping,
          otherCosts,
          expectedDeliveryDate,
          notes,
        }],
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel registrar a compra.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(purchase && item)}
      title={item ? `Registrar compra · ${item.itemName}` : 'Registrar compra'}
      description={item ? `Aprovado ${formatQuantityV2(item.quantityApproved)} ${item.unit} · falta ${formatQuantityV2(decimalFromThousandths(remainingItem))} ${item.unit}` : undefined}
      onClose={onClose}
    >
      {purchase && item && (
        <form className="stack-form" onSubmit={submit}>
          {item.destinations.length > 0 && (
            <label className="field">Destino
              <select value={destinationId} onChange={(event) => {
                  const nextId = event.target.value;
                  setDestinationId(nextId);
                  const nextDestination = item.destinations.find((entry) => entry.id === nextId);
                  if (nextDestination) setQuantity(decimalFromThousandths(remainingDestinationQuantity(nextDestination, purchase)));
                }} required>
                <option value="">Selecione o destino</option>
                {item.destinations.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label} · {entry.state} · saldo {formatQuantityV2(decimalFromThousandths(remainingDestinationQuantity(entry, purchase)))} {entry.unit}</option>
                ))}
              </select>
            </label>
          )}
          <div className="purchase-v2-hint">
            <strong>{destination ? destination.label : item.storeCode || 'Sem destino especifico'}</strong>
            <span>{destination ? quotedShippingLabel(destination) : quotedShippingLabel(item)}{(destination ? destination.quotedDeliveryDays : item.quotedDeliveryDays) !== null ? ` · prazo cotado ${destination ? destination.quotedDeliveryDays : item.quotedDeliveryDays} dias` : ''}</span>
          </div>
          <div className="form-grid form-grid--three">
            <label className="field">Data da compra<input type="date" value={purchasedOn} onChange={(event) => setPurchasedOn(event.target.value)} required /></label>
            <label className="field">Quantidade<input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
            <label className="field">Valor unitario realizado<input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
            <label className="field">Desconto<input value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
            <label className="field">Frete realizado<input value={shipping} onChange={(event) => setShipping(event.target.value)} placeholder="Vazio = nao informado · 0 = gratis" /></label>
            <label className="field">Outros custos<input value={otherCosts} onChange={(event) => setOtherCosts(event.target.value)} /></label>
            <label className="field">Referencia / pedido<input value={supplierOrderRef} onChange={(event) => setSupplierOrderRef(event.target.value)} /></label>
            <label className="field">Previsao de entrega<input type="date" value={expectedDeliveryDate} onChange={(event) => { setDeliveryTouched(true); setExpectedDeliveryDate(event.target.value); }} /></label>
          </div>
          <label className="field">Observacoes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="purchase-v2-total"><span>Total deste registro</span><strong>{!shipping.trim() ? 'Pendente · frete nao informado' : total === null ? 'Revise quantidade e valores' : formatBRL(total)}</strong></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
            <button className="button button--primary" disabled={saving}>{saving ? 'Registrando...' : 'Registrar compra'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function HistoryModal({
  purchase,
  onClose,
  onSaved,
  canEdit,
}: {
  purchase: PurchaseV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancel = async (order: PurchaseOrderV2) => {
    const reason = window.prompt('Informe o motivo do cancelamento deste registro de compra:');
    if (!reason?.trim()) return;
    setCancellingId(order.id);
    setError(null);
    try {
      await cancelSupplyPurchaseOrderV2(order.id, reason);
      await onSaved();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel cancelar o registro.'));
    } finally {
      setCancellingId(null);
    }
  };
  return (
    <Modal open={Boolean(purchase)} title={purchase ? `Historico · ${purchase.code}` : 'Historico'} description="Registros cancelados permanecem visiveis para auditoria." onClose={onClose}>
      {purchase && (
        <div className="purchase-v2-history">
          {error && <div className="form-error">{error}</div>}
          {purchase.orders.length ? purchase.orders.map((order) => (
            <article key={order.id} className={`purchase-v2-history__order ${order.status === 'cancelled' ? 'is-cancelled' : ''}`}>
              <header>
                <div><strong>{formatDate(order.purchasedOn)} · {order.supplierOrderRef || 'Sem referencia/pedido'}</strong><span>{order.source === 'legacy_backfill' ? 'Registro tecnico de compatibilidade/legado' : `Registrado por ${order.createdByName || 'usuario nao identificado'}`}</span></div>
                <div><span className="purchase-v2-pill">{order.status === 'active' ? 'Ativo' : 'Cancelado'}</span>{canEdit && order.status === 'active' && order.source !== 'legacy_backfill' && <button type="button" className="button button--secondary button--small" disabled={cancellingId === order.id} onClick={() => void cancel(order)}><XCircle size={15} />Cancelar registro</button>}</div>
              </header>
              {order.status === 'cancelled' && <div className="purchase-v2-cancel-note"><strong>Cancelado por {order.cancelledByName || 'usuario nao identificado'}</strong><span>{order.cancellationReason || 'Motivo nao informado'}</span></div>}
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Item</th><th>Destino</th><th>Qtd.</th><th>Valor un.</th><th>Frete</th><th>Total</th><th>Previsao</th><th>Distribuicao</th></tr></thead><tbody>
                {order.lines.map((line) => <tr key={line.id}><td><strong>{line.itemName}</strong><small>{line.itemCode}</small></td><td>{line.destinationLabel || 'Sem destino'}</td><td>{formatQuantityV2(line.quantity)} {line.unit}</td><td>{formatBRL(moneyToCents(line.unitPrice))}</td><td>{line.actualShippingType === 'pending' ? 'Nao informado' : line.actualShippingType === 'free' ? 'Gratis' : formatBRL(moneyToCents(line.shippingAmount || '0'))}</td><td>{lineTotalCents(line) === null ? 'Pendente' : formatBRL(lineTotalCents(line)!)}</td><td>{formatDate(line.expectedDeliveryDate)}</td><td>{line.storeDistributionStatus === 'confirmed' ? 'Confirmada' : 'Pendente'}</td></tr>)}
              </tbody></table></div>
            </article>
          )) : <EmptyState title="Sem registros" detail="Os registros de compra aparecerao aqui sem sobrescrever o historico." />}
        </div>
      )}
    </Modal>
  );
}

function DestinationDistributionModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: PurchaseDestinationV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!destination) return;
    setAllocations(Object.fromEntries(destination.stores.map((store) => [store.storeId, store.allocatedQuantity === null ? '' : store.allocatedQuantity])));
    setError(null);
  }, [destination]);
  const allocated = useMemo(() => {
    try { return Object.values(allocations).reduce((sum, value) => sum + (value.trim() ? quantityToThousandths(value) : 0n), 0n); }
    catch { return null; }
  }, [allocations]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!destination) return;
    setSaving(true); setError(null);
    try {
      const values: StoreAllocationInputV2[] = destination.stores.map((store) => ({ storeId: store.storeId, quantity: allocations[store.storeId] ?? '' }));
      await savePurchaseDestinationDistributionV2(destination.id, values);
      await onSaved();
      onClose();
    } catch (failure) { setError(errorMessage(failure, 'Nao foi possivel salvar a distribuicao.')); }
    finally { setSaving(false); }
  };
  return <Modal open={Boolean(destination)} title={destination ? `Distribuir · ${destination.label}` : 'Distribuir por loja'} description="A distribuicao so fica confirmada quando a soma das lojas fecha exatamente a quantidade do destino." onClose={onClose}>
    {destination && <form className="stack-form" onSubmit={submit}>
      <div className="purchase-v2-allocation-total"><span>Destino</span><strong>{formatQuantityV2(destination.quantity)} {destination.unit}</strong><span>Alocado</span><strong>{allocated === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocated))} ${destination.unit}`}</strong></div>
      <div className="purchase-v2-allocation-grid">{destination.stores.map((store) => <label className="field" key={store.storeId}><span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span><input value={allocations[store.storeId] ?? ''} onChange={(event) => setAllocations((current) => ({ ...current, [store.storeId]: event.target.value }))} placeholder="Quantidade" /></label>)}</div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar distribuicao'}</button></div>
    </form>}
  </Modal>;
}

function LineDistributionModal({
  purchase,
  line,
  onClose,
  onSaved,
}: {
  purchase: PurchaseV2 | null;
  line: PurchaseOrderLineV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const item = purchase?.items.find((entry) => entry.id === line?.purchaseItemId) || null;
  const destination = item?.destinations.find((entry) => entry.id === line?.purchaseDestinationId) || null;
  const eligibleStores = destination ? destination.stores.map((store) => ({ storeId: store.storeId, code: store.code, name: store.name, city: store.city, state: store.state })) : purchase?.stores || [];
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!line) return;
    setAllocations(Object.fromEntries(eligibleStores.map((store) => [store.storeId, line.stores.find((entry) => entry.storeId === store.storeId)?.quantity || ''])));
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);
  const allocated = useMemo(() => {
    try { return Object.values(allocations).reduce((sum, value) => sum + (value.trim() ? quantityToThousandths(value) : 0n), 0n); }
    catch { return null; }
  }, [allocations]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!line) return;
    setSaving(true); setError(null);
    try {
      await savePurchaseOrderLineDistributionV2(line.id, eligibleStores.map((store) => ({ storeId: store.storeId, quantity: allocations[store.storeId] || '0' })));
      await onSaved(); onClose();
    } catch (failure) { setError(errorMessage(failure, 'Nao foi possivel distribuir o registro.')); }
    finally { setSaving(false); }
  };
  return <Modal open={Boolean(purchase && line)} title={line ? `Distribuir registro · ${line.itemName}` : 'Distribuir registro'} description="O custo realizado por loja so sera alocado quando a distribuicao fisica deste registro estiver confirmada." onClose={onClose}>
    {purchase && line && <form className="stack-form" onSubmit={submit}>
      {destination?.destinationType === 'profile' && destination.distributionStatus !== 'confirmed' && <div className="form-error">Confirme primeiro a distribuicao mestre do destino {destination.label}.</div>}
      <div className="purchase-v2-allocation-total"><span>Registro</span><strong>{formatQuantityV2(line.quantity)} {line.unit}</strong><span>Alocado</span><strong>{allocated === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocated))} ${line.unit}`}</strong></div>
      <div className="purchase-v2-allocation-grid">{eligibleStores.map((store) => <label className="field" key={store.storeId}><span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span><input value={allocations[store.storeId] || ''} onChange={(event) => setAllocations((current) => ({ ...current, [store.storeId]: event.target.value }))} /></label>)}</div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving || (destination?.destinationType === 'profile' && destination.distributionStatus !== 'confirmed')}>{saving ? 'Salvando...' : 'Salvar distribuicao'}</button></div>
    </form>}
  </Modal>;
}

function DocumentsModal({
  purchase,
  onClose,
  onSaved,
  canEdit,
}: {
  purchase: PurchaseV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
}) {
  const [documentType, setDocumentType] = useState<PurchaseDocumentType>('invoice');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [documentAmount, setDocumentAmount] = useState('');
  const [description, setDescription] = useState('');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (purchase) { setPurchaseOrderId(''); setDocumentNumber(''); setDocumentDate(''); setDocumentAmount(''); setDescription(''); setStoreIds([]); setFile(null); setError(null); } }, [purchase]);
  const toggleStore = (storeId: string) => setStoreIds((current) => current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId]);
  const upload = async () => {
    if (!purchase || !file) return;
    const validation = validatePurchaseAttachmentV2(file);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null);
    try {
      await uploadPurchaseAttachmentV3({ purchaseId: purchase.id, purchaseOrderId: purchaseOrderId || null, file, description, documentType, documentNumber, documentDate, documentAmount, storeIds });
      await onSaved();
      setDocumentNumber(''); setDocumentDate(''); setDocumentAmount(''); setDescription(''); setStoreIds([]); setFile(null);
    } catch (failure) { setError(errorMessage(failure, 'Nao foi possivel anexar o documento.')); }
    finally { setSaving(false); }
  };
  const openPurchase = async (id: string, path: string) => { setOpeningId(id); try { window.open(await createPurchaseAttachmentSignedUrlV2(path), '_blank', 'noopener,noreferrer'); } catch { setError('Nao foi possivel abrir o documento.'); } finally { setOpeningId(null); } };
  const openQuote = async (id: string, path: string) => { setOpeningId(id); try { window.open(await createQuoteAttachmentSignedUrlReadOnlyV2(path), '_blank', 'noopener,noreferrer'); } catch { setError('Nao foi possivel abrir o documento da cotacao.'); } finally { setOpeningId(null); } };
  const remove = async (id: string) => { if (!window.confirm('Remover este documento da compra?')) return; try { await deletePurchaseAttachmentV2(id); await onSaved(); } catch (failure) { setError(errorMessage(failure, 'Nao foi possivel remover o documento.')); } };
  return <Modal open={Boolean(purchase)} title={purchase ? `Documentos · ${purchase.code}` : 'Documentos'} description="Documentos da cotacao sao exibidos apenas para consulta; arquivos nao sao duplicados." onClose={onClose}>
    {purchase && <div className="stack-form">
      {canEdit && <section className="purchase-v2-doc-create"><h4>Novo documento de Compra</h4><div className="form-grid form-grid--three">
        <label className="field">Tipo<select value={documentType} onChange={(event) => setDocumentType(event.target.value as PurchaseDocumentType)}>{OPERATIONAL_DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}</select></label>
        <label className="field">Registro/pedido relacionado<select value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)}><option value="">Compra geral</option>{purchase.orders.map((order) => <option key={order.id} value={order.id}>{formatDate(order.purchasedOn)} · {order.supplierOrderRef || order.id.slice(0,8)} · {order.status === 'cancelled' ? 'cancelado' : 'ativo'}</option>)}</select></label>
        <label className="field">Numero do documento<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} /></label>
        <label className="field">Data<input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></label>
        <label className="field">Valor<input value={documentAmount} onChange={(event) => setDocumentAmount(event.target.value)} /></label>
        <label className="field">Arquivo<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      </div><label className="field">Descricao<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="purchase-v2-store-scope"><span>Lojas relacionadas <small>Opcional; sem selecao = documento geral da compra.</small></span><div>{purchase.stores.map((store) => <label key={store.storeId}><input type="checkbox" checked={storeIds.includes(store.storeId)} onChange={() => toggleStore(store.storeId)} />{store.code} · {store.city}/{store.state}</label>)}</div></div>
      <div className="modal-actions"><button type="button" className="button button--primary" disabled={!file || saving} onClick={() => void upload()}>{saving ? 'Enviando...' : 'Anexar documento'}</button></div></section>}
      {error && <div className="form-error">{error}</div>}
      <section><h4>Documentos da Compra</h4>{purchase.attachments.length ? <div className="quote-attachment-list">{purchase.attachments.map((attachment) => <article key={attachment.id}><FileText size={18}/><div><strong>{attachment.originalName}</strong><span>{DOCUMENT_LABELS[attachment.documentType]}{attachment.documentNumber ? ` · ${attachment.documentNumber}` : ''}{attachment.stores.length ? ` · ${attachment.stores.map((store)=>store.code).join(', ')}` : ''}</span></div><span>{attachment.documentDate ? formatDate(attachment.documentDate) : new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span><button type="button" className="button button--secondary button--small" disabled={openingId===attachment.id} onClick={() => void openPurchase(attachment.id,attachment.storagePath)}>Abrir</button>{canEdit && <IconButton label={`Remover ${attachment.originalName}`} onClick={() => void remove(attachment.id)}><XCircle size={16}/></IconButton>}</article>)}</div> : <EmptyState title="Nenhum documento de Compra" detail="Notas, recibos, comprovantes e ordens de compra aparecerao aqui." />}</section>
      <section><h4>Documentos da Cotacao · somente leitura</h4>{purchase.quoteAttachments.length ? <div className="quote-attachment-list">{purchase.quoteAttachments.map((attachment) => <article key={attachment.id}><FileText size={18}/><div><strong>{attachment.originalName}</strong><span>{QUOTE_DOCUMENT_LABELS[attachment.documentType] || attachment.documentType} · origem {purchase.quoteCode}</span></div><span>{new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span><button type="button" className="button button--secondary button--small" disabled={openingId===attachment.id} onClick={() => void openQuote(attachment.id,attachment.storagePath)}>Abrir</button></article>)}</div> : <EmptyState title="Sem documentos na cotacao" detail="Nenhum arquivo de origem esta disponivel para esta compra." />}</section>
    </div>}
  </Modal>;
}

type SummaryView = 'consolidated' | 'destination' | 'store' | 'item';

type SummaryDestinationRow = {
  key: string;
  itemName: string;
  coverage: string;
  label: string;
  state: string;
  storeCount: number;
  approvedQuantity: string;
  purchasedQuantity: string;
  unit: string;
  approvedCents: bigint;
  realizedCents: bigint;
  quotedShipping: string;
  deliveryDays: number | null;
  distribution: string;
  hasPendingShipping: boolean;
};

function SummaryModal({ purchase, onClose }: { purchase: PurchaseV2 | null; onClose: () => void }) {
  const [view, setView] = useState<SummaryView>('consolidated');
  useEffect(() => { if (purchase) setView('consolidated'); }, [purchase]);
  if (!purchase) return null;

  const summary = purchaseExecutionSummary(purchase);
  const storeCosts = purchaseStoreCosts(purchase);
  const coverage = purchaseAllocationCoverage(purchase);
  const destinationRows: SummaryDestinationRow[] = purchase.items.flatMap((item) => {
    if (item.destinations.length > 0) {
      const approvedByDestination = approvedDestinationAllocations(item);
      return item.destinations.map((destination) => {
        const execution = destinationExecution(destination, purchase);
        return {
          key: destination.id,
          itemName: item.itemName,
          coverage: 'Destino real',
          label: destination.label,
          state: destination.state,
          storeCount: destination.destinationCount,
          approvedQuantity: destination.quantity,
          purchasedQuantity: decimalFromThousandths(execution.purchasedQuantity),
          unit: destination.unit,
          approvedCents: approvedByDestination.get(destination.id) ?? 0n,
          realizedCents: execution.realizedCents,
          quotedShipping: quotedShippingLabel(destination),
          deliveryDays: destination.quotedDeliveryDays,
          distribution: destination.destinationType === 'store'
            ? 'Direto loja'
            : destination.distributionStatus === 'confirmed'
              ? 'Confirmada'
              : 'Pendente',
          hasPendingShipping: execution.hasPendingShipping,
        };
      });
    }

    const execution = itemExecution(item, purchase);
    const directStore = item.storeId ? purchase.stores.find((store) => store.storeId === item.storeId) || null : null;
    const legacyFallback = !directStore && item.sourceQuoteItemId === null && purchase.stores.length > 0;
    return [{
      key: `fallback-${item.id}`,
      itemName: item.itemName,
      coverage: directStore ? 'Loja direta' : legacyFallback ? 'Fallback legado' : 'Sem cobertura',
      label: directStore?.code || (legacyFallback ? 'Rateio igualitario legado' : 'Sem destino'),
      state: directStore?.state || '-',
      storeCount: directStore ? 1 : legacyFallback ? purchase.stores.length : 0,
      approvedQuantity: item.quantityApproved,
      purchasedQuantity: decimalFromThousandths(execution.purchasedQuantity),
      unit: item.unit,
      approvedCents: moneyToCents(item.approvedLineTotal),
      realizedCents: execution.realizedCents,
      quotedShipping: quotedShippingLabel(item),
      deliveryDays: item.quotedDeliveryDays,
      distribution: directStore ? 'Direto loja' : legacyFallback ? 'Rateio igual no aprovado' : 'Nao alocado',
      hasPendingShipping: execution.hasPendingShipping,
    }];
  });

  return <Modal open title={`Resumo · ${purchase.code}`} description={`${purchase.quoteCode} · ${purchase.supplierName}`} onClose={onClose}>
    <div className="segmented" role="group" aria-label="Visao do resumo de compras">
      <button type="button" className={view==='consolidated'?'is-active':''} onClick={()=>setView('consolidated')}>Consolidado</button>
      <button type="button" className={view==='destination'?'is-active':''} onClick={()=>setView('destination')}>Prospector/UF</button>
      <button type="button" className={view==='store'?'is-active':''} onClick={()=>setView('store')}>Loja</button>
      <button type="button" className={view==='item'?'is-active':''} onClick={()=>setView('item')}>Item</button>
    </div>

    {view==='consolidated' && <>
      <div className="summary-kpis">
        <div><span>Aprovado</span><strong>{formatBRL(summary.approvedCents)}</strong></div>
        <div><span>Realizado conhecido</span><strong>{formatBRL(summary.realizedCents)}</strong></div>
        <div><span>Saldo conhecido</span><strong>{formatBRL(summary.balanceCents)}</strong></div>
        <div><span>Variacao</span><strong>{summary.variationCents===null?'Em andamento':formatBRL(summary.variationCents)}</strong></div>
      </div>
      <div className="purchase-v2-summary-grid">
        <div><span>Itens concluidos</span><strong>{summary.completedItems}/{purchase.items.length}</strong></div>
        <div><span>Registros ativos</span><strong>{summary.activeOrderCount}</strong></div>
        <div><span>Distribuicoes destino pendentes</span><strong>{summary.pendingDestinationDistributions}</strong></div>
        <div><span>Distribuicoes realizadas pendentes</span><strong>{summary.pendingLineDistributions}</strong></div>
        <div><span>Documentos de Compra</span><strong>{purchase.attachments.length}</strong></div>
        <div><span>Fretes realizados pendentes</span><strong>{summary.pendingShippingLines}</strong></div>
        <div><span>Itens com destino real</span><strong>{coverage.destinationItems}</strong></div>
        <div><span>Itens diretos por loja</span><strong>{coverage.directStoreItems}</strong></div>
        <div><span>Fallback legado</span><strong>{coverage.legacyFallbackItems}</strong></div>
        <div><span>Itens sem cobertura</span><strong>{coverage.unallocatedItems}</strong></div>
      </div>
    </>}

    {view==='destination' && <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Item</th><th>Cobertura</th><th>Destino</th><th>UF</th><th>Lojas</th><th>Qtd. aprovada</th><th>Qtd. comprada</th><th>Valor aprovado</th><th>Realizado</th><th>Frete cotado</th><th>Prazo</th><th>Distribuicao</th></tr></thead>
        <tbody>{destinationRows.map((row) => <tr key={row.key}>
          <td>{row.itemName}</td>
          <td>{row.coverage}</td>
          <td><strong>{row.label}</strong></td>
          <td>{row.state}</td>
          <td>{row.storeCount}</td>
          <td>{formatQuantityV2(row.approvedQuantity)} {row.unit}</td>
          <td>{formatQuantityV2(row.purchasedQuantity)} {row.unit}</td>
          <td>{formatBRL(row.approvedCents)}</td>
          <td><strong>{formatBRL(row.realizedCents)}</strong>{row.hasPendingShipping && <small>Frete realizado pendente</small>}</td>
          <td>{row.quotedShipping}</td>
          <td>{row.deliveryDays===null?'Nao informado':`${row.deliveryDays} dias`}</td>
          <td>{row.distribution}</td>
        </tr>)}</tbody>
      </table>
    </div>}

    {view==='store' && <>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Loja</th><th>UF</th><th>Aprovado alocado</th><th>Realizado alocado</th></tr></thead><tbody>{storeCosts.rows.map((row)=><tr key={row.storeId}><td><strong>{row.code}</strong><small>{row.name}</small></td><td>{row.state}</td><td>{formatBRL(row.approvedCents)}</td><td>{formatBRL(row.realizedCents)}</td></tr>)}</tbody></table></div>
      <div className="purchase-v2-unallocated"><div><span>Aprovado nao alocado</span><strong>{formatBRL(storeCosts.approvedUnallocatedCents)}</strong></div><div><span>Realizado nao alocado</span><strong>{formatBRL(storeCosts.realizedUnallocatedCents)}</strong></div></div>
    </>}

    {view==='item' && <div className="table-scroll"><table className="data-table"><thead><tr><th>Item</th><th>Aprovado</th><th>Comprado</th><th>Falta</th><th>Valor aprovado</th><th>Realizado</th><th>Variacao</th></tr></thead><tbody>{purchase.items.map((item)=>{const state=itemExecution(item,purchase);return <tr key={item.id}><td><strong>{item.itemName}</strong><small>{item.itemCode}</small></td><td>{formatQuantityV2(item.quantityApproved)} {item.unit}</td><td>{formatQuantityV2(decimalFromThousandths(state.purchasedQuantity))} {item.unit}</td><td>{formatQuantityV2(decimalFromThousandths(state.missingQuantity))} {item.unit}</td><td>{formatBRL(moneyToCents(item.approvedLineTotal))}</td><td>{formatBRL(state.realizedCents)}{state.hasPendingShipping && <small>Frete realizado pendente</small>}</td><td>{state.variationCents===null?'Em andamento':formatBRL(state.variationCents)}</td></tr>})}</tbody></table></div>}
  </Modal>;
}

export function SupplyPurchasesPage() {
  const { can } = useSession();
  const canEdit = can('purchases.edit' as never);
  const canApprove = can('purchases.approve' as never);
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [pendingFilter, setPendingFilter] = useState('');
  const [registering, setRegistering] = useState<{purchase: PurchaseV2; item: PurchaseItemV2} | null>(null);
  const [historyPurchase, setHistoryPurchase] = useState<PurchaseV2 | null>(null);
  const [distribution, setDistribution] = useState<PurchaseDestinationV2 | null>(null);
  const [lineDistribution, setLineDistribution] = useState<{purchase: PurchaseV2; line: PurchaseOrderLineV2} | null>(null);
  const [documentsPurchase, setDocumentsPurchase] = useState<PurchaseV2 | null>(null);
  const [summaryPurchase, setSummaryPurchase] = useState<PurchaseV2 | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPurchases(await listSupplyPurchasesV2()); }
    catch { setError('Nao foi possivel carregar as compras.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const states = useMemo(() => [...new Set(purchases.flatMap((purchase) => [...purchase.stores.map((store)=>store.state), ...purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.state))]).filter(Boolean))].sort(), [purchases]);
  const destinationLabels = useMemo(() => [...new Set(purchases.flatMap((purchase)=>purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.label))))].sort((a,b)=>a.localeCompare(b,'pt-BR')), [purchases]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return purchases.filter((purchase) => {
      const summary = purchaseExecutionSummary(purchase);
      const text = [purchase.code,purchase.quoteCode,purchase.supplierName,purchase.originCity,purchase.originState,...purchase.items.flatMap((item)=>[item.itemName,item.itemCode,item.offeredBrandModel,item.productUrl,...item.destinations.map((destination)=>destination.label)])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      if (search && !text.includes(search)) return false;
      if (status && purchase.status !== status) return false;
      if (stateFilter && !purchase.stores.some((store)=>store.state===stateFilter) && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.state===stateFilter))) return false;
      if (destinationFilter && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.label===destinationFilter))) return false;
      if (pendingFilter==='destination' && summary.pendingDestinationDistributions===0) return false;
      if (pendingFilter==='line' && summary.pendingLineDistributions===0) return false;
      if (pendingFilter==='shipping' && summary.pendingShippingLines===0) return false;
      if (pendingFilter==='documents' && purchase.attachments.length>0) return false;
      return true;
    });
  }, [purchases,query,status,stateFilter,destinationFilter,pendingFilter]);

  const returnToQuote = async (purchase: PurchaseV2) => {
    if (!window.confirm(`Devolver ${purchase.code} para cotacao? O backend so permite isso quando nao ha execucao/documentos impeditivos.`)) return;
    setReturningId(purchase.id);
    try { await returnPurchaseToQuoteV2(purchase.id); await load(); }
    catch (failure) { window.alert(errorMessage(failure,'Nao foi possivel devolver para cotacao.')); }
    finally { setReturningId(null); }
  };

  return <section className="page-stack purchase-v2-page">
    <header className="page-header"><div><span className="eyebrow">Suprimentos</span><h2>Compras</h2><p>Execucao do aprovado: registros de compra, historico, destinos, distribuicao fisica e documentos.</p></div><button className="button button--secondary" onClick={()=>void load()}><RefreshCcw size={17}/>Atualizar</button></header>
    <div className="filter-bar purchase-v2-filters"><label className="search-field"><Search size={18}/><input placeholder="Buscar compra, cotacao, fornecedor, item ou destino" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><select aria-label="Status da compra" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="">Todos os status</option><option value="approved">Aprovada</option><option value="partially_purchased">Parcialmente comprada</option><option value="purchased">Comprada</option><option value="returned">Devolvida</option><option value="cancelled">Cancelada</option></select><select aria-label="UF" value={stateFilter} onChange={(event)=>setStateFilter(event.target.value)}><option value="">Todas as UFs</option>{states.map((state)=><option key={state} value={state}>{state}</option>)}</select><select aria-label="Prospector ou destino" value={destinationFilter} onChange={(event)=>setDestinationFilter(event.target.value)}><option value="">Todos os destinos</option>{destinationLabels.map((label)=><option key={label} value={label}>{label}</option>)}</select><select aria-label="Pendencia operacional" value={pendingFilter} onChange={(event)=>setPendingFilter(event.target.value)}><option value="">Todas as pendencias</option><option value="destination">Distribuicao mestre pendente</option><option value="line">Distribuicao realizada pendente</option><option value="shipping">Frete realizado pendente</option><option value="documents">Sem documento de Compra</option></select></div>
    {loading ? <InlineLoading label="Carregando compras"/> : error ? <ErrorState message={error} onRetry={()=>void load()}/> : filtered.length ? <div className="purchase-v2-list">{filtered.map((purchase)=>{const summary=purchaseExecutionSummary(purchase);const active=purchase.orders.filter((order)=>order.status==='active');return <article key={purchase.id} className="purchase-v2-card">
      <header className="purchase-v2-card__header"><div className="supply-identity"><small>{purchase.code}</small><strong>{purchase.quoteCode}</strong></div><div><strong>{purchase.supplierName}</strong><small>{channelLabel(purchase)}</small></div><div title={purchase.stores.map((store)=>`${store.code} - ${store.city}/${store.state}${store.address?` - ${store.address}`:''}`).join('\n')}><strong>{purchaseStoresLabel(purchase)}</strong><small>{purchase.stores.length===1?`${purchase.stores[0].city}/${purchase.stores[0].state}`:'Passe para ver as lojas'}</small></div><div><strong>{formatBRL(summary.approvedCents)}</strong><small>Realizado {formatBRL(summary.realizedCents)} · saldo {formatBRL(summary.balanceCents)}</small></div><StatusBadge status={purchase.status}/><div className="row-actions"><IconButton label={`Resumo ${purchase.code}`} onClick={()=>setSummaryPurchase(purchase)}><ShoppingCart size={17}/></IconButton><IconButton label={`Historico ${purchase.code}`} onClick={()=>setHistoryPurchase(purchase)}><History size={17}/></IconButton><IconButton label={`Documentos ${purchase.code}`} onClick={()=>setDocumentsPurchase(purchase)}><Paperclip size={17}/></IconButton><Link className="icon-button" aria-label={`Abrir cotacao ${purchase.quoteCode}`} title="Abrir cotacao de origem" to={`/suprimentos/cotacoes?quote=${purchase.quoteId}`}><ArrowLeft size={17}/></Link>{canApprove && purchase.status!=='returned' && purchase.status!=='cancelled' && <IconButton label={`Voltar ${purchase.code} para cotacao`} disabled={returningId===purchase.id} onClick={()=>void returnToQuote(purchase)}><RefreshCcw size={17}/></IconButton>}</div></header>
      <div className="purchase-v2-indicators"><span>{summary.completedItems}/{purchase.items.length} itens concluidos</span><span>{active.length} registros ativos</span>{summary.pendingDestinationDistributions>0 && <span className="is-warning">{summary.pendingDestinationDistributions} destinos para distribuir</span>}{summary.pendingLineDistributions>0 && <span className="is-warning">{summary.pendingLineDistributions} registros sem distribuicao fisica</span>}{summary.pendingShippingLines>0 && <span className="is-warning">{summary.pendingShippingLines} fretes pendentes</span>}<span>{purchase.attachments.length} documentos de Compra</span></div>
      <div className="purchase-v2-items">{purchase.items.map((item)=>{const execution=itemExecution(item,purchase);const itemLines=active.flatMap((order)=>order.lines.map((line)=>({order,line}))).filter(({line})=>line.purchaseItemId===item.id);return <section key={item.id} className="purchase-v2-item"><header><div><strong>{item.itemName}</strong><small>{item.itemCode}{item.itemCategory?` · ${item.itemCategory}`:''}{item.itemArea?` · ${item.itemArea}`:''}</small>{item.offeredBrandModel && <small>Ofertado: {item.offeredBrandModel}</small>}{item.quoteItemNotes && <small>Obs. da cotacao: {item.quoteItemNotes}</small>}</div><div className="purchase-v2-item__numbers"><span>Aprovado <strong>{formatQuantityV2(item.quantityApproved)} {item.unit}</strong></span><span>Comprado <strong>{formatQuantityV2(decimalFromThousandths(execution.purchasedQuantity))} {item.unit}</strong></span><span>Falta <strong>{formatQuantityV2(decimalFromThousandths(execution.missingQuantity))} {item.unit}</strong></span><span>Realizado <strong>{formatBRL(execution.realizedCents)}</strong></span></div><div>{canEdit && execution.missingQuantity>0n && purchase.status!=='returned' && purchase.status!=='cancelled' && <button type="button" className="button button--primary button--small" onClick={()=>setRegistering({purchase,item})}><PackageCheck size={15}/>Registrar compra</button>}</div></header>
        {item.destinations.length ? <div className="purchase-v2-destinations">{item.destinations.map((destination)=><div key={destination.id} className="purchase-v2-destination"><div><MapPinned size={16}/><span><strong>{destination.label}</strong><small>{destination.state} · {formatQuantityV2(destination.quantity)} {destination.unit} · {quotedShippingLabel(destination)}{destination.quotedDeliveryDays!==null?` · ${destination.quotedDeliveryDays} dias`:''}</small></span></div><span className={`purchase-v2-pill ${destination.distributionStatus==='confirmed'?'is-ok':'is-warning'}`}>{destination.destinationType==='store'?'Direto loja':destination.distributionStatus==='confirmed'?'Distribuicao confirmada':'Distribuicao pendente'}</span>{canEdit && destination.destinationType==='profile' && <button type="button" className="button button--secondary button--small" onClick={()=>setDistribution(destination)}><MapPinned size={15}/>{destination.distributionStatus==='confirmed'?'Revisar lojas':'Distribuir por loja'}</button>}</div>)}</div> : <div className="purchase-v2-hint"><strong>Item sem destinos de frete</strong><span>Nao sera criado destino artificial. A distribuicao fisica do registro pode ser informada depois.</span></div>}
        {itemLines.length>0 && <div className="purchase-v2-executions"><h5>Registros realizados</h5>{itemLines.map(({order,line})=><div key={line.id}><div><Truck size={15}/><span><strong>{formatDate(order.purchasedOn)} · {formatQuantityV2(line.quantity)} {line.unit} · {lineTotalCents(line)===null?'Total pendente':formatBRL(lineTotalCents(line)!)}</strong><small>{line.destinationLabel || 'Sem destino'} · {order.supplierOrderRef || 'sem pedido'} · previsao {formatDate(line.expectedDeliveryDate)}</small></span></div><span className={`purchase-v2-pill ${line.storeDistributionStatus==='confirmed'?'is-ok':'is-warning'}`}>{line.storeDistributionStatus==='confirmed'?'Lojas confirmadas':'Lojas pendentes'}</span>{canEdit && line.storeDistributionStatus!=='confirmed' && <button type="button" className="button button--secondary button--small" onClick={()=>setLineDistribution({purchase,line})}><MapPinned size={15}/>Distribuir registro</button>}</div>)}</div>}
      </section>})}</div>
    </article>})}</div> : <EmptyState title="Nenhuma compra" detail="As cotacoes aprovadas para compra aparecerao aqui."/>}

    <RegisterPurchaseModal purchase={registering?.purchase||null} item={registering?.item||null} onClose={()=>setRegistering(null)} onSaved={load}/>
    <HistoryModal purchase={historyPurchase ? purchases.find((entry)=>entry.id===historyPurchase.id)||historyPurchase : null} onClose={()=>setHistoryPurchase(null)} onSaved={load} canEdit={canEdit}/>
    <DestinationDistributionModal destination={distribution ? purchases.flatMap((purchase)=>purchase.items.flatMap((item)=>item.destinations)).find((entry)=>entry.id===distribution.id)||distribution : null} onClose={()=>setDistribution(null)} onSaved={load}/>
    <LineDistributionModal purchase={lineDistribution ? purchases.find((entry)=>entry.id===lineDistribution.purchase.id)||lineDistribution.purchase : null} line={lineDistribution ? (purchases.find((entry)=>entry.id===lineDistribution.purchase.id)?.orders.flatMap((order)=>order.lines).find((entry)=>entry.id===lineDistribution.line.id)||lineDistribution.line) : null} onClose={()=>setLineDistribution(null)} onSaved={load}/>
    <DocumentsModal purchase={documentsPurchase ? purchases.find((entry)=>entry.id===documentsPurchase.id)||documentsPurchase : null} onClose={()=>setDocumentsPurchase(null)} onSaved={load} canEdit={canEdit}/>
    <SummaryModal purchase={summaryPurchase ? purchases.find((entry)=>entry.id===summaryPurchase.id)||summaryPurchase : null} onClose={()=>setSummaryPurchase(null)}/>
  </section>;
}
