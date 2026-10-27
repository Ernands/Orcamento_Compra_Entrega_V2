import { useMemo, useState } from 'react';
import { AlertTriangle, FileArchive, FileText } from 'lucide-react';
import { Modal } from './ui';
import { createPurchaseAttachmentSignedUrlV2 } from '../data/purchases/purchases-v2-repository';
import { createWorkDocumentSignedUrl } from '../data/works/works-repository';
import { downloadStoreReimbursementZip } from '../data/exports/finance-reimbursement-export';
import { buildStoreReimbursement, reimbursementEligibleStoreIds } from '../domain/finance-reimbursement';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import { formatBRL } from '../domain/supply-calculations';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';

const STATUS_LABEL = { paid: 'Pago', planned: 'Programado', unscheduled: 'Sem programação' };

export function FinanceReimbursementModal({
  stores, rows, purchases, works, initialStoreId, onClose,
}: {
  stores: Store[];
  rows: UnifiedFinancePaymentRow[];
  purchases: PurchaseV2[];
  works: WorkService[];
  initialStoreId: string;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const eligibleIds = reimbursementEligibleStoreIds(rows);
    return stores
      .filter((store) => eligibleIds.has(store.id))
      .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
  }, [rows, stores]);
  const [storeId, setStoreId] = useState(
    options.some((store) => store.id === initialStoreId) ? initialStoreId : options[0]?.id || '',
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const selected = options.find((store) => store.id === storeId);
  const report = useMemo(
    () => storeId ? buildStoreReimbursement(rows, purchases, works, storeId) : null,
    [rows, purchases, works, storeId],
  );

  const generate = async () => {
    if (!selected || !report || generating) return;
    setGenerating(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await downloadStoreReimbursementZip({
        store: selected, report,
        getSignedUrl: (doc) => doc.source === 'work'
          ? createWorkDocumentSignedUrl(doc.storagePath)
          : createPurchaseAttachmentSignedUrlV2(doc.storagePath),
      });
      setOutcome(
        `ZIP gerado. ${result.missing} lançamento(s) sem nota/recibo, ${result.review} a conferir` +
        ` e ${result.failed} arquivo(s) que não puderam ser baixados. Consulte a aba Pendências Documentais.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o ZIP.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      open
      title="Gerar Solicitação de Reembolso"
      description="O valor solicitado é o compromisso total da loja, incluindo pagamentos realizados, programados e sem programação."
      className="finance-reimbursement-modal"
      onClose={() => { if (!generating) onClose(); }}
    >
      <div className="finance-reimbursement-content">
        <label className="finance-reimbursement-picker">
          Loja
          <select value={storeId} disabled={generating} onChange={(event) => {
            setStoreId(event.target.value);
            setError(null);
            setOutcome(null);
          }}>
            {options.map((store) => (
              <option value={store.id} key={store.id}>
                {store.code} · {store.name}
              </option>
            ))}
          </select>
        </label>
        <p className="finance-reimbursement-explanation">
          Relatório inspirado no modelo enviado: lista cada compromisso com a parcela e a referência de origem.
          Notas e recibos fiscais continuam em Notas_e_Recibos; comprovantes de pagamento
          de obras e serviços vão na pasta Recibos_Pagamentos_Obras_Servicos. A planilha traz
          uma coluna própria com links para esses recibos. Arquivos indisponíveis não reduzem
          o valor solicitado.
        </p>
        {report && selected ? (
          <>
            <div className="finance-reimbursement-summary">
              <article>
                <span>Total solicitado</span>
                <strong>{formatBRL(report.totals.commitmentCents)}</strong>
              </article>
              <article><span>Pago</span><strong>{formatBRL(report.totals.paidCents)}</strong></article>
              <article><span>Programado</span><strong>{formatBRL(report.totals.plannedCents)}</strong></article>
              <article><span>Sem programação</span><strong>{formatBRL(report.totals.unscheduledCents)}</strong></article>
            </div>
            <div className="finance-reimbursement-meta">
              <span><FileText size={15} /> {report.lines.length} lançamentos</span>
              <span><FileArchive size={15} /> {report.documents.length} notas/recibos fiscais · {report.paymentProofs.length} recibos de pagamento de obras/serviços</span>
              {report.pendingLines.length > 0 && (
                <span className="finance-reimbursement-warning"><AlertTriangle size={15} /> {report.pendingLines.length} pendências ou vínculos a conferir</span>
              )}
            </div>
            <div className="finance-reimbursement-preview">
              <table>
                <thead><tr><th>Referência</th><th>Situação</th><th>Valor da loja</th><th>Nota/Recibo</th></tr></thead>
                <tbody>
                  {report.lines.map((line) => (
                    <tr key={line.row.id}>
                      <td>
                        <strong>{line.row.referenceCodes.join(' + ')}</strong>
                        <small>{line.row.installmentLabel || line.row.description}</small>
                      </td>
                      <td>{STATUS_LABEL[line.row.status]}</td>
                      <td className="finance-reimbursement-money">{formatBRL(line.row.amountCents)}</td>
                      <td>
                        <span className={`finance-fiscal-state finance-fiscal-state--${line.fiscalState}`}>
                          {line.fiscalState === 'missing' ? 'Pendente' : line.fiscalState === 'review' ? 'Conferir vínculo' : 'Anexado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="finance-reimbursement-caveat">
              O valor é calculado pelos lançamentos atualmente atribuídos à loja no sistema.
              Se houver diferença em relação à planilha histórica, não será feito ajuste automático.
            </p>
            {error && <p className="finance-reimbursement-error" role="alert">{error}</p>}
            {outcome && <p className="finance-reimbursement-success" role="status">{outcome}</p>}
            <div className="finance-reimbursement-buttons">
              <button type="button" className="button button--secondary" disabled={generating} onClick={onClose}>Fechar</button>
              <button
                type="button" className="button button--primary"
                disabled={generating || !report.lines.length || !report.sumMatches}
                onClick={() => void generate()}
              >
                <FileArchive size={17} />
                {generating ? 'Gerando ZIP...' : 'Gerar relatório e ZIP'}
              </button>
            </div>
          </>
        ) : (
          <p>Nenhuma loja com lançamentos financeiros atribuídos está disponível.</p>
        )}
      </div>
    </Modal>
  );
}
