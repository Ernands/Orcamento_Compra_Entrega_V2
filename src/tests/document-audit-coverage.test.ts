import { describe, expect, it } from 'vitest';
import { auditDocumentCoverage, auditRecordDocumentLabel } from '../domain/document-audit-coverage';
import { auditDoc, auditRecord } from './fixtures/document-audit';

describe('disponibilidade de notas e recibos na conferência', () => {
  it('não chama de documentado o cadastro conferido sem arquivo', () => {
    const registered = auditRecord('purchase:p1', { ...auditDoc(), storagePath: '   ' });
    expect(auditRecordDocumentLabel(registered)).toEqual({
      label: 'Sem arquivo fiscal vinculado',
      detail: '1 cadastro(s) sem arquivo — regularizar',
    });
    expect(auditDocumentCoverage([registered])).toEqual({
      registered: 1, withPath: 0, withoutPath: 1,
    });
  });

  it('identifica registros com nota válida e recibo sem caminho separadamente', () => {
    const invoice = auditDoc();
    const receipt = { ...auditDoc('receipt-1'), type: 'receipt' as const, storagePath: '' };
    const record = { ...auditRecord(), documents: [invoice, receipt] };
    expect(auditRecordDocumentLabel(record)).toEqual({
      label: '1 nota(s) com caminho de arquivo',
      detail: '1 cadastro(s) sem arquivo — regularizar',
    });
    expect(auditDocumentCoverage([record])).toEqual({
      registered: 2, withPath: 1, withoutPath: 1,
    });
  });

  it('contabiliza apenas uma vez documento compartilhado entre duas referências', () => {
    const shared = { ...auditDoc(), storagePath: '' };
    const first = auditRecord('purchase:p1', shared);
    const second = auditRecord('purchase:p2', shared);
    expect(auditDocumentCoverage([first, second])).toEqual({
      registered: 1, withPath: 0, withoutPath: 1,
    });
  });

  it('distingue cadastro vazio de recibo com caminho de arquivo', () => {
    expect(auditRecordDocumentLabel({ ...auditRecord(), documents: [] })).toEqual({
      label: 'Sem nota ou recibo',
      detail: 'Nenhum documento fiscal cadastrado',
    });
    expect(auditRecordDocumentLabel(
      { ...auditRecord(), documents: [{ ...auditDoc(), type: 'receipt' }] },
    )).toEqual({
      label: 'Recibo(s) com caminho de arquivo',
      detail: 'Conteúdo será conferido ao gerar',
    });
  });
});
