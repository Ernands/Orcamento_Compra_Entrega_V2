import { useState } from 'react';
import { FileText, Plus, Scale, ShieldCheck, Trash2 } from 'lucide-react';
import { registerPartialPurchaseAdjustment } from '../data/purchases/purchases-v2-repository';
import type { PurchaseOrderV2, PurchaseV2 } from '../domain/purchase-v2-types';
import { moneyToCents } from '../domain/supply-calculations';
import { moneyBRL, parseRefundBRL, prorateFreightReduction } from '../domain/purchase-freight-proration';
import './purchase-partial-adjustment-panel.css';

type RefundInput = { id: number; lineId: string; amount: string; date: string };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
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
  const [refundInputs, setRefundInputs] = useState<RefundInput[]>([]);
  const [nextRefundId, setNextRefundId] = useState(1);
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
  const cancelledFreight = cancelledLines.reduce((sum, line) => sum + moneyToCents(line.shippingAmount || '0'), 0n);
  const parsedEntries = refundInputs.map((entry) => ({
    ...entry, cents: parseRefundBRL(entry.amount),
  }));
  const entriesValid = parsedEntries.length > 0 && parsedEntries.every((entry) =>
    Boolean(entry.lineId && cancelledSet.has(entry.lineId)) &&
    entry.cents !== null && entry.cents > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date <= today());
  const allCancelledHaveRefund = cancelledIds.every((id) =>
    parsedEntries.some((entry) => entry.lineId === id));
  const refund = entriesValid && allCancelledHaveRefund
    ? parsedEntries.reduce((sum, entry) => sum + (entry.cents || 0), 0) : null;
  const difference = refund === null ? null : BigInt(refund) - cancelledTotal;
  const remainingFreight = retainedLines.reduce((sum, line) => sum + moneyToCents(line.shippingAmount || '0'), 0n);
  // Valor negativo = frete dos itens cancelados que não foi restituído.
  // Nunca permite converter preços dos produtos em frete sem lastro original.
  const validMoney = difference !== null && difference >= -cancelledFreight && difference <= remainingFreight
    && refund !== null && refund > 0 && BigInt(refund) < original;
  const validInputs = cancelledIds.length > 0 && cancelledIds.length < order.lines.length &&
    validMoney && entriesValid && allCancelledHaveRefund && confirmFreight && documentId &&
    reference.trim().length >= 4 && reason.trim().length >= 10;
  const distributed = (() => {
    if (!validMoney || difference === null || difference <= 0n) return [];
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
        <span>{existing.freightReductionCents < 0n ? 'Frete não restituído' : 'Redução de frete'}
          <strong>{existing.freightReductionCents < 0n ? '+ ' + format(-existing.freightReductionCents) : '− ' + format(existing.freightReductionCents)}</strong></span>
        <span>Pago líquido <strong>{format(existing.netCents)}</strong></span>
      </div>
      <p>{existing.refundedOn} · {existing.reference} · {existing.reason}</p>
      <p>Itens cancelados: {existing.cancelledLines.map((line) => line.itemCode + ' — ' + line.itemName).join('; ')}.</p>
      {existing.freightReductionCents < 0n && <p className="purchase-refund-retained-note">
        AJ-FRETE — Acerto de frete dos itens cancelados: + {format(-existing.freightReductionCents)}.
        Custo preservado sem modificar o pagamento original ou os preços unitários.
      </p>}
      {existing.refundEntries.length > 0 && <div className="purchase-refund-table-wrap"><table>
        <thead><tr><th>Item reembolsado</th><th>Data do crédito</th><th>Valor recebido</th></tr></thead>
        <tbody>{existing.refundEntries.map((entry, index) => {
          const line = existing.cancelledLines.find((item) => item.id === entry.lineId);
          return <tr key={entry.lineId + ':' + index}>
            <td>{line ? line.itemCode + ' — ' + line.itemName : 'Item não identificado'}</td>
            <td>{entry.refundedOn}</td><td>{format(entry.amountCents)}</td>
          </tr>;
        })}</tbody>
      </table></div>}
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
    const next = cancelledIds.includes(id) ? cancelledIds.filter((entry) => entry !== id) : [...cancelledIds, id];
    setCancelledIds(next);
    setRefundInputs((current) => current.filter((entry) => next.includes(entry.lineId)));
    setError(null);
  };
  const addRefund = () => {
    setRefundInputs((current) => [...current, {
      id: nextRefundId,
      lineId: cancelledLines.find((line) => !current.some((entry) => entry.lineId === line.id))?.id || cancelledLines[0]?.id || '',
      amount: '', date: today(),
    }]);
    setNextRefundId((current) => current + 1);
    setError(null);
  };
  const updateRefund = (id: number, patch: Partial<RefundInput>) => {
    setRefundInputs((current) => current.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry));
    setError(null);
  };
  const submit = async () => {
    if (!validInputs || refund === null || !payment) return;
    if (!window.confirm(
      `Registrar ajuste IRREVERSÍVEL no pedido de ${purchase.code}?\n\n` +
      `Pagamento original: ${format(original)}\nItens cancelados: ${format(cancelledTotal)}\n` +
      `Crédito recebido: ${moneyBRL(refund)}\nAcerto de frete (sinalizado): ${format(difference || 0n)}\n` +
      `Total líquido: ${format(net || 0n)}\n\n` +
      'O banco manterá o pagamento original e os documentos. O ajuste não poderá ser repetido.',
    )) return;
    setSaving(true);
    setError(null);
    try {
      await registerPartialPurchaseAdjustment({
        orderId: order.id, paymentId: payment.id, attachmentId: documentId,
        reference: reference.trim(), reason: reason.trim(),
        expectedOriginalCents: original,
        refundEntries: parsedEntries.map((entry) => ({
          lineId: entry.lineId, amountCents: BigInt(entry.cents!), refundedOn: entry.date,
        })),
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
      <h4>Cancelamento parcial com créditos por item e rateio proporcional do frete</h4>
      <p>Selecione os itens integralmente cancelados. Clique em + para registrar o valor recebido e a data de cada reembolso. O total é calculado automaticamente.</p>
      <div className="purchase-refund-lines">{order.lines.map((line) =>
        <label key={line.id} className={cancelledSet.has(line.id) ? 'is-cancelled' : ''}>
          <input type="checkbox" checked={cancelledSet.has(line.id)} onChange={() => updateSelection(line.id)}/>
          <span><strong>{line.itemName}</strong><small>{line.itemCode} · {line.quantity} {line.unit}</small></span>
          <strong>{format(moneyToCents(line.lineTotal || '0'))}</strong>
        </label>)}</div>
      <div className="purchase-refund-credit-heading">
        <h5>Créditos recebidos por item</h5>
        <button type="button" className="button button--secondary button--small"
          onClick={addRefund} disabled={!cancelledIds.length}>
          <Plus size={16}/> Adicionar reembolso
        </button>
      </div>
      {refundInputs.length === 0 && <p className="purchase-refund-hint">
        Selecione um item cancelado e clique em “Adicionar reembolso” para registrar seu valor e data.
      </p>}
      <div className="purchase-refund-entries">
        {refundInputs.map((entry, index) => <div className="purchase-refund-entry" key={entry.id}>
          <label>Item do crédito
            <select aria-label={'Item do reembolso ' + (index + 1)} value={entry.lineId}
              onChange={(event) => updateRefund(entry.id, { lineId: event.target.value })}>
              <option value="">Selecione</option>
              {cancelledLines.map((line) =>
                <option key={line.id} value={line.id}>{line.itemCode} — {line.itemName}</option>)}
            </select>
          </label>
          <label>Valor recebido (R$)
            <input aria-label={'Valor do reembolso ' + (index + 1)} inputMode="decimal" placeholder="0,00"
              value={entry.amount} onChange={(event) => updateRefund(entry.id, { amount: event.target.value })}/>
          </label>
          <label>Data do crédito
            <input aria-label={'Data do reembolso ' + (index + 1)} type="date" max={today()}
              value={entry.date} onChange={(event) => updateRefund(entry.id, { date: event.target.value })}/>
          </label>
          <button type="button" className="purchase-refund-remove"
            aria-label={'Remover reembolso ' + (index + 1)}
            onClick={() => setRefundInputs((current) => current.filter((item) => item.id !== entry.id))}>
            <Trash2 size={16}/>
          </button>
        </div>)}
      </div>
      <p className="purchase-refund-total">Total dos créditos informados:
        <strong>{entriesValid ? format(parsedEntries.reduce((sum, entry) =>
          sum + BigInt(entry.cents || 0), 0n)) : 'Preencha valores e datas válidos'}</strong>
      </p>
      {entriesValid && !allCancelledHaveRefund && <p className="form-error">
        Cada item cancelado deve ter pelo menos um lançamento de reembolso.
      </p>}
      <div className="purchase-refund-fields">
        <label>Referência dos créditos<input value={reference} onChange={(event) => setReference(event.target.value)}
          placeholder="ID Mercado Livre / referência dos comprovantes"/></label>
        <label>Justificativa<input value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo do cancelamento e abatimento de frete"/></label>
      </div>
      <label className="purchase-refund-proof">Comprovante de reembolso vinculado ao pedido
        <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
          <option value="">Selecione o documento de reembolso</option>
          {refundProofs.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalName}</option>)}
        </select>
        {refundProofs.length === 0 && <small>Nenhum documento de reembolso anexado a este pedido. O comprovante do pagamento original não substitui o documento do crédito recebido.</small>}
        <button type="button" className="button button--secondary button--small" onClick={onAttachRefundProof}>
          <FileText size={15}/> Anexar comprovante de reembolso
        </button>
      </label>
      {difference !== null && <div className="purchase-refund-freight-adjustment">
        <div>
          <strong>AJ-FRETE · Acerto de frete dos itens cancelados</strong>
          <small>{difference < 0n
            ? 'Parte do frete originalmente atribuído aos itens cancelados não foi devolvida. O custo ficará registrado em uma terceira linha de ajuste, sem aumentar o frete dos itens mantidos.'
            : difference > 0n
              ? 'O fornecedor devolveu frete adicional. A redução será rateada somente entre os itens mantidos, respeitando seu frete original.'
              : 'Sem diferença de frete: o crédito corresponde exatamente ao valor dos itens cancelados.'}</small>
        </div>
        <strong className={difference < 0n ? 'purchase-refund-freight-adjustment__positive' : ''}>
          {difference < 0n ? '+ ' + format(-difference) : difference > 0n ? '− ' + format(difference) : format(0n)}
        </strong>
      </div>}
      <label className="purchase-refund-consent">
        <input type="checkbox" checked={confirmFreight} onChange={(event) => setConfirmFreight(event.target.checked)}/>
        {difference !== null && difference < 0n
          ? 'Confirmo que o valor não restituído está documentado como custo residual de frete dos itens cancelados, limitado ao frete original desses itens.'
          : 'Confirmo documentalmente que a diferença positiva entre o crédito recebido e os itens cancelados corresponde a abatimento de frete, e autorizo o rateio proporcional.'}
      </label>
      <div className="purchase-refund-numbers">
        <span>Pagamento original<strong>{format(original)}</strong></span>
        <span>Itens cancelados<strong>− {format(cancelledTotal)}</strong></span>
        <span>Créditos recebidos<strong>{refund === null ? 'Pendente' : `− ${moneyBRL(refund)}`}</strong></span>
        <span>{difference !== null && difference < 0n ? 'Frete não restituído' : 'Redução de frete'}
          <strong>{difference === null ? '—' : difference < 0n ? '+ ' + format(-difference) : '− ' + format(difference)}</strong></span>
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
      {difference !== null && difference < -cancelledFreight && <p className="form-error" role="alert">
        O frete não restituído de {format(-difference)} supera o frete original de {format(cancelledFreight)} dos itens cancelados.
        Confira os créditos e a documentação antes de registrar.
      </p>}
      {difference !== null && difference > remainingFreight && <p className="form-error">Crédito excede o frete dos itens mantidos.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="purchase-refund-actions"><button type="button" className="button button--primary"
        disabled={!validInputs || saving} onClick={() => void submit()}>
          {saving ? 'Registrando e validando...' : 'Confirmar cancelamento parcial e reembolso'}
        </button><small>Operação única, auditável e bloqueada para repetição.</small></div>
    </div>}
  </section>;
}
