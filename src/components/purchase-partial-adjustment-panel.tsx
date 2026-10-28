import { useState } from 'react';
import { FileText, Scale, ShieldCheck } from 'lucide-react';
import { registerPartialPurchaseAdjustment } from '../data/purchases/purchases-v2-repository';
import type { PurchaseOrderV2, PurchaseV2 } from '../domain/purchase-v2-types';
import { moneyToCents } from '../domain/supply-calculations';
import { moneyBRL, parseRefundBRL, prorateFreightReduction } from '../domain/purchase-freight-proration';
import './purchase-partial-adjustment-panel.css';

type Props = {
  purchase: PurchaseV2;
  order: PurchaseOrderV2;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onAttachRefundProof: () => void;
};
const format = (value: bigint) => moneyBRL(Number(value));
const originalTotal = (order: PurchaseOrderV2) =>
  order.lines.reduce((total, line) => total + moneyToCents(line.lineTotal || '0'), 0n);

export function PurchasePartialAdjustmentPanel({
  purchase, order, canEdit, onSaved, onAttachRefundProof,
}: Props) {
  const existing = purchase.adjustments?.find((entry) => entry.orderId === order.id);
  const [open, setOpen] = useState(false);
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  const [refundText, setRefundText] = useState('');
  const [refundDate, setRefundDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [confirmFreight, setConfirmFreight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activePayments = purchase.payments.filter((entry) =>
    entry.purchaseOrderId === order.id && entry.status !== 'cancelled');
  const payment = activePayments.length === 1 && activePayments[0].status === 'paid'
    ? activePayments[0] : null;
  const refundProofs = purchase.attachments.filter((doc) =>
    doc.purchaseOrderId === order.id && doc.documentType === 'reimbursement');
  const original = originalTotal(order);
  const cancelledSet = new Set(cancelledIds);
  const cancelledLines = order.lines.filter((line) => cancelledSet.has(line.id));
  const retainedLines = order.lines.filter((line) => !cancelledSet.has(line.id));
  const cancelledTotal = cancelledLines.reduce((sum, line) => sum + moneyToCents(line.lineTotal || '0'), 0n);
  const refund = parseRefundBRL(refundText);
  const difference = refund === null ? null : BigInt(refund) - cancelledTotal;
  const remainingFreight = retainedLines.reduce((sum, line) => sum + moneyToCents(line.shippingAmount || '0'), 0n);
  const validMoney = difference !== null && difference >= 0n && difference <= remainingFreight
    && refund !== null && refund > 0 && BigInt(refund) < original;
  const validInputs = cancelledIds.length > 0 && cancelledIds.length < order.lines.length &&
    validMoney && confirmFreight && documentId && reference.trim().length >= 4 &&
    reason.trim().length >= 10 && refundDate.length === 10 && refundDate <= new Date().toISOString().slice(0, 10);
  const distributed = (() => {
    if (!validMoney || difference === null) return [];
    return prorateFreightReduction(retainedLines.map((line) => ({
      id: line.id, code: line.itemCode, description: line.itemName,
      shippingCents: Number(moneyToCents(line.shippingAmount || '0')),
      totalCents: Number(moneyToCents(line.lineTotal || '0')),
    })), Number(difference));
  })();
  const net = refund === null ? null : original - BigInt(refund);

  if (existing) {
    const doc = purchase.attachments.find((entry) => entry.id === existing.refundAttachmentId);
    return <div className="purchase-refund-history">
      <div className="purchase-refund-history__title"><ShieldCheck size={17}/><strong>Cancelamento parcial conciliado</strong></div>
      <div className="purchase-refund-summary">
        <span>Pago originalmente <strong>{format(existing.grossCents)}</strong></span>
        <span>Crédito recebido <strong>− {format(existing.refundedCents)}</strong></span>
        <span>Rateio de frete <strong>− {format(existing.freightReductionCents)}</strong></span>
        <span>Pago líquido <strong>{format(existing.netCents)}</strong></span>
      </div>
      <p>{existing.refundedOn} · {existing.reference} · {existing.reason}</p>
      <p>Itens cancelados: {existing.cancelledLines.map((line) => `${line.itemCode} — ${line.itemName}`).join('; ')}.</p>
      <p>Comprovante do crédito: <strong>{doc?.originalName || existing.refundAttachmentId}</strong>.
        Pagamento e linhas originais preservados no banco e no histórico de auditoria.</p>
    </div>;
  }
  if (!canEdit || order.status !== 'active') return null;
  if (purchase.stores.length !== 1 || !payment || order.lines.length < 2 ||
      moneyToCents(payment.amount) !== original ||
      order.lines.some((line) => line.lineTotal === null || line.shippingAmount === null ||
        line.storeDistributionStatus !== 'confirmed')) {
    return <p className="purchase-refund-limitation">
      Cancelamento parcial: disponível para um pedido ativo de uma loja, com um único pagamento quitado,
      valores de frete definidos e distribuição confirmada. Operações com múltiplos pagamentos
      exigem conciliação individual antes do ajuste.
    </p>;
  }
  const updateSelection = (id: string) => {
    setCancelledIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
    setError(null);
  };
  const submit = async () => {
    if (!validInputs || refund === null || !payment) return;
    if (!window.confirm(
      `Registrar ajuste IRREVERSÍVEL no pedido de ${purchase.code}?\n\n` +
      `Pagamento original: ${format(original)}\nItens cancelados: ${format(cancelledTotal)}\n` +
      `Crédito recebido: ${moneyBRL(refund)}\nRedução de frete: ${format(difference || 0n)}\n` +
      `Total líquido: ${format(net || 0n)}\n\n` +
      'O banco manterá o pagamento original e os documentos. O ajuste não poderá ser repetido.',
    )) return;
    setSaving(true);
    setError(null);
    try {
      await registerPartialPurchaseAdjustment({
        orderId: order.id, paymentId: payment.id, attachmentId: documentId,
        refundedOn: refundDate, reference: reference.trim(), reason: reason.trim(),
        expectedOriginalCents: original, refundCents: BigInt(refund),
        cancelled: cancelledLines.map((line) => ({
          lineId: line.id, amountCents: moneyToCents(line.lineTotal || '0'),
        })),
      });
      await onSaved();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar ajuste.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="purchase-refund-panel">
    <button type="button" className="button button--secondary button--small"
      onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <Scale size={16}/> {open ? 'Recolher ajuste' : 'Ajustar compra / Cancelamento parcial'}
    </button>
    {open && <div className="purchase-refund-body">
      <h4>Cancelamento parcial com crédito e rateio proporcional do frete</h4>
      <p>Selecione linhas inteiras canceladas, informe o reembolso recebido e vincule o documento do crédito. O saldo de frete será distribuído entre os itens mantidos, sem alterar preços unitários.</p>
      <div className="purchase-refund-lines">{order.lines.map((line) =>
        <label key={line.id} className={cancelledSet.has(line.id) ? 'is-cancelled' : ''}>
          <input type="checkbox" checked={cancelledSet.has(line.id)} onChange={() => updateSelection(line.id)}/>
          <span><strong>{line.itemName}</strong><small>{line.itemCode} · {line.quantity} {line.unit}</small></span>
          <strong>{format(moneyToCents(line.lineTotal || '0'))}</strong>
        </label>)}</div>
      <div className="purchase-refund-fields">
        <label>Reembolso efetivamente recebido (R$)<input placeholder="1.220,40" value={refundText}
          onChange={(event) => setRefundText(event.target.value)} inputMode="decimal"/></label>
        <label>Data do crédito<input type="date" max={new Date().toISOString().slice(0, 10)} value={refundDate}
          onChange={(event) => setRefundDate(event.target.value)}/></label>
        <label>Referência do crédito<input value={reference} onChange={(event) => setReference(event.target.value)}
          placeholder="ID Mercado Livre / comprovante"/></label>
        <label>Justificativa<input value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo do cancelamento e confirmação do abatimento de frete"/></label>
      </div>
      <label className="purchase-refund-proof">Comprovante de reembolso vinculado ao pedido
        <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
          <option value="">Selecione o documento de reembolso</option>
          {refundProofs.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalName}</option>)}
        </select>
        <button type="button" className="button button--secondary button--small" onClick={onAttachRefundProof}>
          <FileText size={15}/> Anexar comprovante na compra
        </button>
      </label>
      <label className="purchase-refund-consent">
        <input type="checkbox" checked={confirmFreight} onChange={(event) => setConfirmFreight(event.target.checked)}/>
        Confirmo documentalmente que a diferença será classificada como abatimento de frete e autorizo o rateio proporcional.
      </label>
      <div className="purchase-refund-numbers">
        <span>Pagamento original<strong>{format(original)}</strong></span>
        <span>Itens cancelados<strong>− {format(cancelledTotal)}</strong></span>
        <span>Crédito recebido<strong>{refund === null ? 'Inválido' : `− ${moneyBRL(refund)}`}</strong></span>
        <span>Rateio de frete<strong>{difference === null ? '—' : format(difference)}</strong></span>
        <span>Frete restante disponível<strong>{format(remainingFreight)}</strong></span>
        <span>Total líquido<strong>{net === null ? '—' : format(net)}</strong></span>
        <span>Diferença residual<strong>{validMoney ? moneyBRL(0) : 'Não conciliado'}</strong></span>
      </div>
      {validMoney && distributed.length > 0 && <details className="purchase-refund-detail">
        <summary>Conferir rateio nos {distributed.length} itens mantidos</summary>
        <div className="purchase-refund-table-wrap"><table>
          <thead><tr><th>Item</th><th>Frete anterior</th><th>Redução</th><th>Frete novo</th><th>Total novo</th></tr></thead>
          <tbody>{distributed.map((line) => <tr key={line.id}><td>{line.code} — {line.description}</td>
          <td>{moneyBRL(line.originalFreightCents)}</td><td>− {moneyBRL(line.reductionCents)}</td>
          <td>{moneyBRL(line.adjustedFreightCents)}</td><td>{moneyBRL(line.adjustedTotalCents)}</td></tr>)}</tbody>
          <tfoot><tr><th>Total</th><th>{format(remainingFreight)}</th>
          <th>− {format(difference || 0n)}</th><th>{format(remainingFreight - (difference || 0n))}</th>
          <th>{format(net || 0n)}</th></tr></tfoot>
        </table></div>
      </details>}
      {difference !== null && difference < 0n && <p className="form-error">O crédito é inferior ao valor dos itens. Não é possível reduzir o frete.</p>}
      {difference !== null && difference > remainingFreight && <p className="form-error">Crédito excede o frete dos itens mantidos.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="purchase-refund-actions"><button type="button" className="button button--primary"
        disabled={!validInputs || saving} onClick={() => void submit()}>
          {saving ? 'Registrando e validando...' : 'Confirmar cancelamento parcial e reembolso'}
        </button><small>Operação única, auditável e bloqueada para repetição.</small></div>
    </div>}
  </section>;
}
