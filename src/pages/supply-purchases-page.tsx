import {
  ArrowLeft,
  CreditCard,
  Edit3,
  FileText,
  Paperclip,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, IconButton, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  createPurchaseAttachmentSignedUrl,
  deletePurchaseAttachment,
  listSupplyPurchases,
  returnPurchaseToQuote,
  savePurchaseItem,
  savePurchasePayment,
  setPurchaseReimbursementStatus,
  uploadPurchaseAttachment,
  validatePurchaseAttachment,
  type PaymentMethod,
  type Purchase,
  type PurchaseAttachment,
  type PurchaseDocumentType,
  type PurchaseItem,
  type ReimbursementStatus,
} from '../data/purchases/purchases-repository';
import { formatBRL, moneyToCents, quantityToThousandths } from '../domain/supply-calculations';

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

const REIMBURSEMENT_LABELS: Record<ReimbursementStatus, string> = {
  not_applicable: 'Nao se aplica',
  documents_pending: 'Pendente de documentos',
  ready: 'Pronto para solicitar',
  requested: 'Reembolso solicitado',
  reimbursed: 'Reembolsado',
};

const DOCUMENT_LABELS: Record<PurchaseDocumentType, string> = {
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  payment_proof: 'Comprovante de pagamento',
  boleto: 'Boleto',
  purchase_order: 'Pedido / ordem de compra',
  reimbursement: 'Documento de reembolso',
  photo: 'Foto / evidencia',
  other: 'Outro',
};

function formatDate(value: string | null): string {
  if (!value) return 'Nao informada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`),
  );
}

function formatQuantity(value: string): string {
  const thousandths = quantityToThousandths(value);
  const whole = thousandths / 1000n;
  const fraction = String(thousandths % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()},${fraction}` : whole.toString();
}

function actualLineCents(item: PurchaseItem): bigint {
  const quantity = quantityToThousandths(item.purchasedQuantity);
  const unitPrice = moneyToCents(item.actualUnitPrice || '0');
  const subtotal = (quantity * unitPrice + 500n) / 1000n;
  return (
    subtotal -
    moneyToCents(item.actualDiscountAmount || '0') +
    moneyToCents(item.actualShippingAmount || '0') +
    moneyToCents(item.actualOtherCosts || '0')
  );
}

function purchaseTotals(purchase: Purchase) {
  const purchasedCents = purchase.items.reduce((sum, item) => sum + actualLineCents(item), 0n);
  const approvedCents = moneyToCents(purchase.approvedTotal);
  const completed = purchase.items.filter(
    (item) => quantityToThousandths(item.purchasedQuantity) >= quantityToThousandths(item.quantityApproved),
  ).length;
  const partial = purchase.items.filter((item) => {
    const purchased = quantityToThousandths(item.purchasedQuantity);
    return purchased > 0n && purchased < quantityToThousandths(item.quantityApproved);
  }).length;
  return {
    approvedCents,
    purchasedCents,
    remainingCents: approvedCents - purchasedCents,
    completed,
    partial,
  };
}

function storesLabel(purchase: Purchase): string {
  if (purchase.stores.length === 1) return purchase.stores[0].code;
  return `${purchase.stores.length} lojas`;
}

type SummaryMode = 'all' | 'purchased' | 'missing';

function PurchaseSummary({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const [mode, setMode] = useState<SummaryMode>('all');
  if (!purchase) return null;
  const totals = purchaseTotals(purchase);
  const items = purchase.items.filter((item) => {
    const purchased = quantityToThousandths(item.purchasedQuantity);
    const approved = quantityToThousandths(item.quantityApproved);
    if (mode === 'purchased') return purchased > 0n;
    if (mode === 'missing') return purchased < approved;
    return true;
  });

  return (
    <Modal
      open
      title={`Resumo ${purchase.code}`}
      description={`Origem ${purchase.quoteCode} · ${purchase.supplierName}`}
      onClose={onClose}
    >
      <div className="summary-kpis">
        <div><span>Aprovado</span><strong>{formatBRL(totals.approvedCents)}</strong></div>
        <div><span>Comprado</span><strong>{formatBRL(totals.purchasedCents)}</strong></div>
        <div><span>Saldo previsto</span><strong>{formatBRL(totals.remainingCents)}</strong></div>
        <div><span>Itens concluidos</span><strong>{totals.completed}/{purchase.items.length}</strong></div>
      </div>
      <div className="segmented" role="group" aria-label="Filtro do resumo de compras">
        <button type="button" className={mode === 'all' ? 'is-active' : ''} onClick={() => setMode('all')}>Todos</button>
        <button type="button" className={mode === 'purchased' ? 'is-active' : ''} onClick={() => setMode('purchased')}>Comprados</button>
        <button type="button" className={mode === 'missing' ? 'is-active' : ''} onClick={() => setMode('missing')}>Falta comprar</button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Item</th><th>Loja</th><th>Aprovado</th><th>Comprado</th><th>Falta</th><th>Realizado</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const approved = quantityToThousandths(item.quantityApproved);
              const purchased = quantityToThousandths(item.purchasedQuantity);
              const missing = approved - purchased;
              return (
                <tr key={item.id}>
                  <td><strong>{item.itemName}</strong><small>{item.itemCode}</small></td>
                  <td>{item.storeCode || storesLabel(purchase)}</td>
                  <td>{formatQuantity(item.quantityApproved)} {item.unit}</td>
                  <td>{formatQuantity(item.purchasedQuantity)} {item.unit}</td>
                  <td>{formatQuantity((Number(missing) / 1000).toString())} {item.unit}</td>
                  <td>{formatBRL(actualLineCents(item))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function PurchaseItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: PurchaseItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setQuantity(item.purchasedQuantity);
    setUnitPrice(item.actualUnitPrice);
    setDiscount(item.actualDiscountAmount);
    setShipping(item.actualShippingAmount);
    setOtherCosts(item.actualOtherCosts);
    setNotes(item.notes || '');
    setError(null);
  }, [item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    try {
      if (quantityToThousandths(quantity) > quantityToThousandths(item.quantityApproved)) {
        setError('A quantidade comprada nao pode superar a quantidade aprovada.');
        return;
      }
      moneyToCents(unitPrice);
      moneyToCents(discount || '0');
      moneyToCents(shipping || '0');
      moneyToCents(otherCosts || '0');
    } catch {
      setError('Revise os valores informados. Use, por exemplo, 49,80 ou 1.394,40.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePurchaseItem({
        id: item.id,
        purchasedQuantity: quantity,
        actualUnitPrice: unitPrice,
        actualDiscountAmount: discount,
        actualShippingAmount: shipping,
        actualOtherCosts: otherCosts,
        notes,
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Nao foi possivel salvar a compra do item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(item)}
      title={item ? `Registrar compra · ${item.itemName}` : 'Registrar compra'}
      description={item ? `Aprovado: ${formatQuantity(item.quantityApproved)} ${item.unit}` : undefined}
      onClose={onClose}
    >
      {item && (
        <form className="stack-form" onSubmit={submit}>
          <div className="form-grid form-grid--three">
            <label className="field">Quantidade comprada<input value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
            <label className="field">Valor unitario realizado<input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required /></label>
            <label className="field">Desconto<input value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
            <label className="field">Frete<input value={shipping} onChange={(e) => setShipping(e.target.value)} /></label>
            <label className="field">Outros custos<input value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} /></label>
          </div>
          <label className="field">Observacoes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar realizado'}</button></div>
        </form>
      )}
    </Modal>
  );
}

function PaymentModal({
  purchase,
  onClose,
  onSaved,
}: {
  purchase: Purchase | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [entry, setEntry] = useState('');
  const [installments, setInstallments] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [status, setStatus] = useState<'planned' | 'paid'>('planned');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchase) return;
    setMethod(purchase.paymentMethodSnapshot || 'pix');
    setAmount(purchase.approvedTotal);
    setEntry(purchase.entryAmountSnapshot || '');
    setInstallments(purchase.installmentCountSnapshot ? String(purchase.installmentCountSnapshot) : '');
    setNotes(purchase.paymentNotesSnapshot || '');
    setSource('');
    setFirstDueDate('');
    setStatus('planned');
    setError(null);
  }, [purchase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!purchase) return;
    try {
      if (moneyToCents(amount) <= 0n) throw new Error();
      if (entry && moneyToCents(entry) > moneyToCents(amount)) throw new Error();
    } catch {
      setError('Revise os valores do pagamento.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePurchasePayment({
        id: null,
        purchaseId: purchase.id,
        paymentMethod: method,
        sourceLabel: source,
        amount,
        entryAmount: entry,
        installmentCount: installments,
        firstDueDate,
        status,
        paidAt: status === 'paid' ? new Date().toISOString() : '',
        notes,
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Nao foi possivel registrar o pagamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(purchase)} title={purchase ? `Pagamento · ${purchase.code}` : 'Pagamento'} description="Nao informe numero completo do cartao nem CVV. Use apenas uma identificacao segura, como Cartao Corporativo final 1234." onClose={onClose}>
      {purchase && (
        <form className="stack-form" onSubmit={submit}>
          <div className="form-grid form-grid--three">
            <label className="field">Forma de pagamento<select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">Origem / cartao utilizado<input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex.: Cartao Corporativo final 1234" /></label>
            <label className="field">Valor<input value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
            <label className="field">Entrada<input value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
            <label className="field">Parcelas<input inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="field">Primeiro vencimento<input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} /></label>
            <label className="field">Situacao<select value={status} onChange={(e) => setStatus(e.target.value as 'planned' | 'paid')}><option value="planned">Previsto</option><option value="paid">Pago</option></select></label>
          </div>
          <label className="field">Observacoes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? 'Salvando...' : 'Registrar pagamento'}</button></div>
        </form>
      )}
    </Modal>
  );
}

function DocumentsModal({ purchase, onClose, onSaved }: { purchase: Purchase | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [documentType, setDocumentType] = useState<PurchaseDocumentType>('invoice');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (!purchase) return;
    const validation = validatePurchaseAttachment(file);
    if (validation) {
      setError(validation);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadPurchaseAttachment(purchase.id, file, description, documentType);
      setDescription('');
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha no envio. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  const open = async (attachment: PurchaseAttachment) => {
    setOpeningId(attachment.id);
    try {
      const url = await createPurchaseAttachmentSignedUrl(attachment.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Nao foi possivel abrir o documento.');
    } finally {
      setOpeningId(null);
    }
  };

  const remove = async (attachment: PurchaseAttachment) => {
    try {
      await deletePurchaseAttachment(attachment.id);
      await onSaved();
    } catch {
      setError('Nao foi possivel remover o documento.');
    }
  };

  return (
    <Modal open={Boolean(purchase)} title={purchase ? `Documentos · ${purchase.code}` : 'Documentos'} description="O arquivo so e considerado anexado quando aparecer na lista abaixo." onClose={onClose}>
      {purchase && (
        <div className="stack-form">
          <div className="form-grid form-grid--three">
            <label className="field">Tipo do documento<select value={documentType} onChange={(e) => setDocumentType(e.target.value as PurchaseDocumentType)}>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">Descricao<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className="file-drop"><Paperclip size={20} /><span><strong>{uploading ? 'Enviando...' : 'Selecionar e enviar'}</strong><small>O envio inicia automaticamente</small></span><input type="file" disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ''; }} /></label>
          </div>
          {error && <div className="form-error">{error}</div>}
          {purchase.attachments.length ? (
            <div className="quote-attachment-list">
              {purchase.attachments.map((attachment) => (
                <article key={attachment.id}>
                  <FileText size={18} />
                  <div><strong>{attachment.originalName}</strong><span>{DOCUMENT_LABELS[attachment.documentType]} · Salvo ✓</span></div>
                  <span>{new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span>
                  <button type="button" className="button button--secondary button--small" disabled={openingId === attachment.id} onClick={() => void open(attachment)}>Abrir</button>
                  <IconButton label={`Remover ${attachment.originalName}`} onClick={() => void remove(attachment)}><Trash2 size={16} /></IconButton>
                </article>
              ))}
            </div>
          ) : <EmptyState title="Nenhum documento" detail="Notas, recibos e comprovantes salvos aparecerao aqui." />}
        </div>
      )}
    </Modal>
  );
}

export function SupplyPurchasesPage() {
  const { can } = useSession();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<Purchase | null>(null);
  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null);
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);
  const [documentsPurchase, setDocumentsPurchase] = useState<Purchase | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPurchases(await listSupplyPurchases());
    } catch {
      setError('Nao foi possivel carregar as compras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return purchases.filter((purchase) =>
      (!search || [purchase.code, purchase.quoteCode, purchase.supplierName, ...purchase.items.map((item) => item.itemName)].join(' ').toLocaleLowerCase('pt-BR').includes(search)) &&
      (!status || purchase.status === status),
    );
  }, [purchases, query, status]);

  const returnToQuote = async (purchase: Purchase) => {
    if (!window.confirm(`Devolver ${purchase.code} para cotacao? Isso so e permitido sem itens comprados e sem pagamentos ativos.`)) return;
    setReturningId(purchase.id);
    try {
      await returnPurchaseToQuote(purchase.id);
      await load();
    } catch (failure) {
      window.alert(failure instanceof Error ? failure.message : 'Nao foi possivel devolver para cotacao.');
    } finally {
      setReturningId(null);
    }
  };

  const changeReimbursement = async (purchase: Purchase, next: ReimbursementStatus) => {
    try {
      await setPurchaseReimbursementStatus(purchase.id, next);
      await load();
    } catch {
      window.alert('Nao foi possivel atualizar o reembolso.');
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">Suprimentos</span><h2>Compras</h2><p>Cotacoes aprovadas, execucao, pagamentos, documentos e saldo a comprar.</p></div>
        <button className="button button--secondary" onClick={() => void load()}><RefreshCcw size={17} />Atualizar</button>
      </header>

      <div className="filter-bar">
        <label className="search-field"><Search size={18} /><input placeholder="Buscar compra, cotacao, fornecedor ou item" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <select aria-label="Status da compra" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><option value="approved">Aprovada</option><option value="in_progress">Em compra</option><option value="partially_purchased">Parcialmente comprada</option><option value="purchased">Comprada</option><option value="returned">Devolvida para cotacao</option><option value="cancelled">Cancelada</option></select>
      </div>

      {loading ? <InlineLoading label="Carregando compras" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : filtered.length ? (
        <div className="quote-list">
          <div className="quote-list__header"><span>Compra / Cotacao</span><span>Fornecedor</span><span>Lojas</span><span>Aprovado / comprado</span><span>Status</span><span>Acoes</span></div>
          {filtered.map((purchase) => {
            const totals = purchaseTotals(purchase);
            return (
              <div className="quote-list__group" key={purchase.id}>
                <article className="quote-row">
                  <div className="supply-identity"><small>{purchase.code}</small><strong>{purchase.quoteCode}</strong></div>
                  <div><strong>{purchase.supplierName}</strong><small>Aprovada em {formatDate(purchase.approvedAt)}</small></div>
                  <div title={purchase.stores.map((store) => `${store.code} - ${store.city}/${store.state}`).join('\n')}><strong>{storesLabel(purchase)}</strong><small>{purchase.stores.length > 1 ? 'Passe para ver a relacao' : `${purchase.stores[0]?.city}/${purchase.stores[0]?.state}`}</small></div>
                  <div><strong>{formatBRL(totals.approvedCents)}</strong><small>Comprado: {formatBRL(totals.purchasedCents)} · Falta: {formatBRL(totals.remainingCents)}</small></div>
                  <StatusBadge status={purchase.status} />
                  <div className="row-actions">
                    <IconButton label={`Ver resumo ${purchase.code}`} onClick={() => setSummary(purchase)}><ShoppingCart size={17} /></IconButton>
                    {can('purchases.edit' as never) && <IconButton label={`Pagamento ${purchase.code}`} onClick={() => setPaymentPurchase(purchase)}><CreditCard size={17} /></IconButton>}
                    <IconButton label={`Documentos ${purchase.code}`} onClick={() => setDocumentsPurchase(purchase)}><Paperclip size={17} /></IconButton>
                    <Link className="icon-button" aria-label={`Abrir cotacao ${purchase.quoteCode}`} title="Abrir cotacao de origem" to={`/suprimentos/cotacoes?quote=${purchase.quoteId}`}><ArrowLeft size={17} /></Link>
                    {can('purchases.approve' as never) && purchase.status !== 'returned' && purchase.status !== 'cancelled' && <IconButton label={`Voltar ${purchase.code} para cotacao`} disabled={returningId === purchase.id} onClick={() => void returnToQuote(purchase)}><RefreshCcw size={17} /></IconButton>}
                  </div>
                </article>
                <div className="quote-details">
                  <div className="table-scroll">
                    <table className="data-table"><thead><tr><th>Item</th><th>Loja</th><th>Aprovado</th><th>Comprado</th><th>Falta</th><th>Valor realizado</th><th></th></tr></thead><tbody>
                      {purchase.items.map((item) => {
                        const missing = quantityToThousandths(item.quantityApproved) - quantityToThousandths(item.purchasedQuantity);
                        return <tr key={item.id}><td><strong>{item.itemName}</strong><small>{item.itemCode}</small></td><td>{item.storeCode || storesLabel(purchase)}</td><td>{formatQuantity(item.quantityApproved)} {item.unit}</td><td>{formatQuantity(item.purchasedQuantity)} {item.unit}</td><td>{formatQuantity((Number(missing) / 1000).toString())} {item.unit}</td><td>{formatBRL(actualLineCents(item))}</td><td>{can('purchases.edit' as never) && purchase.status !== 'returned' && purchase.status !== 'cancelled' && <IconButton label={`Editar compra de ${item.itemName}`} onClick={() => setEditingItem(item)}><Edit3 size={16} /></IconButton>}</td></tr>;
                      })}
                    </tbody></table>
                  </div>
                  <div className="form-grid form-grid--three">
                    <label className="field">Reembolso<select disabled={!can('purchases.edit' as never)} value={purchase.reimbursementStatus} onChange={(e) => void changeReimbursement(purchase, e.target.value as ReimbursementStatus)}>{Object.entries(REIMBURSEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <div className="field"><span>Pagamentos registrados</span><strong>{purchase.payments.filter((payment) => payment.status !== 'cancelled').length}</strong></div>
                    <div className="field"><span>Documentos</span><strong>{purchase.attachments.length}</strong></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : <EmptyState title="Nenhuma compra" detail="As cotacoes aprovadas para compra aparecerao aqui." />}

      <PurchaseSummary purchase={summary} onClose={() => setSummary(null)} />
      <PurchaseItemModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={load} />
      <PaymentModal purchase={paymentPurchase} onClose={() => setPaymentPurchase(null)} onSaved={load} />
      <DocumentsModal purchase={documentsPurchase ? purchases.find((entry) => entry.id === documentsPurchase.id) || documentsPurchase : null} onClose={() => setDocumentsPurchase(null)} onSaved={load} />
    </section>
  );
}
