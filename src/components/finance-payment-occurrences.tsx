import { CalendarClock, CircleAlert } from 'lucide-react';
import { EmptyState, Modal } from './ui';
import {
  financePaymentHasOccurrenceDivergence,
  financePaymentOccurrenceDifference,
  financePaymentOccurrences,
  financePaymentOfficialAmount,
  type UnifiedFinancePaymentRowWithOccurrences,
} from '../domain/finance-payment-occurrences';
import { formatBRL } from '../domain/supply-calculations';
import './finance-payment-occurrences.css';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function referenceLabel(row: UnifiedFinancePaymentRowWithOccurrences): string {
  return row.referenceCodes.join(' + ') || 'Sem referência';
}

export function FinancePaymentDatesCell({ row }: { row: UnifiedFinancePaymentRowWithOccurrences }) {
  const divergence = financePaymentHasOccurrenceDivergence(row);
  const dates = row.paymentDates.length ? row.paymentDates : row.date ? [row.date] : [];
  if (!dates.length) return <span className="finance-payment-missing">Não informado</span>;

  return (
    <div className={`finance-payment-date-chips ${divergence ? 'is-divergent' : ''}`}>
      {dates.map((date) => (
        <span key={date} className="finance-payment-date-chip" title={divergence ? 'A soma do detalhamento diverge do valor oficial.' : undefined}>
          {formatDate(date)}
        </span>
      ))}
    </div>
  );
}

export function FinancePaymentDatesAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="finance-payment-dates-action"
      onClick={onClick}
      title="Ver datas, valores e formas dos pagamentos"
      aria-label="Ver datas dos pagamentos"
    >
      <CalendarClock size={16} />
    </button>
  );
}

export function FinancePaymentOccurrencesModal({
  row,
  onClose,
}: {
  row: UnifiedFinancePaymentRowWithOccurrences | null;
  onClose: () => void;
}) {
  if (!row) return null;
  const occurrences = financePaymentOccurrences(row);
  const official = financePaymentOfficialAmount(row);
  const detailed = occurrences.reduce((sum, occurrence) => sum + occurrence.amountCents, 0n);
  const difference = financePaymentOccurrenceDifference(row);
  const divergence = difference !== 0n;

  return (
    <Modal
      open
      title={`Datas dos pagamentos · ${referenceLabel(row)}`}
      description="O valor oficial permanece o lançado na compra. O detalhamento mostra as ocorrências financeiras informadas ou conferidas nos comprovantes."
      onClose={onClose}
      className="finance-payment-occurrences-modal"
    >
      <div className={`finance-payment-occurrence-summary ${divergence ? 'is-divergent' : 'is-reconciled'}`}>
        <div><span>Valor oficial</span><strong>{formatBRL(official)}</strong></div>
        <div><span>Soma detalhada</span><strong>{formatBRL(detailed)}</strong></div>
        <div><span>Diferença (detalhado − oficial)</span><strong>{formatBRL(difference)}</strong></div>
      </div>

      {divergence && (
        <div className="finance-payment-occurrence-warning" role="status">
          <CircleAlert size={18} />
          <div>
            <strong>Detalhamento divergente</strong>
            <span>As ocorrências não fecham com o valor oficial. O pagamento da CMP não foi alterado.</span>
          </div>
        </div>
      )}

      {row.occurrenceDetailsSource === 'fallback' && (
        <div className="finance-payment-occurrence-fallback">
          Este pagamento ainda não possui detalhamento estruturado. A linha abaixo usa a data e o valor já cadastrados no pagamento.
        </div>
      )}

      {occurrences.length ? (
        <div className="finance-payment-occurrence-table-wrap">
          <table className="finance-payment-occurrence-table">
            <thead>
              <tr><th>Data</th><th>Valor</th><th>Forma</th><th>Referência</th></tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => (
                <tr key={occurrence.id}>
                  <td><strong>{formatDate(occurrence.date)}</strong></td>
                  <td className="is-money"><strong>{formatBRL(occurrence.amountCents)}</strong></td>
                  <td><span className="finance-payment-method-pill">{occurrence.paymentMethod ? PAYMENT_LABELS[occurrence.paymentMethod] || occurrence.paymentMethod : 'Não informada'}</span></td>
                  <td>{occurrence.referenceLabel || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Sem datas detalhadas" detail="Nenhuma ocorrência financeira foi informada para este pagamento." />
      )}
    </Modal>
  );
}
