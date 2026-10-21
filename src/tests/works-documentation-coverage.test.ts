import { describe, expect, it } from 'vitest';
import { serviceTotals } from '../domain/works-calculations';
import type { WorkService, WorkServiceDocument } from '../domain/works-types';

function document(
  id: string,
  documentType: WorkServiceDocument['documentType'],
  amount: string | null,
): WorkServiceDocument {
  return {
    id,
    serviceId: 'work-1',
    storeId: 'store-1',
    paymentId: documentType === 'payment_proof' ? 'payment-1' : null,
    documentType,
    documentNumber: null,
    documentDate: '2026-09-11',
    documentAmount: amount,
    originalName: `${id}.pdf`,
    storagePath: `obras/store-1/work-1/${id}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    status: 'verified',
    notes: null,
    createdAt: '2026-09-11T00:00:00Z',
  };
}

function service(values: {
  contractedAmount: string;
  documents: WorkServiceDocument[];
  payments?: WorkService['payments'];
}): WorkService {
  return {
    id: 'work-1',
    code: 'OBR-TESTE',
    storeId: 'store-1',
    storeCode: 'LOJ-001',
    storeName: 'LOJA TESTE',
    storeCity: 'Cidade',
    storeState: 'RN',
    category: 'Serviços Diversos de Obra',
    description: 'Serviço teste',
    providerName: 'Prestador',
    providerTaxId: null,
    providerPhone: null,
    budgetAmount: values.contractedAmount,
    contractedAmount: values.contractedAmount,
    status: 'contracted',
    progressPercent: 0,
    plannedStartDate: null,
    plannedEndDate: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    payments: values.payments || [],
    documents: values.documents,
    components: [],
  };
}

function payment(id: string, amount: string, status: 'paid' | 'planned' = 'paid'): WorkService['payments'][number] {
  return {
    id, serviceId: 'work-1', storeId: 'store-1', label: id,
    paymentMethod: 'pix', sourceLabel: null, dueDate: null, amount, status,
    paidAt: status === 'paid' ? '2026-09-11T00:00:00Z' : null, notes: null,
    createdAt: '2026-09-11T00:00:00Z', updatedAt: '2026-09-11T00:00:00Z',
  };
}

describe('documentação de obras: nota e comprovantes para todo o valor pago', () => {
  it('é sem documentação com zero anexos ou somente orçamento', () => {
    expect(serviceTotals(service({ contractedAmount: '1000.00', documents: [] })).documentationStatus).toBe('none');
    expect(serviceTotals(service({
      contractedAmount: '1000.00', documents: [document('orc', 'quote', '1000.00')],
    })).documentationStatus).toBe('none');
  });

  it('é incompleta quando existir somente nota ou somente comprovante', () => {
    const note = document('nf', 'invoice', null);
    const proof = document('comprovante', 'payment_proof', '1000.00');
    const payments = [payment('p1', '1000.00')];
    expect(serviceTotals(service({ contractedAmount: '1000.00', documents: [note], payments })).documentationStatus).toBe('incomplete');
    const proofOnly = serviceTotals(service({ contractedAmount: '1000.00', documents: [proof], payments }));
    expect(proofOnly.documentationStatus).toBe('incomplete');
    expect(proofOnly.documentedCents).toBe(0n);
    expect(proofOnly.missingDocumentsCents).toBe(100000n);
  });

  it('mantém incompleta nota + comprovante de entrada se ainda houver parcela a pagar', () => {
    const totals = serviceTotals(service({
      contractedAmount: '23003.00',
      payments: [payment('p1', '11501.50'), payment('p2', '11501.50', 'planned')],
      documents: [document('nf', 'invoice', null), document('entrada', 'payment_proof', '11501.50')],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
    expect(totals.paidCents).toBe(1150150n);
    expect(totals.documentedCents).toBe(1150150n);
    expect(totals.missingDocumentsCents).toBe(1150150n);
  });

  it('é incompleta se os comprovantes não cobrirem pagamentos já quitados', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1000.00',
      payments: [payment('p1', '600.00'), payment('p2', '400.00')],
      documents: [document('nf', 'invoice', '1000.00'), document('p1', 'payment_proof', '600.00')],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
    expect(totals.missingDocumentsCents).toBe(40000n);
  });

  it('é completa com NF e comprovantes suficientes e tudo pago', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1000.00',
      payments: [payment('p1', '600.00'), payment('p2', '400.00')],
      documents: [
        document('nf', 'invoice', null),
        document('c1', 'payment_proof', '600.00'),
        document('c2', 'payment_proof', '400.00'),
      ],
    }));
    expect(totals.documentationStatus).toBe('complete');
    expect(totals.documentedCents).toBe(100000n);
    expect(totals.missingDocumentsCents).toBe(0n);
  });

  it('ignora notas sem arquivo e limita valores excedentes dos comprovantes', () => {
    const invalid = { ...document('nf', 'invoice', '1000.00'), storagePath: null };
    const totals = serviceTotals(service({
      contractedAmount: '1000.00',
      payments: [payment('p1', '1000.00')],
      documents: [invalid, document('c1', 'payment_proof', '1500.00')],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
    expect(totals.documentedCents).toBe(0n);
    const capped = serviceTotals(service({
      contractedAmount: '1000.00',
      payments: [payment('p1', '1000.00')],
      documents: [document('nf', 'invoice', null), document('c1', 'payment_proof', '1500.00')],
    }));
    expect(capped.documentationStatus).toBe('complete');
    expect(capped.documentedCents).toBe(100000n);
  });

  it('é completa com recibo e comprovantes cobrindo toda a obra quitada', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1250.00',
      payments: [payment('p1', '500.00'), payment('p2', '750.00')],
      documents: [
        document('recibo', 'receipt', null),
        document('c1', 'payment_proof', '500.00'),
        document('c2', 'payment_proof', '750.00'),
      ],
    }));
    expect(totals.documentationStatus).toBe('complete');
    expect(totals.hasInvoice).toBe(false);
    expect(totals.hasReceipt).toBe(true);
    expect(totals.hasFiscalDocument).toBe(true);
    expect(totals.documentedCents).toBe(125000n);
    expect(totals.missingDocumentsCents).toBe(0n);
  });

  it('mantém incompleta com recibo e comprovantes insuficientes', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1250.00',
      payments: [payment('p1', '500.00'), payment('p2', '750.00')],
      documents: [
        document('recibo', 'receipt', '1250.00'),
        document('c1', 'payment_proof', '500.00'),
      ],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
    expect(totals.documentedCents).toBe(50000n);
    expect(totals.missingDocumentsCents).toBe(75000n);
  });

  it('mantém incompleta com recibo e comprovante de entrada se houver saldo a pagar', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1250.00',
      payments: [payment('p1', '500.00'), payment('p2', '750.00', 'planned')],
      documents: [
        document('recibo', 'receipt', null),
        document('c1', 'payment_proof', '500.00'),
      ],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
    expect(totals.documentedCents).toBe(50000n);
  });

  it('não considera recibo sem arquivo nem recibo isolado como documentação completa', () => {
    const paymentRows = [payment('p1', '1250.00')];
    const receipt = document('recibo', 'receipt', '1250.00');
    const proof = document('comprovante', 'payment_proof', '1250.00');
    const withoutFile = serviceTotals(service({
      contractedAmount: '1250.00', payments: paymentRows,
      documents: [{ ...receipt, storagePath: null }, proof],
    }));
    const receiptOnly = serviceTotals(service({
      contractedAmount: '1250.00', payments: paymentRows, documents: [receipt],
    }));
    expect(withoutFile.documentationStatus).toBe('incomplete');
    expect(withoutFile.documentedCents).toBe(0n);
    expect(receiptOnly.documentationStatus).toBe('incomplete');
    expect(receiptOnly.documentedCents).toBe(0n);
  });

  it('não é completa se houver parcela agendada, mesmo com nota e prova', () => {
    const totals = serviceTotals(service({
      contractedAmount: '1000.00',
      payments: [payment('p1', '1000.00'), payment('p2', '500.00', 'planned')],
      documents: [document('nf', 'invoice', null), document('c1', 'payment_proof', '1000.00')],
    }));
    expect(totals.documentationStatus).toBe('incomplete');
  });
});
