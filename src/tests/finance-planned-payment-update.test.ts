import { describe, expect, it } from 'vitest';
import { buildPlannedFinancePaymentUpdatePayload } from '../data/finance/finance-repository';

describe('edição de pagamento programado no Financeiro', () => {
  it('monta o payload para alterar vencimento e marcar repasse ao Financeiro', () => {
    expect(buildPlannedFinancePaymentUpdatePayload({
      source: 'purchase',
      paymentIds: ['payment-1'],
      dueDate: '2026-10-21',
      forwardedToFinance: true,
    })).toEqual({
      p_source: 'purchase',
      p_payment_ids: ['payment-1'],
      p_due_date: '2026-10-21',
      p_forwarded_to_finance: true,
    });
  });

  it('permite preservar o status de repasse em uma linha consolidada', () => {
    expect(buildPlannedFinancePaymentUpdatePayload({
      source: 'work',
      paymentIds: ['payment-1', 'payment-2'],
      dueDate: '2026-11-09',
      forwardedToFinance: null,
    }).p_forwarded_to_finance).toBeNull();
  });
});
