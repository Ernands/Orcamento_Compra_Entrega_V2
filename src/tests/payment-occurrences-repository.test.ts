import { describe, expect, it } from 'vitest';
import { buildOccurrencePayload } from '../data/purchases/payment-occurrences-repository';

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
});
