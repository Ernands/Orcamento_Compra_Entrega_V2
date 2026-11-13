import { describe, expect, it } from 'vitest';
import { workDocumentDisplayStatus } from '../domain/work-document-display-status';
import { serviceTotals } from '../domain/works-calculations';
import type { WorkService } from '../domain/works-types';
import worksPage from '../pages/works-page.tsx?raw';

describe('documentos de obras sem arquivo físico', () => {
  it('não exibe conferido quando o cadastro está marcado verificado mas não tem arquivo', () => {
    for (const storagePath of [null, '', '   ']) {
      expect(workDocumentDisplayStatus({ storagePath, status: 'verified' })).toEqual({
        tone: 'missing',
        label: 'Sem arquivo — regularizar',
        hasFile: false,
      });
    }
  });

  it('respeita conferência apenas quando o documento possui caminho de arquivo', () => {
    expect(workDocumentDisplayStatus({
      storagePath: 'obras/store-1/nf.pdf',
      status: 'verified',
    })).toEqual({ tone: 'verified', label: 'Conferido', hasFile: true });
    expect(workDocumentDisplayStatus({
      storagePath: 'obras/store-1/recibo.pdf',
      status: 'pending',
    })).toEqual({ tone: 'pending', label: 'Pendente de conferência', hasFile: true });
  });

  it('não contabiliza uma nota marcada verificada sem anexo como documentação', () => {
    const document = {
      id: 'document-no-file', serviceId: 'work-1', storeId: 'store-1',
      documentType: 'invoice' as const, storagePath: null, status: 'verified' as const,
      paymentId: null, documentAmount: '1000.00',
    };
    const work = {
      id: 'work-1', contractedAmount: '1000.00', payments: [],
      documents: [document],
    } as unknown as WorkService;
    const totals = serviceTotals(work);
    expect(totals.hasFiscalDocument).toBe(false);
    expect(totals.documentationStatus).toBe('none');
  });

  it('interface de Obras só habilita abertura para caminho não vazio e alerta visualmente', () => {
    expect(worksPage).toContain('workDocumentDisplayStatus(document).tone');
    expect(worksPage).toContain('workDocumentDisplayStatus(document).label');
    expect(worksPage).toContain('workDocumentDisplayStatus(document).hasFile');
    expect(worksPage).toContain('if (!document?.storagePath?.trim()) return');
  });
});
