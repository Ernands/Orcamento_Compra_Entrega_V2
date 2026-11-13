import { describe, expect, it } from 'vitest';
import { supplementAuditCrossStoreLinks, type AuditExternalCandidate } from '../domain/document-audit-cross-store';
import { auditDoc, auditRecord } from './fixtures/document-audit';
import { buildAuditFindings } from '../domain/document-audit';
import { ACCEPTED_AUDIT_RECIPIENTS } from '../domain/document-audit-recipients';
import { auditStore, auditFile } from './fixtures/document-audit';

function candidate(
  overrides: Partial<AuditExternalCandidate> = {},
): AuditExternalCandidate {
  return {
    key: 'purchase:outside.pdf',
    source: 'purchase',
    type: 'invoice',
    number: 'NF-123',
    link: {
      recordId: 'purchase:other-store',
      reference: 'CMP-OUTRA-LOJA',
      supplier: 'FORNECEDOR',
      storeIds: ['store-b'],
      explicitStores: true,
      orderId: null,
    },
    ...overrides,
  };
}

function baseRecord() {
  const doc = { ...auditDoc(), number: 'NF-123', links: [
    { ...auditDoc().links[0], supplier: 'Fornecedor' },
  ] };
  return auditRecord('purchase:p1', doc);
}

describe('indícios fiscais entre lojas preservados sob RLS', () => {
  it('mesmo número/tipo/fornecedor em CMP externa é só revisão manual, não prova', () => {
    const [record] = supplementAuditCrossStoreLinks([baseRecord()], [candidate()]);
    expect(record.documents[0].links).toHaveLength(1);
    expect(record.documents[0].possibleLinks?.map((link) => link.reference))
      .toEqual(['CMP-OUTRA-LOJA']);
    const rows = buildAuditFindings({
      records: [record], files: [auditFile(record.documents[0])],
      store: auditStore, recipients: ACCEPTED_AUDIT_RECIPIENTS,
    });
    expect(rows.find((row) => row.category === 'Possível documento fora da seleção')?.status)
      .toBe('Revisão manual');
    expect(rows.find((row) => row.category === 'Possível documento fora da seleção')?.evidence)
      .toContain('CMP-OUTRA-LOJA');
  });

  it('mesmo caminho de arquivo revela vínculo confirmado com CMP externa', () => {
    const record = baseRecord();
    const [result] = supplementAuditCrossStoreLinks([record], [candidate({
      key: record.documents[0].key,
      number: 'DIFERENTE',
      link: { ...candidate().link, orderId: 'another-order' },
    })]);
    expect(result.documents[0].links.map((link) => link.reference))
      .toEqual(['CMP-TESTE1', 'CMP-OUTRA-LOJA']);
    expect(result.documents[0].possibleLinks).toEqual([]);
    // The original input is untouched.
    expect(record.documents[0].links).toHaveLength(1);
  });

  it('RLS sem candidatos não inventa duplicidade', () => {
    const record = baseRecord();
    expect(supplementAuditCrossStoreLinks([record], [] )).toEqual([record]);
  });

  it('ignora tipo diferente e fornecedor diferente e não mistura referências', () => {
    const [result] = supplementAuditCrossStoreLinks([baseRecord()], [
      candidate({ type: 'receipt' }),
      candidate({ link: { ...candidate().link, supplier: 'Outro fornecedor' } }),
      candidate({ number: 'OUTRA-NOTA' }),
    ]);
    expect(result.documents[0].possibleLinks).toEqual([]);
  });

  it('normaliza diferenças de caixa/espaço sem multiplicar o mesmo vínculo', () => {
    const [result] = supplementAuditCrossStoreLinks([baseRecord()], [
      candidate({ number: '  nf-123 ' }),
      candidate({ number: 'nf-123' }),
      candidate({ number: ' NF-123 ' }),
    ]);
    expect(result.documents[0].possibleLinks).toHaveLength(1);
  });

  it('mantém o mesmo anexo compartilhado em duas referências sem duplicar links', () => {
    const original = baseRecord();
    const other = { ...auditRecord('purchase:p2', original.documents[0]), documents: [original.documents[0]] };
    const [first, second] = supplementAuditCrossStoreLinks([original, other], [candidate()]);
    expect(first.documents[0]).toBe(second.documents[0]);
    expect(first.documents[0].possibleLinks).toHaveLength(1);
  });
});
