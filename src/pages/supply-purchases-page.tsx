import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  MapPinned,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { ItemMultiFilter, matchesSelectedItems, type ItemFilterOption } from '../components/item-multi-filter';
import { EmptyState, ErrorState, IconButton, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  cancelSupplyPurchaseOrderV2,
  cancelPurchasePaymentV2,
  createPurchaseAttachmentSignedUrlV2,
  createQuoteAttachmentSignedUrlReadOnlyV2,
  createSupplyPurchaseOperationV2,
  deletePurchaseAttachmentV2,
  listSupplyPurchasesV2,
  returnPurchaseToQuoteV2,
  savePurchaseDestinationDistributionV2,
  savePurchaseOrderLineDistributionV2,
  savePurchasePaymentV2,
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
  purchaseDestinationStoreCosts,
  purchaseExecutionSummary,
  purchaseOrderFinancialSummary,
  purchaseOrderStoreCosts,
  purchaseOrderTotalCents,
  purchasePortfolioDestinationRows,
  purchasePortfolioStoreRows,
  purchasePortfolioSummary,
  purchaseStoreCosts,
  purchaseUnlinkedPayments,
  remainingDestinationQuantity,
  remainingItemQuantity,
  suggestedDeliveryDate,
} from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents, quantityToThousandths } from '../domain/supply-calculations';
import type {
  PaymentMethod,
  PurchaseDestinationV2,
  PurchaseDocumentType,
  PurchaseItemV2,
  PurchaseOrderLineV2,
  PurchaseOrderV2,
  PurchasePaymentV2,
  PurchaseStatus,
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
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferencia bancaria',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
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
function purchaseOrderLabel(order: PurchaseOrderV2): string {
  return `${formatDate(order.purchasedOn)} · ${order.supplierOrderRef || order.id.slice(0, 8)} · ${order.status === 'cancelled' ? 'cancelado' : 'ativo'}`;
}
function purchaseOrderContextLabel(purchase: PurchaseV2, purchaseOrderId: string | null): string {
  if (!purchaseOrderId) return 'Sem compra vinculada (legado)';
  const order = purchase.orders.find((entry) => entry.id === purchaseOrderId);
  return order ? purchaseOrderLabel(order) : `Pedido ${purchaseOrderId.slice(0, 8)}`;
}
function centsToInput(value: bigint): string {
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return fraction === '00' ? whole.toString() : `${whole.toString()},${fraction}`;
}
function suggestedPaymentAmount(purchase: PurchaseV2, purchaseOrderId: string): string {
  const orders = purchaseOrderId
    ? purchase.orders.filter((order) => order.id === purchaseOrderId && order.status === 'active')
    : purchase.orders.filter((order) => order.status === 'active');
  if (!orders.length || orders.some((order) => order.lines.some((line) => lineTotalCents(line) === null))) return '';

  const generalPayments = purchase.payments.filter((payment) => payment.status !== 'cancelled' && !payment.purchaseOrderId);
  if (purchaseOrderId && generalPayments.length) return '';

  const orderTotal = orders.flatMap((order) => order.lines).reduce((sum, line) => sum + (lineTotalCents(line) || 0n), 0n);
  const registeredPayments = purchase.payments
    .filter((payment) => payment.status !== 'cancelled' && (purchaseOrderId ? payment.purchaseOrderId === purchaseOrderId : true))
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const remaining = orderTotal - registeredPayments;
  return remaining > 0n ? centsToInput(remaining) : '';
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

type PurchasePaymentDraft = {
  key: string;
  method: PaymentMethod;
  source: string;
  amount: string;
  entry: string;
  installments: string;
  firstDueDate: string;
  status: 'planned' | 'paid';
  notes: string;
};

function paymentDraft(purchase: PurchaseV2, key = 'payment-1'): PurchasePaymentDraft {
  return {
    key,
    method: purchase.paymentMethodSnapshot || 'pix',
    source: '',
    amount: '',
    entry: purchase.entryAmountSnapshot || '',
    installments: purchase.installmentCountSnapshot ? String(purchase.installmentCountSnapshot) : '',
    firstDueDate: '',
    status: 'paid',
    notes: purchase.paymentNotesSnapshot || '',
  };
}

function remainingStoreQuantity(
  purchase: PurchaseV2,
  destination: PurchaseDestinationV2,
  storeId: string,
): bigint {
  const destinationStore = destination.stores.find((store) => store.storeId === storeId);
  if (!destinationStore?.allocatedQuantity) return 0n;
  const allocated = quantityToThousandths(destinationStore.allocatedQuantity);
  const purchased = purchase.orders
    .filter((order) => order.status === 'active')
    .flatMap((order) => order.lines)
    .filter((line) => line.purchaseDestinationId === destination.id)
    .flatMap((line) => line.stores)
    .filter((store) => store.storeId === storeId)
    .reduce((sum, store) => sum + quantityToThousandths(store.quantity), 0n);
  return allocated > purchased ? allocated - purchased : 0n;
}

function allocatedCostPreview(totalCents: bigint | null, quantity: bigint, storeQuantity: bigint): bigint | null {
  if (totalCents === null || quantity <= 0n || storeQuantity <= 0n) return null;
  return (totalCents * storeQuantity + quantity / 2n) / quantity;
}

function RegisterPurchaseModal({
  purchase,
  item,
  onClose,
  onSaved,
  embedded = false,
}: {
  purchase: PurchaseV2 | null;
  item: PurchaseItemV2 | null;
  onClose: () => void;
  onSaved: (orderId: string) => Promise<void>;
  embedded?: boolean;
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
  const deliveryTouchedRef = useRef(false);
  const [notes, setNotes] = useState('');
  const [storeAllocations, setStoreAllocations] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<PurchasePaymentDraft[]>([]);
  const nextPaymentKey = useRef(2);
  const previousSuggestedPayment = useRef('');
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<PurchaseDocumentType>('invoice');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = item?.destinations.find((entry) => entry.id === destinationId) || null;
  const remainingItem = item && purchase ? remainingItemQuantity(item, purchase) : 0n;
  const remainingDestination = destination && purchase ? remainingDestinationQuantity(destination, purchase) : null;
  const maxQuantity = remainingDestination === null ? remainingItem : remainingDestination < remainingItem ? remainingDestination : remainingItem;
  const eligibleStores = (() => {
    if (!purchase || !item) return [];
    if (destination) return destination.stores;
    if (item.storeId) return purchase.stores.filter((store) => store.storeId === item.storeId);
    return purchase.stores;
  })();
  const requiresMasterDistribution = destination?.destinationType === 'profile' && destination.distributionStatus !== 'confirmed';

  useEffect(() => {
    if (!item || !purchase || savedOrderId) return;
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
    deliveryTouchedRef.current = false;
    setNotes('');
    setPayments([paymentDraft(purchase)]);
    nextPaymentKey.current = 2;
    previousSuggestedPayment.current = '';
    setFile(null);
    setDocumentType('invoice');
    setDocumentNumber('');
    setDocumentDescription('');
    setStoreAllocations({});
    setUploadWarning(null);
    setError(null);
  }, [item, purchase, savedOrderId]);

  useEffect(() => {
    if (!item || deliveryTouchedRef.current) return;
    const days = destination ? destination.quotedDeliveryDays : item.quotedDeliveryDays;
    setExpectedDeliveryDate(suggestedDeliveryDate(purchasedOn, days));
  }, [purchasedOn, destination, item]);

  const total = useMemo(() => {
    try {
      if (!quantity.trim() || !unitPrice.trim() || !shipping.trim()) return null;
      return calculateRegistrationTotal({ quantity, unitPrice, discountAmount: discount, shippingAmount: shipping, otherCosts });
    } catch {
      return null;
    }
  }, [quantity, unitPrice, discount, shipping, otherCosts]);

  useEffect(() => {
    if (!purchase || !item || savedOrderId) return;
    const selectedDestination = item.destinations.find((entry) => entry.id === destinationId) || null;
    const stores = selectedDestination
      ? selectedDestination.stores
      : item.storeId
        ? purchase.stores.filter((store) => store.storeId === item.storeId)
        : purchase.stores;
    const next: Record<string, string> = {};
    if (stores.length === 1) {
      next[stores[0].storeId] = quantity;
    } else if (selectedDestination?.distributionStatus === 'confirmed') {
      for (const store of stores) {
        const remaining = remainingStoreQuantity(purchase, selectedDestination, store.storeId);
        next[store.storeId] = remaining > 0n ? decimalFromThousandths(remaining) : '0';
      }
    } else {
      stores.forEach((store) => { next[store.storeId] = ''; });
    }
    setStoreAllocations(next);
  }, [destinationId, item, purchase, quantity, savedOrderId]);

  useEffect(() => {
    const suggested = total === null ? '' : centsToInput(total);
    setPayments((current) => {
      if (current.length !== 1) return current;
      const first = current[0];
      if (first.amount && first.amount !== previousSuggestedPayment.current) return current;
      return [{ ...first, amount: suggested }];
    });
    previousSuggestedPayment.current = suggested;
  }, [total]);

  const allocatedQuantity = useMemo(() => {
    try {
      return Object.values(storeAllocations).reduce(
        (sum, value) => sum + (value.trim() ? quantityToThousandths(value) : 0n),
        0n,
      );
    } catch {
      return null;
    }
  }, [storeAllocations]);

  const updatePayment = (key: string, change: Partial<PurchasePaymentDraft>) => {
    setPayments((current) => current.map((payment) => payment.key === key ? { ...payment, ...change } : payment));
  };

  const paymentTotal = useMemo(() => {
    try {
      return payments.reduce((sum, payment) => sum + (payment.amount.trim() ? moneyToCents(payment.amount) : 0n), 0n);
    } catch {
      return null;
    }
  }, [payments]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!purchase || !item) return;
    setError(null);
    try {
      const qty = quantityToThousandths(quantity);
      if (qty <= 0n) throw new Error('Informe uma quantidade maior que zero.');
      if (qty > maxQuantity) throw new Error('A quantidade informada supera o saldo disponivel para este item/destino.');
      if (item.destinations.length && !destination) throw new Error('Selecione o destino da compra.');
      if (!shipping.trim()) throw new Error('Informe o frete realizado. Use 0 quando o frete for gratis.');
      const subtotal = (qty * moneyToCents(unitPrice) + 500n) / 1000n;
      const discountCents = moneyToCents(discount || '0');
      if (moneyToCents(unitPrice) < 0n || discountCents < 0n || moneyToCents(shipping || '0') < 0n || moneyToCents(otherCosts || '0') < 0n) {
        throw new Error('Valores negativos nao sao permitidos.');
      }
      if (discountCents > subtotal) throw new Error('O desconto nao pode superar o subtotal.');
      const calculated = calculateRegistrationTotal({ quantity, unitPrice, discountAmount: discount, shippingAmount: shipping, otherCosts });
      if (calculated < 0n) throw new Error('O total do registro nao pode ser negativo.');
      if (expectedDeliveryDate && expectedDeliveryDate < purchasedOn) throw new Error('A previsao de entrega nao pode ser anterior a data da compra.');
      if (requiresMasterDistribution) throw new Error(`Confirme primeiro as lojas do destino ${destination?.label}.`);
      if (!eligibleStores.length) throw new Error('A compra precisa ter ao menos uma loja de destino.');
      if (allocatedQuantity === null || allocatedQuantity !== qty) throw new Error('A quantidade da compra deve ficar totalmente distribuida entre as lojas.');
      if (!payments.length) throw new Error('Informe ao menos um pagamento.');
      for (const payment of payments) {
        const amountCents = moneyToCents(payment.amount);
        if (amountCents <= 0n) throw new Error('Todos os pagamentos precisam ter valor maior que zero.');
        if (payment.entry && moneyToCents(payment.entry) > amountCents) throw new Error('A entrada nao pode superar o pagamento.');
        if (payment.installments && Number(payment.installments) < 1) throw new Error('Revise a quantidade de parcelas.');
      }
      if (paymentTotal === null || paymentTotal !== calculated) throw new Error('A soma dos pagamentos deve ser igual ao total da compra.');
      if (file) {
        const validation = validatePurchaseAttachmentV2(file);
        if (validation) throw new Error(validation);
      }
    } catch (failure) {
      setError(errorMessage(failure, 'Revise os valores informados.'));
      return;
    }

    setSaving(true);
    try {
      const result = await createSupplyPurchaseOperationV2({
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
          storeAllocations: eligibleStores.map((store) => ({
            storeId: store.storeId,
            quantity: storeAllocations[store.storeId] || '0',
          })),
        }],
        payments: payments.map((payment) => ({
          paymentMethod: payment.method,
          sourceLabel: payment.source,
          amount: payment.amount,
          entryAmount: payment.entry,
          installmentCount: payment.installments,
          firstDueDate: payment.firstDueDate,
          status: payment.status,
          paidAt: payment.status === 'paid' ? new Date().toISOString() : '',
          notes: payment.notes,
        })),
      });
      setSavedOrderId(result.orderId);
      if (file) {
        try {
          await uploadPurchaseAttachmentV3({
            purchaseId: purchase.id,
            purchaseOrderId: result.orderId,
            file,
            description: documentDescription,
            documentType,
            documentNumber,
            documentDate: purchasedOn,
            documentAmount: total === null ? '' : centsToInput(total),
            storeIds: eligibleStores
              .filter((store) => (storeAllocations[store.storeId] || '').trim() && quantityToThousandths(storeAllocations[store.storeId]) > 0n)
              .map((store) => store.storeId),
          });
        } catch (failure) {
          setUploadWarning(errorMessage(failure, 'A compra e o pagamento foram salvos, mas o arquivo nao foi enviado.'));
        }
      }
      await onSaved(result.orderId);
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel registrar a compra e o pagamento.'));
    } finally {
      setSaving(false);
    }
  };

  const content = purchase && item ? savedOrderId ? (
    <div className="purchase-v2-operation-success" role="status">
      <PackageCheck size={28}/>
      <div><strong>Compra registrada com pagamento e lojas vinculadas.</strong><span>O registro agora aparece como uma unica operacao.</span></div>
      {uploadWarning && <div className="form-error">{uploadWarning}</div>}
      <button type="button" className="button button--primary" onClick={onClose}>Concluir</button>
    </div>
  ) : (
        <form className="stack-form" onSubmit={submit} noValidate>
          <section className="purchase-v2-operation-section">
            <header><span>1</span><div><strong>Dados da compra</strong><small>Item, quantidade, valores e pedido do fornecedor.</small></div></header>
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
            <label className="field">Frete realizado<input value={shipping} onChange={(event) => setShipping(event.target.value)} placeholder="Informe o valor · 0 = gratis" /></label>
            <label className="field">Outros custos<input value={otherCosts} onChange={(event) => setOtherCosts(event.target.value)} /></label>
            <label className="field">Referencia / pedido<input value={supplierOrderRef} onChange={(event) => setSupplierOrderRef(event.target.value)} /></label>
            <label className="field">Previsao de entrega<input type="date" value={expectedDeliveryDate} onInput={(event) => { deliveryTouchedRef.current = true; setExpectedDeliveryDate(event.currentTarget.value); }} /></label>
          </div>
          <label className="field">Observacoes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="purchase-v2-total"><span>Total deste registro</span><strong>{!shipping.trim() ? 'Pendente · frete nao informado' : total === null ? 'Revise quantidade e valores' : formatBRL(total)}</strong></div>
          </section>

          <section className="purchase-v2-operation-section">
            <header><span>2</span><div><strong>Lojas e custos</strong><small>Cada quantidade e cada centavo precisam ter uma loja de destino.</small></div></header>
            {requiresMasterDistribution && <div className="form-error">Confirme primeiro a distribuicao mestre do destino {destination?.label}. Depois retorne para registrar a compra.</div>}
            <div className="purchase-v2-allocation-total">
              <span>Quantidade comprada</span><strong>{quantity || '0'} {item.unit}</strong>
              <span>Distribuida</span><strong>{allocatedQuantity === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocatedQuantity))} ${item.unit}`}</strong>
            </div>
            <div className="purchase-v2-store-cost-editor">
              {eligibleStores.map((store) => {
                const storeQuantity = (() => { try { return quantityToThousandths(storeAllocations[store.storeId] || '0'); } catch { return 0n; } })();
                const cost = allocatedCostPreview(total, (() => { try { return quantityToThousandths(quantity); } catch { return 0n; } })(), storeQuantity);
                return <label className="field" key={store.storeId}>
                  <span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span>
                  <input aria-label={`Quantidade da loja ${store.code}`} value={storeAllocations[store.storeId] || ''} onChange={(event) => setStoreAllocations((current) => ({ ...current, [store.storeId]: event.target.value }))} placeholder="Quantidade" />
                  <small>Custo desta loja: <strong>{cost === null ? 'A calcular' : formatBRL(cost)}</strong></small>
                </label>;
              })}
            </div>
          </section>

          <section className="purchase-v2-operation-section">
            <header><span>3</span><div><strong>Pagamento</strong><small>Obrigatorio e sempre vinculado a esta compra.</small></div></header>
            <div className="purchase-v2-payment-drafts">
              {payments.map((payment, index) => <div className="purchase-v2-payment-draft" key={payment.key}>
                <header><strong>Pagamento {index + 1}</strong>{payments.length > 1 && <button type="button" className="button button--secondary button--small" onClick={() => setPayments((current) => current.filter((entry) => entry.key !== payment.key))}><XCircle size={15}/>Remover</button>}</header>
                <div className="form-grid form-grid--three">
                  <label className="field">Forma de pagamento<select value={payment.method} onChange={(event) => updatePayment(payment.key, { method: event.target.value as PaymentMethod })}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="field">Valor total<input value={payment.amount} onChange={(event) => updatePayment(payment.key, { amount: event.target.value })} required /></label>
                  <label className="field">Situacao<select value={payment.status} onChange={(event) => updatePayment(payment.key, { status: event.target.value as 'planned' | 'paid' })}><option value="paid">Pago</option><option value="planned">A pagar / previsto</option></select></label>
                  <label className="field">Origem / cartao utilizado<input value={payment.source} onChange={(event) => updatePayment(payment.key, { source: event.target.value })} placeholder="Ex.: Cartao corporativo final 1234" /></label>
                  <label className="field">Entrada<input value={payment.entry} onChange={(event) => updatePayment(payment.key, { entry: event.target.value })} /></label>
                  <label className="field">Parcelas<input inputMode="numeric" value={payment.installments} onChange={(event) => updatePayment(payment.key, { installments: event.target.value.replace(/\D/g, '') })} /></label>
                  {payment.status === 'planned' && <label className="field">Primeiro vencimento<input type="date" value={payment.firstDueDate} onChange={(event) => updatePayment(payment.key, { firstDueDate: event.target.value })} /></label>}
                </div>
                <label className="field">Observacoes do pagamento<textarea rows={2} value={payment.notes} onChange={(event) => updatePayment(payment.key, { notes: event.target.value })} /></label>
              </div>)}
            </div>
            <div className="purchase-v2-payment-balance"><span>Total da compra <strong>{total === null ? 'A calcular' : formatBRL(total)}</strong></span><span>Pagamentos <strong>{paymentTotal === null ? 'Valor invalido' : formatBRL(paymentTotal)}</strong></span><span className={total !== null && paymentTotal === total ? 'is-ok' : 'is-warning'}>Diferenca <strong>{total === null || paymentTotal === null ? 'A calcular' : formatBRL(total - paymentTotal)}</strong></span></div>
            <button type="button" className="button button--secondary button--small" onClick={() => {
              const key = `payment-${nextPaymentKey.current++}`;
              setPayments((current) => [...current, { ...paymentDraft(purchase, key), amount: '' }]);
            }}><Plus size={15}/>Adicionar outra forma de pagamento</button>
          </section>

          <section className="purchase-v2-operation-section">
            <header><span>4</span><div><strong>Arquivo da compra</strong><small>Opcional. Nota fiscal, recibo ou comprovante ficará na mesma operacao.</small></div></header>
            <div className="form-grid form-grid--three">
              <label className="field">Tipo de documento<select value={documentType} onChange={(event) => setDocumentType(event.target.value as PurchaseDocumentType)}>{OPERATIONAL_DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}</select></label>
              <label className="field">Numero do documento<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} /></label>
              <label className="field">Arquivo<input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
            </div>
            <label className="field">Descricao do arquivo<input value={documentDescription} onChange={(event) => setDocumentDescription(event.target.value)} /></label>
          </section>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
            <button className="button button--primary" disabled={saving || Boolean(requiresMasterDistribution)}>{saving ? 'Salvando compra...' : 'Salvar compra completa'}</button>
          </div>
        </form>
      ) : null;

  if (embedded) return content;
  return (
    <Modal
      open={Boolean(purchase && item)}
      title={item ? `Registrar compra · ${item.itemName}` : 'Registrar compra'}
      description={item ? `Aprovado ${formatQuantityV2(item.quantityApproved)} ${item.unit} · falta ${formatQuantityV2(decimalFromThousandths(remainingItem))} ${item.unit}` : undefined}
      onClose={onClose}
    >
      {content}
    </Modal>
  );
}

function PaymentModal({
  purchase,
  initialPurchaseOrderId,
  lockedPurchaseOrderId,
  editingPayment = null,
  onClose,
  onSaved,
  canEdit,
  embedded = false,
}: {
  purchase: PurchaseV2 | null;
  initialPurchaseOrderId?: string;
  lockedPurchaseOrderId?: string;
  editingPayment?: PurchasePaymentV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
  embedded?: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [entry, setEntry] = useState('');
  const [installments, setInstallments] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [status, setStatus] = useState<'planned' | 'paid'>('planned');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchase) return;
    const requestedOrderId = lockedPurchaseOrderId || editingPayment?.purchaseOrderId || initialPurchaseOrderId || '';
    const initialOrderId = purchase.orders.some((order) => order.id === requestedOrderId) ? requestedOrderId : '';
    setMethod(editingPayment?.paymentMethod || purchase.paymentMethodSnapshot || 'pix');
    setPurchaseOrderId(initialOrderId);
    setSource(editingPayment?.sourceLabel || '');
    setAmount(editingPayment?.amount || suggestedPaymentAmount(purchase, initialOrderId));
    setEntry(editingPayment?.entryAmount || purchase.entryAmountSnapshot || '');
    setInstallments(editingPayment?.installmentCount ? String(editingPayment.installmentCount) : purchase.installmentCountSnapshot ? String(purchase.installmentCountSnapshot) : '');
    setFirstDueDate(editingPayment?.firstDueDate || '');
    setStatus(editingPayment?.status === 'paid' ? 'paid' : 'planned');
    setNotes(editingPayment?.notes || purchase.paymentNotesSnapshot || '');
    setError(null);
  }, [editingPayment, initialPurchaseOrderId, lockedPurchaseOrderId, purchase]);

  const visiblePayments = purchase?.payments.filter((payment) => (
    lockedPurchaseOrderId ? payment.purchaseOrderId === lockedPurchaseOrderId : true
  )) || [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!purchase) return;
    try {
      if (!purchaseOrderId) throw new Error('Selecione a compra relacionada.');
      if (moneyToCents(amount) <= 0n) throw new Error('Informe um valor maior que zero.');
      if (entry && moneyToCents(entry) > moneyToCents(amount)) throw new Error();
      if (installments && Number(installments) < 1) throw new Error();
    } catch (failure) {
      setError(errorMessage(failure, 'Revise os valores do pagamento.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await savePurchasePaymentV2({
        id: editingPayment?.id || null,
        purchaseId: purchase.id,
        purchaseOrderId,
        paymentMethod: method,
        sourceLabel: source,
        amount,
        entryAmount: entry,
        installmentCount: installments,
        firstDueDate,
        status,
        paidAt: status === 'paid' ? editingPayment?.paidAt || new Date().toISOString() : '',
        notes,
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel registrar o pagamento.'));
    } finally {
      setSaving(false);
    }
  };

  const cancelPayment = async (payment: PurchasePaymentV2) => {
    const prompt = payment.status === 'paid'
      ? 'Informe o motivo do estorno/cancelamento deste pagamento:'
      : 'Informe o motivo do cancelamento deste pagamento:';
    const reason = window.prompt(prompt);
    if (!reason?.trim()) return;
    setCancellingId(payment.id);
    setError(null);
    try {
      await cancelPurchasePaymentV2(payment.id, reason);
      await onSaved();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel cancelar o pagamento.'));
    } finally {
      setCancellingId(null);
    }
  };

  const content = purchase ? (
        <div className="purchase-v2-payment-sections">
          <section className="purchase-v2-payment-section">
            <h4>Pagamentos registrados</h4>
            {visiblePayments.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Compra / pedido</th><th>Forma</th><th>Origem</th><th>Valor</th><th>Parcelas</th><th>Situacao</th><th>Vencimento / pagamento</th><th>Acoes</th></tr></thead>
                  <tbody>{visiblePayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{purchaseOrderContextLabel(purchase, payment.purchaseOrderId)}</td>
                      <td>{PAYMENT_LABELS[payment.paymentMethod]}</td>
                      <td>{payment.sourceLabel || 'Nao informada'}</td>
                      <td><strong>{formatBRL(moneyToCents(payment.amount))}</strong></td>
                      <td>{payment.installmentCount ? `${payment.installmentCount}x` : 'A vista'}</td>
                      <td><span className={`purchase-v2-pill ${payment.status === 'paid' ? 'is-ok' : payment.status === 'planned' ? 'is-warning' : ''}`}>{payment.status === 'paid' ? 'Pago' : payment.status === 'planned' ? 'Previsto' : 'Cancelado'}</span></td>
                      <td>{payment.status === 'paid' && payment.paidAt ? `Pago em ${formatDate(payment.paidAt)}` : formatDate(payment.firstDueDate)}</td>
                      <td>{canEdit && payment.status !== 'cancelled' && <div className="row-actions"><button type="button" className="button button--secondary button--small" onClick={() => void cancelPayment(payment)} disabled={cancellingId === payment.id}>{payment.status === 'paid' ? 'Estornar' : 'Cancelar'}</button></div>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title="Sem pagamentos" detail="Os pagamentos previstos ou realizados aparecerao aqui." />}
          </section>

          {canEdit && purchase.status !== 'returned' && purchase.status !== 'cancelled' && (
            <section className="purchase-v2-payment-section">
              <h4>{editingPayment ? 'Editar pagamento' : 'Novo pagamento desta compra'}</h4>
              <form className="stack-form" onSubmit={submit}>
                <div className="form-grid form-grid--three">
                  {lockedPurchaseOrderId ? <div className="purchase-v2-locked-context"><span>Compra relacionada</span><strong>{purchaseOrderContextLabel(purchase, lockedPurchaseOrderId)}</strong></div> : <label className="field">Registro/pedido relacionado<select value={purchaseOrderId} onChange={(event) => {
                    const nextOrderId = event.target.value;
                    setPurchaseOrderId(nextOrderId);
                    setAmount(suggestedPaymentAmount(purchase, nextOrderId));
                  }} required><option value="">Selecione a compra</option>{purchase.orders.filter((order) => order.status === 'active').map((order) => <option key={order.id} value={order.id}>{purchaseOrderLabel(order)}</option>)}</select></label>}
                  <label className="field">Forma de pagamento<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="field">Origem / cartao utilizado<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Ex.: Cartao Corporativo final 1234" /></label>
                  <label className="field">Valor<input value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
                  <label className="field">Entrada<input value={entry} onChange={(event) => setEntry(event.target.value)} /></label>
                  <label className="field">Parcelas<input inputMode="numeric" value={installments} onChange={(event) => setInstallments(event.target.value.replace(/\D/g, ''))} /></label>
                  <label className="field">Primeiro vencimento<input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} /></label>
                  <label className="field">Situacao<select value={status} onChange={(event) => setStatus(event.target.value as 'planned' | 'paid')}><option value="planned">Previsto</option><option value="paid">Pago</option></select></label>
                </div>
                <label className="field">Observacoes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
                {error && <div className="form-error">{error}</div>}
                <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Voltar</button><button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : editingPayment ? 'Salvar pagamento' : 'Registrar pagamento'}</button></div>
              </form>
            </section>
          )}
        </div>
      ) : null;

  if (embedded) return content;
  return (
    <Modal
      open={Boolean(purchase)}
      title={purchase ? `Pagamentos · ${purchase.code}` : 'Pagamentos'}
      description="Nao informe numero completo do cartao nem CVV. Use somente uma identificacao segura."
      onClose={onClose}
    >
      {content}
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
    setAllocations(Object.fromEntries(destination.stores.map((store) => [
      store.storeId,
      store.allocatedQuantity === null
        ? destination.stores.length === 1
          ? destination.quantity
          : ''
        : store.allocatedQuantity,
    ])));
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
  const singleStore = Boolean(destination && destination.stores.length === 1);
  return <Modal
    open={Boolean(destination)}
    title={destination ? `${singleStore ? 'Confirmar loja' : 'Distribuir destino'} · ${destination.label}` : 'Distribuicao por loja'}
    description={singleStore
      ? 'Este destino possui uma unica loja. Confirme que toda a quantidade aprovada pertence a ela.'
      : 'Informe quanto da quantidade aprovada deste destino pertence a cada loja. A soma deve fechar exatamente o total do destino.'}
    onClose={onClose}
  >
    {destination && <form className="stack-form" onSubmit={submit}>
      <div className="purchase-v2-allocation-total"><span>Destino</span><strong>{formatQuantityV2(destination.quantity)} {destination.unit}</strong><span>Alocado</span><strong>{allocated === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocated))} ${destination.unit}`}</strong></div>
      <div className="purchase-v2-allocation-grid">{destination.stores.map((store) => <label className="field" key={store.storeId}><span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span><input value={allocations[store.storeId] ?? ''} onChange={(event) => setAllocations((current) => ({ ...current, [store.storeId]: event.target.value }))} placeholder="Quantidade" /></label>)}</div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : singleStore ? 'Confirmar loja' : 'Salvar distribuicao'}</button></div>
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
  initialPurchaseOrderId,
  lockedPurchaseOrderId,
  onClose,
  onSaved,
  canEdit,
  embedded = false,
}: {
  purchase: PurchaseV2 | null;
  initialPurchaseOrderId?: string;
  lockedPurchaseOrderId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
  embedded?: boolean;
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
  useEffect(() => { if (purchase) { const requestedOrderId = lockedPurchaseOrderId || initialPurchaseOrderId || ''; const order = purchase.orders.find((entry) => entry.id === requestedOrderId); setPurchaseOrderId(order?.id || ''); setDocumentNumber(''); setDocumentDate(''); setDocumentAmount(''); setDescription(''); setStoreIds(order ? [...new Set(order.lines.flatMap((line) => line.stores.map((store) => store.storeId)))] : []); setFile(null); setError(null); } }, [initialPurchaseOrderId, lockedPurchaseOrderId, purchase]);
  const toggleStore = (storeId: string) => setStoreIds((current) => current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId]);
  const upload = async () => {
    if (!purchase || !file) return;
    if (!purchaseOrderId) { setError('Selecione a compra relacionada.'); return; }
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
  const visibleAttachments = purchase?.attachments.filter((attachment) => lockedPurchaseOrderId ? attachment.purchaseOrderId === lockedPurchaseOrderId : true) || [];
  const content = purchase ? <div className="stack-form">
      {canEdit && <section className="purchase-v2-doc-create"><h4>Novo documento de Compra</h4><div className="form-grid form-grid--three">
        <label className="field">Tipo<select value={documentType} onChange={(event) => setDocumentType(event.target.value as PurchaseDocumentType)}>{OPERATIONAL_DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}</select></label>
        {lockedPurchaseOrderId ? <div className="purchase-v2-locked-context"><span>Compra relacionada</span><strong>{purchaseOrderContextLabel(purchase, lockedPurchaseOrderId)}</strong></div> : <label className="field">Registro/pedido relacionado<select value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} required><option value="">Selecione a compra</option>{purchase.orders.filter((order) => order.status === 'active').map((order) => <option key={order.id} value={order.id}>{purchaseOrderLabel(order)}</option>)}</select></label>}
        <label className="field">Numero do documento<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} /></label>
        <label className="field">Data<input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></label>
        <label className="field">Valor<input value={documentAmount} onChange={(event) => setDocumentAmount(event.target.value)} /></label>
        <label className="field">Arquivo<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      </div><label className="field">Descricao<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="purchase-v2-store-scope"><span>Lojas relacionadas <small>Opcional; sem selecao = documento geral da compra.</small></span><div>{purchase.stores.map((store) => <label key={store.storeId}><input type="checkbox" checked={storeIds.includes(store.storeId)} onChange={() => toggleStore(store.storeId)} />{store.code} · {store.city}/{store.state}</label>)}</div></div>
      <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Voltar</button><button type="button" className="button button--primary" disabled={!file || saving} onClick={() => void upload()}>{saving ? 'Enviando...' : 'Anexar documento'}</button></div></section>}
      {error && <div className="form-error">{error}</div>}
      <section><h4>Arquivos desta compra</h4>{visibleAttachments.length ? <div className="quote-attachment-list">{visibleAttachments.map((attachment) => <article key={attachment.id}><FileText size={18}/><div><strong>{attachment.originalName}</strong><span>{DOCUMENT_LABELS[attachment.documentType]} · {purchaseOrderContextLabel(purchase, attachment.purchaseOrderId)}{attachment.documentNumber ? ` · ${attachment.documentNumber}` : ''}{attachment.stores.length ? ` · ${attachment.stores.map((store)=>store.code).join(', ')}` : ''}</span></div><span>{attachment.documentDate ? formatDate(attachment.documentDate) : new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span><button type="button" className="button button--secondary button--small" disabled={openingId===attachment.id} onClick={() => void openPurchase(attachment.id,attachment.storagePath)}>Abrir</button>{canEdit && <IconButton label={`Remover ${attachment.originalName}`} onClick={() => void remove(attachment.id)}><XCircle size={16}/></IconButton>}</article>)}</div> : <EmptyState title="Nenhum arquivo nesta compra" detail="Notas, recibos, comprovantes e ordens de compra aparecerao aqui." />}</section>
      {!lockedPurchaseOrderId && <section><h4>Documentos da Cotacao · somente leitura</h4>{purchase.quoteAttachments.length ? <div className="quote-attachment-list">{purchase.quoteAttachments.map((attachment) => <article key={attachment.id}><FileText size={18}/><div><strong>{attachment.originalName}</strong><span>{QUOTE_DOCUMENT_LABELS[attachment.documentType] || attachment.documentType} · origem {purchase.quoteCode}</span></div><span>{new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span><button type="button" className="button button--secondary button--small" disabled={openingId===attachment.id} onClick={() => void openQuote(attachment.id,attachment.storagePath)}>Abrir</button></article>)}</div> : <EmptyState title="Sem documentos na cotacao" detail="Nenhum arquivo de origem esta disponivel para esta compra." />}</section>}
    </div> : null;
  if (embedded) return content;
  return <Modal open={Boolean(purchase)} title={purchase ? `Documentos · ${purchase.code}` : 'Documentos'} description="Documentos da cotacao sao exibidos apenas para consulta; arquivos nao sao duplicados." onClose={onClose}>
    {content}
  </Modal>;
}

type PurchaseManagementTab = 'purchase' | 'payment' | 'documents';
type PurchaseOperationEditor =
  | { kind: 'payment'; orderId?: string; payment?: PurchasePaymentV2 }
  | { kind: 'documents'; orderId: string }
  | null;

function PurchaseManagementModal({
  purchase,
  initialTab,
  initialItemId,
  onClose,
  onSaved,
  canEdit,
}: {
  purchase: PurchaseV2 | null;
  initialTab: PurchaseManagementTab;
  initialItemId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
}) {
  const [itemId, setItemId] = useState(initialItemId || '');
  const [creating, setCreating] = useState(Boolean(initialItemId));
  const [editor, setEditor] = useState<PurchaseOperationEditor>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [openingQuoteId, setOpeningQuoteId] = useState<string | null>(null);
  useEffect(() => {
    if (!purchase) return;
    const firstPending = purchase.items.find((item) => remainingItemQuantity(item, purchase) > 0n);
    setItemId(initialItemId || firstPending?.id || purchase.items[0]?.id || '');
    setCreating(Boolean(initialItemId));
    const firstActiveOrder = purchase.orders.find((order) => order.status === 'active');
    setEditor(initialTab === 'payment' && firstActiveOrder
      ? { kind: 'payment', orderId: firstActiveOrder.id }
      : initialTab === 'documents' && firstActiveOrder
        ? { kind: 'documents', orderId: firstActiveOrder.id }
        : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemId, initialTab, purchase?.id]);
  if (!purchase) return null;
  const item = purchase.items.find((entry) => entry.id === itemId) || purchase.items[0] || null;
  const isClosed = purchase.status === 'returned' || purchase.status === 'cancelled';
  const canRegister = Boolean(item && canEdit && !isClosed && remainingItemQuantity(item, purchase) > 0n);
  const unlinked = purchaseUnlinkedPayments(purchase);
  const activeUnlinkedPayments = unlinked.payments.filter((payment) => payment.status !== 'cancelled');
  const orphanAttachments = purchase.attachments.filter((attachment) => !attachment.purchaseOrderId);
  const cancelOrder = async (order: PurchaseOrderV2) => {
    const reason = window.prompt('Informe o motivo do cancelamento desta compra:');
    if (!reason?.trim()) return;
    setCancellingOrderId(order.id);
    setError(null);
    try {
      await cancelSupplyPurchaseOrderV2(order.id, reason);
      await onSaved();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel cancelar a compra. Se houver pagamento pago, estorne-o primeiro.'));
    } finally {
      setCancellingOrderId(null);
    }
  };
  const openQuoteDocument = async (id: string, path: string) => {
    setOpeningQuoteId(id);
    setError(null);
    try {
      window.open(await createQuoteAttachmentSignedUrlReadOnlyV2(path), '_blank', 'noopener,noreferrer');
    } catch {
      setError('Nao foi possivel abrir o documento da cotacao.');
    } finally {
      setOpeningQuoteId(null);
    }
  };

  return <Modal
    className="purchase-v2-manage-modal"
    open
    title={`Gerenciar compra · ${purchase.code}`}
    description={`${purchase.quoteCode} · ${purchase.supplierName}`}
    onClose={onClose}
  >
    <div className="purchase-v2-unified-intro"><PackageCheck size={22}/><div><strong>Uma linha para cada compra realizada</strong><span>Dados da compra, pagamento, lojas e arquivos permanecem vinculados na mesma operacao.</span></div></div>
    {error && <div className="form-error">{error}</div>}

    {canRegister && item && <details className="purchase-v2-new-operation" open={creating} onToggle={(event) => setCreating(event.currentTarget.open)}>
      <summary><span><Plus size={17}/><strong>Nova compra</strong></span><small>Pagamento e lojas obrigatorios · arquivo opcional</small></summary>
      {creating && <div className="stack-form">
        <label className="field">Item da compra
          <select aria-label="Item da compra" value={item.id} onChange={(event) => setItemId(event.target.value)}>
            {purchase.items.map((entry) => {
              const remaining = remainingItemQuantity(entry, purchase);
              return <option key={entry.id} value={entry.id} disabled={remaining <= 0n}>{entry.itemCode} · {entry.itemName} · falta {formatQuantityV2(decimalFromThousandths(remaining))} {entry.unit}</option>;
            })}
          </select>
        </label>
        <RegisterPurchaseModal embedded purchase={purchase} item={item} onClose={onClose} onSaved={async () => { await onSaved(); }}/>
      </div>}
    </details>}

    {!canRegister && <EmptyState title={isClosed ? 'Processo encerrado' : 'Todos os itens foram comprados'} detail={isClosed ? 'As compras, pagamentos e arquivos permanecem disponiveis para auditoria.' : 'As operacoes realizadas estao consolidadas abaixo.'}/>}

    <section className="purchase-v2-operation-list">
      <header><div><strong>Compras realizadas</strong><span>{purchase.orders.length} operacoes no historico</span></div></header>
      {purchase.orders.length ? purchase.orders.map((order) => {
        const total = purchaseOrderTotalCents(order);
        const financial = purchaseOrderFinancialSummary(purchase, order);
        const costs = purchaseOrderStoreCosts(order);
        const attachments = purchase.attachments.filter((attachment) => attachment.purchaseOrderId === order.id);
        const financialClass = financial.isReconciled ? 'is-ok' : 'is-warning';
        return <article key={order.id} className={`purchase-v2-operation-row ${order.status === 'cancelled' ? 'is-cancelled' : ''}`}>
          <header>
            <div><small>Compra</small><strong>{formatDate(order.purchasedOn)} · {order.supplierOrderRef || 'Sem referencia'}</strong><span>{order.lines.map((line) => line.itemName).join(', ')}</span></div>
            <div><small>Valor</small><strong>{total === null ? 'Frete pendente' : formatBRL(total)}</strong><span>{order.lines.reduce((sum, line) => sum + Number(line.quantity), 0)} unidades/itens</span></div>
            <div><small>Pagamento</small><strong>{formatBRL(financial.paidCents)} pago</strong><span>{formatBRL(financial.plannedCents)} previsto</span></div>
            <div><small>Lojas e arquivos</small><strong>{costs.rows.length} lojas · {attachments.length} arquivos</strong><span className={`purchase-v2-pill ${costs.isConfirmed ? 'is-ok' : 'is-warning'}`}>{costs.isConfirmed ? 'Custos confirmados' : 'Custos pendentes'}</span></div>
            <div><span className={`purchase-v2-pill ${order.status === 'cancelled' ? '' : financialClass}`}>{order.status === 'cancelled' ? 'Cancelada' : financial.isReconciled ? 'Pagamento conciliado' : 'Pagamento divergente'}</span></div>
            <div className="row-actions">
              {canEdit && order.status === 'active' && <><button type="button" className="button button--secondary button--small" onClick={() => setEditor({ kind: 'payment', orderId: order.id })}><CreditCard size={15}/>Pagamento</button><button type="button" className="button button--secondary button--small" onClick={() => setEditor({ kind: 'documents', orderId: order.id })}><Paperclip size={15}/>Arquivo</button><button type="button" className="button button--secondary button--small" disabled={cancellingOrderId === order.id} onClick={() => void cancelOrder(order)}><XCircle size={15}/>Cancelar</button></>}
            </div>
          </header>
          <div className="purchase-v2-operation-body">
            <section><h4>Itens e destino</h4>{order.lines.map((line) => <div className="purchase-v2-operation-line" key={line.id}><span><strong>{line.itemName}</strong><small>{line.itemCode} · {line.destinationLabel || 'Destino por loja'}</small></span><span>{formatQuantityV2(line.quantity)} {line.unit}</span><strong>{lineTotalCents(line) === null ? 'Pendente' : formatBRL(lineTotalCents(line)!)}</strong></div>)}</section>
            <section><h4>Custo final por loja</h4><small className="purchase-v2-muted">Itens e custos compartilhados sao rateados pela quantidade; todos os centavos permanecem fechados.</small>{costs.rows.length ? costs.rows.map((store) => <div className="purchase-v2-operation-line" key={store.storeId}><span><strong>{store.code} · {store.name}</strong><small>{store.city}/{store.state} · {store.lines.map((line) => `${formatQuantityV2(line.quantity)} ${line.unit} ${line.itemName}`).join(' + ')}</small></span><strong>{formatBRL(store.costCents)}</strong></div>) : <span className="purchase-v2-inline-warning">Defina as lojas para concluir o custo.</span>}{costs.unallocatedCents !== 0n && <div className="purchase-v2-inline-warning">Ainda sem loja: {formatBRL(costs.unallocatedCents)}</div>}</section>
            <section><h4>Pagamentos desta compra</h4>{financial.payments.length ? financial.payments.map((payment) => <div className="purchase-v2-operation-line" key={payment.id}><span><strong>{PAYMENT_LABELS[payment.paymentMethod]}</strong><small>{payment.sourceLabel || 'Origem nao informada'}{payment.installmentCount ? ` · ${payment.installmentCount}x` : ' · a vista'}</small></span><strong>{formatBRL(moneyToCents(payment.amount))}</strong><span className={`purchase-v2-pill ${payment.status === 'paid' ? 'is-ok' : payment.status === 'planned' ? 'is-warning' : ''}`}>{payment.status === 'paid' ? 'Pago' : payment.status === 'planned' ? 'Previsto' : 'Cancelado'}</span></div>) : <span className="purchase-v2-inline-warning">Nenhum pagamento vinculado.</span>}<div className="purchase-v2-operation-balance"><span>Saldo a pagar</span><strong>{financial.balanceToPayCents === null ? 'Pendente' : formatBRL(financial.balanceToPayCents)}</strong></div></section>
            <section><h4>Arquivos desta compra</h4>{attachments.length ? attachments.map((attachment) => <div className="purchase-v2-operation-line" key={attachment.id}><span><strong>{attachment.originalName}</strong><small>{DOCUMENT_LABELS[attachment.documentType]}{attachment.documentNumber ? ` · ${attachment.documentNumber}` : ''}</small></span></div>) : <span className="purchase-v2-muted">Nenhum arquivo anexado.</span>}</section>
          </div>
        </article>;
      }) : <EmptyState title="Nenhuma compra realizada" detail="A primeira compra completa aparecera aqui com pagamento, lojas e arquivos."/>}
    </section>

    {(activeUnlinkedPayments.length > 0 || orphanAttachments.length > 0) && <section className="purchase-v2-orphans">
      <header><div><strong>Registros antigos sem compra vinculada</strong><span>Não entram como pagamento ou arquivo de uma compra específica até serem conciliados.</span></div></header>
      {activeUnlinkedPayments.map((payment) => <div className="purchase-v2-orphan-row" key={payment.id}><span><strong>{PAYMENT_LABELS[payment.paymentMethod]} · {formatBRL(moneyToCents(payment.amount))}</strong><small>{payment.sourceLabel || 'Origem nao informada'} · {payment.status === 'paid' ? 'Pago' : 'Previsto'}</small></span>{canEdit && <button type="button" className="button button--secondary button--small" onClick={() => setEditor({ kind: 'payment', payment })}>Vincular a uma compra</button>}</div>)}
      {orphanAttachments.map((attachment) => <div className="purchase-v2-orphan-row" key={attachment.id}><span><strong>{attachment.originalName}</strong><small>Arquivo sem compra especifica</small></span></div>)}
    </section>}

    {purchase.quoteAttachments.length > 0 && <details className="purchase-v2-quote-documents">
      <summary>Documentos da cotacao · somente leitura ({purchase.quoteAttachments.length})</summary>
      <div className="quote-attachment-list">{purchase.quoteAttachments.map((attachment) => <article key={attachment.id}><FileText size={18}/><div><strong>{attachment.originalName}</strong><span>{QUOTE_DOCUMENT_LABELS[attachment.documentType] || attachment.documentType} · origem {purchase.quoteCode}</span></div><button type="button" className="button button--secondary button--small" disabled={openingQuoteId === attachment.id} onClick={() => void openQuoteDocument(attachment.id, attachment.storagePath)}>Abrir</button></article>)}</div>
    </details>}

    {editor?.kind === 'payment' && <section className="purchase-v2-inline-editor"><PaymentModal embedded purchase={purchase} lockedPurchaseOrderId={editor.orderId} editingPayment={editor.payment} onClose={() => setEditor(null)} onSaved={onSaved} canEdit={canEdit}/></section>}
    {editor?.kind === 'documents' && <section className="purchase-v2-inline-editor"><DocumentsModal embedded purchase={purchase} lockedPurchaseOrderId={editor.orderId} onClose={() => setEditor(null)} onSaved={onSaved} canEdit={canEdit}/></section>}
  </Modal>;
}

type BulkAllocationStore = {
  storeId: string;
  code: string;
  name: string;
  city: string;
  state: string;
};

function eligibleStoresForLine(purchase: PurchaseV2, line: PurchaseOrderLineV2): BulkAllocationStore[] {
  const item = purchase.items.find((entry) => entry.id === line.purchaseItemId);
  const destination = item?.destinations.find((entry) => entry.id === line.purchaseDestinationId);
  return destination ? destination.stores : purchase.stores;
}

function BulkStoreConfirmationModal({
  purchase,
  onClose,
  onSaved,
}: {
  purchase: PurchaseV2 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const pendingDestinations = purchase?.items.flatMap((item) => item.destinations)
    .filter((destination) => destination.destinationType === 'profile' && destination.distributionStatus !== 'confirmed') || [];
  const pendingLines = purchase?.orders.filter((order) => order.status === 'active').flatMap((order) => order.lines)
    .filter((line) => line.storeDistributionStatus !== 'confirmed') || [];
  const [allocations, setAllocations] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchase) return;
    const next: Record<string, Record<string, string>> = {};
    for (const destination of pendingDestinations) {
      next[`destination:${destination.id}`] = Object.fromEntries(
        destination.stores.map((store) => [store.storeId, store.allocatedQuantity || '']),
      );
    }
    for (const line of pendingLines) {
      next[`line:${line.id}`] = Object.fromEntries(
        eligibleStoresForLine(purchase, line).map((store) => [
          store.storeId,
          line.stores.find((entry) => entry.storeId === store.storeId)?.quantity || '',
        ]),
      );
    }
    setAllocations(next);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.id]);

  const updateAllocation = (target: string, storeId: string, value: string) => {
    setAllocations((current) => ({
      ...current,
      [target]: { ...current[target], [storeId]: value },
    }));
  };
  const allocatedQuantity = (target: string): bigint | null => {
    try {
      return Object.values(allocations[target] || {}).reduce(
        (sum, value) => sum + (value.trim() ? quantityToThousandths(value) : 0n),
        0n,
      );
    } catch {
      return null;
    }
  };
  const isComplete = (target: string, quantity: string) => allocatedQuantity(target) === quantityToThousandths(quantity);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!purchase) return;
    const invalidDestination = pendingDestinations.find((destination) => !isComplete(`destination:${destination.id}`, destination.quantity));
    const invalidLine = pendingLines.find((line) => !isComplete(`line:${line.id}`, line.quantity));
    if (invalidDestination || invalidLine) {
      setError('Revise as quantidades: cada destino e registro deve ficar totalmente distribuido entre as lojas.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const destination of pendingDestinations) {
        const target = allocations[`destination:${destination.id}`] || {};
        await savePurchaseDestinationDistributionV2(destination.id, destination.stores.map((store) => ({
          storeId: store.storeId,
          quantity: target[store.storeId] || '0',
        })));
      }
      for (const line of pendingLines) {
        const target = allocations[`line:${line.id}`] || {};
        await savePurchaseOrderLineDistributionV2(line.id, eligibleStoresForLine(purchase, line).map((store) => ({
          storeId: store.storeId,
          quantity: target[store.storeId] || '0',
        })));
      }
      await onSaved();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, 'Nao foi possivel confirmar todas as lojas.'));
    } finally {
      setSaving(false);
    }
  };

  if (!purchase) return null;
  return <Modal className="purchase-v2-bulk-modal" open title={`Confirmar lojas · ${purchase.code}`} description="Revise todas as distribuicoes pendentes e confirme de uma unica vez. Nenhuma quantidade e criada automaticamente." onClose={onClose}>
    <form className="stack-form" onSubmit={submit}>
      {!pendingDestinations.length && !pendingLines.length && <EmptyState title="Todas as lojas confirmadas" detail="Nao existem distribuicoes pendentes nesta compra."/>}
      {pendingDestinations.map((destination) => {
        const target = `destination:${destination.id}`;
        const allocated = allocatedQuantity(target);
        return <section className="purchase-v2-bulk-section" key={target}>
          <header><div><strong>Distribuicao aprovada · {destination.label}</strong><span>{destination.state} · {destination.destinationCount} lojas</span></div><span className={`purchase-v2-pill ${isComplete(target, destination.quantity) ? 'is-ok' : 'is-warning'}`}>{allocated === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocated))}/${formatQuantityV2(destination.quantity)} ${destination.unit}`}</span></header>
          <div className="purchase-v2-allocation-grid">{destination.stores.map((store) => <label className="field" key={store.storeId}><span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span><input aria-label={`Quantidade aprovada ${destination.label} ${store.code}`} placeholder="Quantidade" value={allocations[target]?.[store.storeId] || ''} onChange={(event) => updateAllocation(target, store.storeId, event.target.value)}/></label>)}</div>
        </section>;
      })}
      {pendingLines.map((line) => {
        const target = `line:${line.id}`;
        const stores = eligibleStoresForLine(purchase, line);
        const allocated = allocatedQuantity(target);
        return <section className="purchase-v2-bulk-section" key={target}>
          <header><div><strong>Distribuicao realizada · {line.itemName}</strong><span>{line.destinationLabel || 'Destino definido por loja'} · registro de {formatQuantityV2(line.quantity)} {line.unit}</span></div><span className={`purchase-v2-pill ${isComplete(target, line.quantity) ? 'is-ok' : 'is-warning'}`}>{allocated === null ? 'Valor invalido' : `${formatQuantityV2(decimalFromThousandths(allocated))}/${formatQuantityV2(line.quantity)} ${line.unit}`}</span></header>
          <div className="purchase-v2-allocation-grid">{stores.map((store) => <label className="field" key={store.storeId}><span>{store.code} · {store.name}<small>{store.city}/{store.state}</small></span><input aria-label={`Quantidade realizada ${line.itemName} ${store.code}`} placeholder="Quantidade" value={allocations[target]?.[store.storeId] || ''} onChange={(event) => updateAllocation(target, store.storeId, event.target.value)}/></label>)}</div>
        </section>;
      })}
      {error && <div className="form-error">{error}</div>}
      {(pendingDestinations.length > 0 || pendingLines.length > 0) && <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}><CheckCheck size={17}/>{saving ? 'Confirmando...' : 'Confirmar todas as lojas'}</button></div>}
    </form>
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
  stores: Array<{
    storeId: string;
    code: string;
    name: string;
    city: string;
    state: string;
    approvedQuantity: string | null;
    approvedCents: bigint;
    realizedCents: bigint;
  }>;
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
        const storeCosts = purchaseDestinationStoreCosts(purchase, destination);
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
          stores: storeCosts.rows,
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
      stores: directStore ? [{
        storeId: directStore.storeId,
        code: directStore.code,
        name: directStore.name,
        city: directStore.city,
        state: directStore.state,
        approvedQuantity: item.quantityApproved,
        approvedCents: moneyToCents(item.approvedLineTotal),
        realizedCents: execution.realizedCents,
      }] : [],
    }];
  });

  return <Modal open title={`Resumo · ${purchase.code}`} description={`${purchase.quoteCode} · ${purchase.supplierName}`} onClose={onClose}>
    <div className="segmented purchase-v2-summary-tabs" role="group" aria-label="Visao do resumo de compras">
      <button type="button" className={view==='consolidated'?'is-active':''} onClick={()=>setView('consolidated')}>Consolidado</button>
      <button type="button" className={view==='destination'?'is-active':''} onClick={()=>setView('destination')}>Prospector/UF</button>
      <button type="button" className={view==='store'?'is-active':''} onClick={()=>setView('store')}>Loja</button>
      <button type="button" className={view==='item'?'is-active':''} onClick={()=>setView('item')}>Item</button>
    </div>

    {view==='consolidated' && <>
      <div className="purchase-v2-summary-kpis">
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
        <div><span>Pagamentos ativos</span><strong>{purchase.payments.filter((payment) => payment.status !== 'cancelled').length}</strong></div>
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
          <td>{row.stores.length ? <details className="purchase-v2-destination-stores"><summary>{row.storeCount} lojas</summary><div>{row.stores.map((store) => <span key={store.storeId}><strong>{store.code}</strong><small>{store.name} · {store.city}/{store.state}</small><em>{store.approvedQuantity === null ? 'Qtd. pendente' : `${formatQuantityV2(store.approvedQuantity)} ${row.unit}`} · aprovado {formatBRL(store.approvedCents)} · realizado {formatBRL(store.realizedCents)}</em></span>)}</div></details> : row.storeCount}</td>
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

type PortfolioView = 'consolidated' | 'purchases' | 'destination' | 'store';

function PurchasesPortfolioModal({
  purchases,
  open,
  onClose,
}: {
  purchases: PurchaseV2[];
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<PortfolioView>('consolidated');
  useEffect(() => { if (open) setView('consolidated'); }, [open]);
  if (!open) return null;
  const portfolio = purchasePortfolioSummary(purchases);
  const storeRows = purchasePortfolioStoreRows(purchases);
  const destinationRows = purchasePortfolioDestinationRows(purchases);
  const statusEntries: PurchaseStatus[] = ['approved', 'in_progress', 'partially_purchased', 'purchased', 'returned', 'cancelled'];
  const statusOverview = statusEntries.map((status) => ({ status, count: portfolio.statusCounts[status] }));

  return <Modal className="purchase-v2-portfolio-modal" open title="Resumo de compras" description={`${purchases.length} compras no filtro atual · valores conhecidos e distribuicoes confirmadas`} onClose={onClose}>
    <div className="segmented purchase-v2-portfolio-tabs" role="group" aria-label="Visao do resumo geral de compras">
      <button type="button" className={view === 'consolidated' ? 'is-active' : ''} onClick={() => setView('consolidated')}>Geral</button>
      <button type="button" className={view === 'purchases' ? 'is-active' : ''} onClick={() => setView('purchases')}>Compras</button>
      <button type="button" className={view === 'store' ? 'is-active' : ''} onClick={() => setView('store')}>Lojas</button>
      <button type="button" className={view === 'destination' ? 'is-active' : ''} onClick={() => setView('destination')}>Prospectores/UF</button>
    </div>

    {view === 'consolidated' && <div className="stack-form">
      <div className="summary-kpis purchase-v2-portfolio-kpis">
        <div><span>Aprovado</span><strong>{formatBRL(portfolio.approvedCents)}</strong></div>
        <div><span>Realizado conhecido</span><strong>{formatBRL(portfolio.realizedCents)}</strong></div>
        <div><span>Saldo conhecido</span><strong>{formatBRL(portfolio.approvedCents - portfolio.realizedCents)}</strong></div>
        <div><span>Compras</span><strong>{portfolio.purchaseCount}</strong></div>
      </div>
      <div className="purchase-v2-status-overview">{statusOverview.map((entry) => <div key={entry.status}><StatusBadge status={entry.status}/><strong>{entry.count}</strong></div>)}</div>
      <div className="purchase-v2-summary-grid">
        <div><span>Itens concluidos</span><strong>{portfolio.completedItems}/{portfolio.items}</strong></div>
        <div><span>Pago em compras vinculadas</span><strong>{formatBRL(portfolio.linkedPaidCents)}</strong></div>
        <div><span>Pago sem compra vinculada</span><strong>{formatBRL(portfolio.unlinkedPaidCents)}</strong></div>
        <div><span>Pagamentos previstos</span><strong>{portfolio.plannedPayments} · {formatBRL(portfolio.plannedCents)}</strong></div>
        <div><span>Documentos de Compra</span><strong>{portfolio.documents}</strong></div>
        <div><span>Destinos a distribuir</span><strong>{portfolio.pendingDestinationDistributions}</strong></div>
        <div><span>Registros a distribuir</span><strong>{portfolio.pendingLineDistributions}</strong></div>
        <div><span>Fretes pendentes</span><strong>{portfolio.pendingShippingLines}</strong></div>
        <div><span>Aprovado nao alocado</span><strong>{formatBRL(portfolio.approvedUnallocatedCents)}</strong></div>
        <div><span>Realizado nao alocado</span><strong>{formatBRL(portfolio.realizedUnallocatedCents)}</strong></div>
      </div>
    </div>}

    {view === 'purchases' && <div className="table-scroll"><table className="data-table"><thead><tr><th>Compra</th><th>Fornecedor</th><th>Status</th><th>Aprovado</th><th>Realizado</th><th>Saldo</th><th>Itens</th><th>Lojas pendentes</th><th>Pagamentos</th><th>Arquivos</th></tr></thead><tbody>{purchases.map((purchase) => {const summary = purchaseExecutionSummary(purchase); return <tr key={purchase.id}><td><strong>{purchase.code}</strong><small>{purchase.quoteCode}</small></td><td>{purchase.supplierName}</td><td><StatusBadge status={purchase.status}/></td><td>{formatBRL(summary.approvedCents)}</td><td>{formatBRL(summary.realizedCents)}</td><td>{formatBRL(summary.balanceCents)}</td><td>{summary.completedItems}/{purchase.items.length}</td><td>{summary.pendingDestinationDistributions + summary.pendingLineDistributions}</td><td>{purchase.payments.filter((payment) => payment.status !== 'cancelled').length}</td><td>{purchase.attachments.length}</td></tr>;})}</tbody></table></div>}

    {view === 'store' && <div className="stack-form">
      {storeRows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Loja</th><th>UF</th><th>Compras</th><th>Aprovado alocado</th><th>Realizado alocado</th><th>Saldo</th></tr></thead><tbody>{storeRows.map((row) => <tr key={row.storeId}><td><strong>{row.code}</strong><small>{row.name}</small></td><td>{row.state}</td><td>{row.purchaseCount}</td><td>{formatBRL(row.approvedCents)}</td><td>{formatBRL(row.realizedCents)}</td><td>{formatBRL(row.approvedCents - row.realizedCents)}</td></tr>)}</tbody></table></div> : <EmptyState title="Sem lojas no filtro" detail="Ajuste os filtros para visualizar os valores por loja."/>}
      <div className="purchase-v2-unallocated"><div><span>Aprovado sem loja confirmada</span><strong>{formatBRL(portfolio.approvedUnallocatedCents)}</strong></div><div><span>Realizado sem loja confirmada</span><strong>{formatBRL(portfolio.realizedUnallocatedCents)}</strong></div></div>
    </div>}

    {view === 'destination' && (destinationRows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Prospector / destino</th><th>UF</th><th>Compras</th><th>Itens</th><th>Lojas e custos</th><th>Aprovado nas lojas</th><th>Realizado nas lojas</th><th>Sem loja definida</th><th>Pendencias</th></tr></thead><tbody>{destinationRows.map((row) => <tr key={row.key}><td><strong>{row.label}</strong><small>Somatorio das lojas abaixo</small></td><td>{row.state}</td><td>{row.purchaseCount}</td><td>{row.itemCount}</td><td>{row.stores.length ? <details className="purchase-v2-destination-stores"><summary>{row.storeCount} lojas</summary><div>{row.stores.map((store) => <span key={store.storeId}><strong>{store.code}</strong><small>{store.name} · {store.city}/{store.state}</small><em>Aprovado {formatBRL(store.approvedCents)} · realizado {formatBRL(store.realizedCents)}</em></span>)}</div></details> : row.storeCount}</td><td>{formatBRL(row.approvedCents)}</td><td>{formatBRL(row.realizedCents)}</td><td><strong>{formatBRL(row.approvedUnallocatedCents + row.realizedUnallocatedCents)}</strong><small>Aprovado {formatBRL(row.approvedUnallocatedCents)} · realizado {formatBRL(row.realizedUnallocatedCents)}</small></td><td>{row.pendingDistributions} distribuicoes · {row.pendingShippingLines} fretes</td></tr>)}</tbody></table></div> : <EmptyState title="Sem prospectores/UF no filtro" detail="As compras com destinos de frete aparecerao agrupadas aqui."/>)}
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
  const [itemFilterIds, setItemFilterIds] = useState<string[]>([]);
  const [pendingFilter, setPendingFilter] = useState('');
  const [management, setManagement] = useState<{purchase: PurchaseV2; tab: PurchaseManagementTab; itemId?: string} | null>(null);
  const [historyPurchase, setHistoryPurchase] = useState<PurchaseV2 | null>(null);
  const [distribution, setDistribution] = useState<PurchaseDestinationV2 | null>(null);
  const [lineDistribution, setLineDistribution] = useState<{purchase: PurchaseV2; line: PurchaseOrderLineV2} | null>(null);
  const [bulkPurchase, setBulkPurchase] = useState<PurchaseV2 | null>(null);
  const [summaryPurchase, setSummaryPurchase] = useState<PurchaseV2 | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPurchases(await listSupplyPurchasesV2()); }
    catch { setError('Nao foi possivel carregar as compras.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const states = useMemo(() => [...new Set(purchases.flatMap((purchase) => [...purchase.stores.map((store)=>store.state), ...purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.state))]).filter(Boolean))].sort(), [purchases]);
  const destinationLabels = useMemo(() => [...new Set(purchases.flatMap((purchase)=>purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.label))))].sort((a,b)=>a.localeCompare(b,'pt-BR')), [purchases]);
  const purchaseItemOptions = useMemo<ItemFilterOption[]>(() => {
    const options = new Map<string, ItemFilterOption>();
    purchases.forEach((purchase) => purchase.items.forEach((item) => {
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
  }, [purchases]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return purchases.filter((purchase) => {
      const summary = purchaseExecutionSummary(purchase);
      const text = [purchase.code,purchase.quoteCode,purchase.supplierName,purchase.originCity,purchase.originState,...purchase.items.flatMap((item)=>[item.itemName,item.itemCode,item.offeredBrandModel,item.productUrl,...item.destinations.map((destination)=>destination.label)])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      if (search && !text.includes(search)) return false;
      if (status && purchase.status !== status) return false;
      if (!matchesSelectedItems(purchase.items.map((item) => item.supplyItemId), itemFilterIds)) return false;
      if (stateFilter && !purchase.stores.some((store)=>store.state===stateFilter) && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.state===stateFilter))) return false;
      if (destinationFilter && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.label===destinationFilter))) return false;
      if (pendingFilter==='destination' && summary.pendingDestinationDistributions===0) return false;
      if (pendingFilter==='line' && summary.pendingLineDistributions===0) return false;
      if (pendingFilter==='shipping' && summary.pendingShippingLines===0) return false;
      if (pendingFilter==='documents' && purchase.attachments.length>0) return false;
      return true;
    });
  }, [purchases,query,status,stateFilter,destinationFilter,itemFilterIds,pendingFilter]);

  const allDetailsVisible =
    filtered.length > 0 && filtered.every((purchase) => expandedIds.has(purchase.id));

  const togglePurchaseDetails = (purchaseId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  };

  const toggleAllDetails = () => {
    setExpandedIds(allDetailsVisible ? new Set() : new Set(filtered.map((purchase) => purchase.id)));
  };

  const returnToQuote = async (purchase: PurchaseV2) => {
    if (!window.confirm(`Devolver ${purchase.code} para cotacao? O backend so permite isso quando nao ha execucao/documentos impeditivos.`)) return;
    setReturningId(purchase.id);
    try { await returnPurchaseToQuoteV2(purchase.id); await load(); }
    catch (failure) { window.alert(errorMessage(failure,'Nao foi possivel devolver para cotacao.')); }
    finally { setReturningId(null); }
  };

  return <section className="page-stack purchase-v2-page">
    <header className="page-header"><div><span className="eyebrow">Suprimentos</span><h2>Compras</h2><p>Execucao do aprovado: registros de compra, pagamentos, historico, destinos, distribuicao fisica e documentos.</p></div><div className="page-heading__actions"><button className="button button--secondary" disabled={!filtered.length} onClick={()=>setPortfolioOpen(true)}><LayoutDashboard size={17}/>Resumo de compras</button><button className="button button--secondary" disabled={!filtered.length} onClick={toggleAllDetails}><ChevronsUpDown size={17}/>{allDetailsVisible ? 'Recolher todas as compras' : 'Expandir todas as compras'}</button><button className="button button--secondary" onClick={()=>void load()}><RefreshCcw size={17}/>Atualizar</button></div></header>
    <div className="filter-bar purchase-v2-filters"><label className="search-field"><Search size={18}/><input placeholder="Buscar compra, cotacao, fornecedor, item ou destino" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><ItemMultiFilter label="Filtrar itens em compras" options={purchaseItemOptions} selectedIds={itemFilterIds} onChange={setItemFilterIds}/><select aria-label="Status da compra" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="">Todos os status</option><option value="approved">Aprovada</option><option value="in_progress">Em andamento</option><option value="partially_purchased">Parcialmente comprada</option><option value="purchased">Comprada</option><option value="returned">Devolvida</option><option value="cancelled">Cancelada</option></select><select aria-label="UF" value={stateFilter} onChange={(event)=>setStateFilter(event.target.value)}><option value="">Todas as UFs</option>{states.map((state)=><option key={state} value={state}>{state}</option>)}</select><select aria-label="Prospector ou destino" value={destinationFilter} onChange={(event)=>setDestinationFilter(event.target.value)}><option value="">Todos os destinos</option>{destinationLabels.map((label)=><option key={label} value={label}>{label}</option>)}</select><select aria-label="Pendencia operacional" value={pendingFilter} onChange={(event)=>setPendingFilter(event.target.value)}><option value="">Todas as pendencias</option><option value="destination">Distribuicao mestre pendente</option><option value="line">Distribuicao realizada pendente</option><option value="shipping">Frete realizado pendente</option><option value="documents">Sem documento de Compra</option></select></div>
    {loading ? <InlineLoading label="Carregando compras"/> : error ? <ErrorState message={error} onRetry={()=>void load()}/> : filtered.length ? <div className="purchase-v2-list">{filtered.map((purchase)=>{const summary=purchaseExecutionSummary(purchase);const active=purchase.orders.filter((order)=>order.status==='active');const pendingStores=summary.pendingDestinationDistributions+summary.pendingLineDistributions;const expanded=expandedIds.has(purchase.id);const operationSummaries=active.map((order)=>({financial:purchaseOrderFinancialSummary(purchase,order),costs:purchaseOrderStoreCosts(order)}));const linkedPaid=operationSummaries.reduce((sum,entry)=>sum+entry.financial.paidCents,0n);const incompleteOperations=operationSummaries.filter((entry)=>!entry.financial.isReconciled||!entry.costs.isConfirmed).length;const unlinkedPayments=purchaseUnlinkedPayments(purchase).payments.filter((payment)=>payment.status!=='cancelled').length;const cardTone=purchase.status==='purchased'&&incompleteOperations===0?'is-realized':['approved','in_progress','partially_purchased','purchased'].includes(purchase.status)?'is-pending':'';return <article key={purchase.id} className={`purchase-v2-card purchase-v2-card--${purchase.status} ${cardTone}`}>
      <header className="purchase-v2-card__header"><div className="supply-identity"><small>{purchase.code}</small><strong>{purchase.quoteCode}</strong></div><div><strong>{purchase.supplierName}</strong><small>{channelLabel(purchase)}</small></div><div title={purchase.stores.map((store)=>`${store.code} - ${store.city}/${store.state}${store.address?` - ${store.address}`:''}`).join('\n')}><strong>{purchaseStoresLabel(purchase)}</strong><small>{purchase.stores.length===1?`${purchase.stores[0].city}/${purchase.stores[0].state}`:'Passe para ver as lojas'}</small></div><div><strong>{formatBRL(summary.approvedCents)}</strong><small>Comprado {formatBRL(summary.realizedCents)} · pago vinculado {formatBRL(linkedPaid)} · saldo para comprar {formatBRL(summary.balanceCents)}</small></div><div className="purchase-v2-status-spotlight"><small>Status</small><StatusBadge status={purchase.status}/>{incompleteOperations>0&&<span className="purchase-v2-pill is-warning">{incompleteOperations} operacoes incompletas</span>}</div><div className="row-actions purchase-v2-card-actions"><button type="button" aria-label={`Gerenciar compra ${purchase.code}`} className="button button--primary button--small" onClick={()=>setManagement({purchase,tab:'purchase'})}><PackageCheck size={16}/>Gerenciar compra</button>{canEdit&&pendingStores>0&&purchase.status!=='returned'&&purchase.status!=='cancelled'&&<button type="button" aria-label={`Confirmar lojas ${purchase.code} (${pendingStores})`} className="button button--secondary button--small" onClick={()=>setBulkPurchase(purchase)}><CheckCheck size={16}/>Confirmar lojas ({pendingStores})</button>}<IconButton label={expanded ? `Recolher ${purchase.code}` : `Detalhar ${purchase.code}`} onClick={()=>togglePurchaseDetails(purchase.id)}>{expanded ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}</IconButton><IconButton label={`Resumo ${purchase.code}`} onClick={()=>setSummaryPurchase(purchase)}><ShoppingCart size={17}/></IconButton><IconButton label={`Historico ${purchase.code}`} onClick={()=>setHistoryPurchase(purchase)}><History size={17}/></IconButton><Link className="icon-button" aria-label={`Abrir cotacao ${purchase.quoteCode}`} title="Abrir cotacao de origem" to={`/suprimentos/cotacoes?quote=${purchase.quoteId}`}><ArrowLeft size={17}/></Link>{canApprove && purchase.status!=='returned' && purchase.status!=='cancelled' && <IconButton label={`Voltar ${purchase.code} para cotacao`} disabled={returningId===purchase.id} onClick={()=>void returnToQuote(purchase)}><RefreshCcw size={17}/></IconButton>}</div></header>
      {expanded && <><div className="purchase-v2-indicators"><span>{summary.completedItems}/{purchase.items.length} itens comprados</span><span>{active.length} compras realizadas</span>{summary.pendingDestinationDistributions>0 && <span className="is-warning">{summary.pendingDestinationDistributions} destinos para distribuir</span>}{summary.pendingLineDistributions>0 && <span className="is-warning">{summary.pendingLineDistributions} compras sem custo por loja</span>}{summary.pendingShippingLines>0 && <span className="is-warning">{summary.pendingShippingLines} fretes pendentes</span>}{incompleteOperations>0&&<span className="is-warning">{incompleteOperations} operacoes sem conciliacao completa</span>}{unlinkedPayments>0&&<span className="is-warning">{unlinkedPayments} pagamentos sem compra vinculada</span>}<span>{purchase.attachments.length} arquivos</span></div>
      <div className="purchase-v2-items">{purchase.items.map((item)=>{const execution=itemExecution(item,purchase);const itemLines=active.flatMap((order)=>order.lines.map((line)=>({order,line}))).filter(({line})=>line.purchaseItemId===item.id);return <section key={item.id} className="purchase-v2-item"><header><div><strong>{item.itemName}</strong><small>{item.itemCode}{item.itemCategory?` · ${item.itemCategory}`:''}{item.itemArea?` · ${item.itemArea}`:''}</small>{item.offeredBrandModel && <small>Ofertado: {item.offeredBrandModel}</small>}{item.quoteItemNotes && <small>Obs. da cotacao: {item.quoteItemNotes}</small>}</div><div className="purchase-v2-item__numbers"><span>Aprovado <strong>{formatQuantityV2(item.quantityApproved)} {item.unit}</strong></span><span>Comprado <strong>{formatQuantityV2(decimalFromThousandths(execution.purchasedQuantity))} {item.unit}</strong></span><span>Falta <strong>{formatQuantityV2(decimalFromThousandths(execution.missingQuantity))} {item.unit}</strong></span><span>Realizado <strong>{formatBRL(execution.realizedCents)}</strong></span></div><div>{canEdit && execution.missingQuantity>0n && purchase.status!=='returned' && purchase.status!=='cancelled' && <button type="button" className="button button--primary button--small" onClick={()=>setManagement({purchase,tab:'purchase',itemId:item.id})}><PackageCheck size={15}/>Registrar compra</button>}</div></header>
        {item.destinations.length ? <div className="purchase-v2-destinations">{item.destinations.map((destination)=>{const costs=purchaseDestinationStoreCosts(purchase,destination);return <div key={destination.id} className="purchase-v2-destination"><div><MapPinned size={16}/><span><strong>{destination.label}</strong><small>{destination.state} · {formatQuantityV2(destination.quantity)} {destination.unit} · {quotedShippingLabel(destination)}{destination.quotedDeliveryDays!==null?` · ${destination.quotedDeliveryDays} dias`:''}</small></span></div><span className={`purchase-v2-pill ${destination.distributionStatus==='confirmed'?'is-ok':'is-warning'}`}>{destination.destinationType==='store'?'Direto loja':destination.distributionStatus==='confirmed'?'Distribuicao confirmada':'Distribuicao pendente'}</span>{canEdit && destination.destinationType==='profile' && <button type="button" className="button button--secondary button--small" onClick={()=>setDistribution(destination)}><MapPinned size={15}/>{destination.distributionStatus==='confirmed'?'Revisar lojas':destination.stores.length===1?'Confirmar loja':'Distribuir entre lojas'}</button>}<div className="purchase-v2-destination-store-breakdown"><strong>Lojas deste destino</strong>{costs.rows.map((store)=><span key={store.storeId}><span><b>{store.code}</b><small>{store.name} · {store.city}/{store.state}</small></span><em>{store.approvedQuantity===null?'Qtd. pendente':`${formatQuantityV2(store.approvedQuantity)} ${destination.unit}`} · aprovado {formatBRL(store.approvedCents)} · realizado {formatBRL(store.realizedCents)}</em></span>)}{costs.approvedUnallocatedCents!==0n&&<span className="is-warning">Aprovado sem loja: {formatBRL(costs.approvedUnallocatedCents)}</span>}{costs.realizedUnallocatedCents!==0n&&<span className="is-warning">Realizado sem loja: {formatBRL(costs.realizedUnallocatedCents)}</span>}</div></div>})}</div> : <div className="purchase-v2-hint"><strong>Item sem destinos de frete</strong><span>A compra exigira a selecao das lojas antes de ser salva.</span></div>}
        {itemLines.length>0 && <div className="purchase-v2-executions"><h5>Registros realizados</h5>{itemLines.map(({order,line})=><div key={line.id}><div><Truck size={15}/><span><strong>{formatDate(order.purchasedOn)} · {formatQuantityV2(line.quantity)} {line.unit} · {lineTotalCents(line)===null?'Total pendente':formatBRL(lineTotalCents(line)!)}</strong><small>{line.destinationLabel || 'Sem destino'} · {order.supplierOrderRef || 'sem pedido'} · previsao {formatDate(line.expectedDeliveryDate)}</small></span></div><span className={`purchase-v2-pill ${line.storeDistributionStatus==='confirmed'?'is-ok':'is-warning'}`}>{line.storeDistributionStatus==='confirmed'?'Lojas confirmadas':'Lojas pendentes'}</span>{canEdit && line.storeDistributionStatus!=='confirmed' && <button type="button" className="button button--secondary button--small" onClick={()=>setLineDistribution({purchase,line})}><MapPinned size={15}/>Distribuir registro</button>}</div>)}</div>}
      </section>})}</div></>}
    </article>})}</div> : <EmptyState title="Nenhuma compra" detail="As cotacoes aprovadas para compra aparecerao aqui."/>}

    <PurchaseManagementModal purchase={management ? purchases.find((entry)=>entry.id===management.purchase.id)||management.purchase : null} initialTab={management?.tab||'purchase'} initialItemId={management?.itemId} onClose={()=>setManagement(null)} onSaved={load} canEdit={canEdit}/>
    <HistoryModal purchase={historyPurchase ? purchases.find((entry)=>entry.id===historyPurchase.id)||historyPurchase : null} onClose={()=>setHistoryPurchase(null)} onSaved={load} canEdit={canEdit}/>
    <DestinationDistributionModal destination={distribution ? purchases.flatMap((purchase)=>purchase.items.flatMap((item)=>item.destinations)).find((entry)=>entry.id===distribution.id)||distribution : null} onClose={()=>setDistribution(null)} onSaved={load}/>
    <LineDistributionModal purchase={lineDistribution ? purchases.find((entry)=>entry.id===lineDistribution.purchase.id)||lineDistribution.purchase : null} line={lineDistribution ? (purchases.find((entry)=>entry.id===lineDistribution.purchase.id)?.orders.flatMap((order)=>order.lines).find((entry)=>entry.id===lineDistribution.line.id)||lineDistribution.line) : null} onClose={()=>setLineDistribution(null)} onSaved={load}/>
    <BulkStoreConfirmationModal purchase={bulkPurchase ? purchases.find((entry)=>entry.id===bulkPurchase.id)||bulkPurchase : null} onClose={()=>setBulkPurchase(null)} onSaved={load}/>
    <SummaryModal purchase={summaryPurchase ? purchases.find((entry)=>entry.id===summaryPurchase.id)||summaryPurchase : null} onClose={()=>setSummaryPurchase(null)}/>
    <PurchasesPortfolioModal purchases={filtered} open={portfolioOpen} onClose={()=>setPortfolioOpen(false)}/>
  </section>;
}
