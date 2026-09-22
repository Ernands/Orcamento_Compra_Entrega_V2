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
    payments: [],
    documents: values.documents,
    components: [],
  };
}

describe('works documentation coverage', () => {
  it('considera comprovante parcial quando ainda não há nota ou recibo', () => {
    const totals = serviceTotals(
      service({
        contractedAmount: '23003.00',
        documents: [
          document('orcamento', 'quote', null),
          document('comprovante-entrada', 'payment_proof', '11501.50'),
        ],
      }),
    );

    expect(totals.fiscalDocumentedCents).toBe(0n);
    expect(totals.paymentProofCents).toBe(1150150n);
    expect(totals.documentedCents).toBe(1150150n);
    expect(totals.missingDocumentsCents).toBe(1150150n);
  });

  it('não duplica quando notas e comprovante cobrem o mesmo valor', () => {
    const totals = serviceTotals(
      service({
        contractedAmount: '6650.00',
        documents: [
          document('nf-82', 'invoice', '2250.00'),
          document('nf-83', 'invoice', '4400.00'),
          document('comprovante', 'payment_proof', '6650.00'),
        ],
      }),
    );

    expect(totals.fiscalDocumentedCents).toBe(665000n);
    expect(totals.paymentProofCents).toBe(665000n);
    expect(totals.documentedCents).toBe(665000n);
    expect(totals.missingDocumentsCents).toBe(0n);
  });

  it('limita a cobertura documental ao valor contratado', () => {
    const totals = serviceTotals(
      service({
        contractedAmount: '1000.00',
        documents: [
          document('nota', 'invoice', '1200.00'),
          document('comprovante', 'payment_proof', '1500.00'),
        ],
      }),
    );

    expect(totals.documentedCents).toBe(100000n);
    expect(totals.missingDocumentsCents).toBe(0n);
  });
});
