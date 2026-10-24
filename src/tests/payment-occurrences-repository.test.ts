import { describe, expect, it } from 'vitest';
import {
  buildOccurrencePayload,
  buildPaymentWithOccurrencePayload,
  sanitizeOccurrenceAttachmentReferences,
} from '../data/purchases/payment-occurrences-repository';
import occurrenceModal from '../components/finance-payment-occurrences.tsx?raw';

describe('referências de comprovantes excluídos nas ocorrências', () => {
  const values = [
    { occurredOn: '2026-09-28', amount: '23632,45', paymentMethod: 'pix' as const,
      referenceLabel: 'PIX 1', attachmentId: 'deleted-proof' },
    { occurredOn: '2026-10-01', amount: '1593,69', paymentMethod: 'pix' as const,
      referenceLabel: 'PIX 2', attachmentId: 'active-proof' },
  ];

  it('desassocia somente comprovante excluído, sem modificar datas, valores ou formas', () => {
    const original = structuredClone(values);
    const resolved = sanitizeOccurrenceAttachmentReferences(values, new Set(['active-proof']));
    expect(resolved.unlinkedCount).toBe(1);
    expect(resolved.occurrences).toEqual([
      { ...values[0], attachmentId: null },
      values[1],
    ]);
    expect(values).toEqual(original);
    expect(resolved.occurrences.map((v) => v.amount)).toEqual(['23632,45','1593,69']);
    expect(resolved.occurrences.map((v) => v.occurredOn)).toEqual(['2026-09-28','2026-10-01']);
  });

  it('não modifica comprovantes válidos nem associa PDFs automaticamente pelo nome', () => {
    const resolved = sanitizeOccurrenceAttachmentReferences(values, new Set(['deleted-proof','active-proof']));
    expect(resolved.unlinkedCount).toBe(0);
    expect(resolved.occurrences).toEqual(values);
    expect(resolved.occurrences).not.toBe(values);
  });

  it('mostra confirmação antes de desassociar e usa o detalhamento editado no cabeçalho', () => {
    expect(occurrenceModal).toContain('(count) => window.confirm(');
    expect(occurrenceModal).toContain('setUnlinkedProofs(result.unlinkedCount)');
    expect(occurrenceModal).toContain('const displayedDetailed = editing ? draftTotal : detailed');
    expect(occurrenceModal).toContain('const displayedDifference = editing ? editDifference : difference');
  });
});

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
