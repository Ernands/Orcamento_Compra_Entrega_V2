import { describe, expect, it } from 'vitest';
import {
  buildOccurrencePayload,
  buildPaymentWithOccurrencePayload,
} from '../data/purchases/payment-occurrences-repository';

describe('payment occurrences repository', () => {
  it('normaliza payload manual sem alterar o valor oficial do pagamento', () => {
    expect(buildOccurrencePayload([
      {
        occurredOn: '2026-10-01',
        amount: '1.972,98',
        paymentMethod: 'pix',
        referenceLabel: ' E0001 ',
        attachmentId: 'attachment-1',
        source: 'manual',
        notes: ' conferido ',
      },
    ])).toEqual([
      {
        occurred_on: '2026-10-01',
        amount: '1.972,98',
        payment_method: 'pix',
        reference_label: 'E0001',
        attachment_id: 'attachment-1',
        source: 'manual',
        notes: 'conferido',
      },
    ]);
  });

  it('omite occurrences vazias para preservar o payment_record automático', () => {
    const payload = buildPaymentWithOccurrencePayload({
      paymentMethod: 'pix',
      sourceLabel: 'Pagamento principal',
      amount: '100,00',
      entryAmount: '',
      installmentCount: '',
      firstDueDate: '',
      status: 'paid',
      paidAt: '2026-10-04T15:00:00-03:00',
      notes: '',
      occurrences: [],
    });

    expect(payload).not.toHaveProperty('occurrences');
    expect(payload.amount).toBe('100,00');
    expect(payload.status).toBe('paid');
  });

  it('envia occurrences quando o usuário informa o detalhamento', () => {
    const payload = buildPaymentWithOccurrencePayload({
      paymentMethod: 'pix',
      sourceLabel: 'Pagamento principal',
      amount: '100,00',
      entryAmount: '',
      installmentCount: '',
      firstDueDate: '',
      status: 'paid',
      paidAt: '2026-10-04T15:00:00-03:00',
      notes: '',
      occurrences: [{
        occurredOn: '2026-10-03',
        amount: '60,00',
        paymentMethod: 'pix',
        referenceLabel: 'PIX 1',
        source: 'manual',
      }],
    });

    expect(payload.occurrences).toHaveLength(1);
    expect(payload.occurrences?.[0]).toMatchObject({ occurred_on: '2026-10-03', amount: '60,00' });
  });
});
