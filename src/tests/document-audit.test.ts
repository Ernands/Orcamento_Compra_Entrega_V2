import { describe, expect, it } from 'vitest';
import { buildAuditRecords } from '../domain/document-audit-records';
import { auditSummary, buildAuditFindings } from '../domain/document-audit';
import { ACCEPTED_AUDIT_RECIPIENTS } from '../domain/document-audit-recipients';
import {
  emptyReading,
  fiscalCents,
  readFiscalText,
  readFiscalXml,
} from '../domain/fiscal-document-reading';
import type { AuditFile, AuditRecord } from '../domain/document-audit-types';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { WorkService } from '../domain/works-types';

import { auditStore, auditXml, auditDoc, auditRecord, auditFile } from './fixtures/document-audit';

const findings = (
  record: AuditRecord,
  files: AuditFile[],
  recipients = ACCEPTED_AUDIT_RECIPIENTS,
) => buildAuditFindings({ records: [record], files, store: auditStore, recipients });

describe('conferência documental sem inferência de dados', () => {
  it('lê XML e preserva itens, tributos e total sem adicionar ICMS embutido', () => {
    const reading = readFiscalXml(auditXml());
    expect(reading.reliable).toBe(true);
    expect(reading.totalCents).toBe(11250n);
    expect(reading.totals.vICMS).toBe(1800n);
    expect(reading.items[0].quantity).toBe('1.0000');
    expect(reading.items[0].insuranceCents).toBeNull();
    const result = findings(auditRecord(), [auditFile()]);
    expect(result.find((row) => row.category === 'Total global das referências')).toMatchObject({
      status: 'Conferido',
      differenceCents: 0n,
    });
    expect(
      result.find((row) => row.category === 'Quantidade / preço / subtotal do item')?.status,
    ).toBe('Conferido');
  });
  it.each(['TERCEIRIZAÇÕES', 'Thiago Lima Perdigão'])(
    'aceita %s pelo nome informado e não inventa CNPJ/CPF',
    (name) => {
      const result = findings(auditRecord(), [
        auditFile(auditDoc(), readFiscalXml(auditXml(name))),
      ]);
      expect(
        result.find((row) => row.category === 'Nome / razão social do destinatário')?.status,
      ).toBe('Conferido');
      expect(result.find((row) => row.category === 'CNPJ/CPF do destinatário')?.status).toBe(
        'Não verificável',
      );
    },
  );
  it('aponta outro destinatário e divergência de um centavo sem tolerância oculta', () => {
    const result = findings(auditRecord(), [
      auditFile(auditDoc(), readFiscalXml(auditXml('OUTRA PESSOA', '112.51'))),
    ]);
    expect(
      result.find((row) => row.category === 'Nome / razão social do destinatário')?.status,
    ).toBe('Divergência');
    expect(
      result.find((row) => row.category === 'Total global das referências')?.differenceCents,
    ).toBe(1n);
  });
  it('diferencia ausência, arquivo inacessível e leitura incompleta', () => {
    expect(
      findings({ ...auditRecord(), documents: [] }, []).some(
        (row) => row.status === 'Sem nota ou recibo',
      ),
    ).toBe(true);
    const failed = {
      ...auditFile(),
      error: 'HTTP 403',
      path: null,
      reading: emptyReading('unavailable', 'HTTP 403'),
    };
    const rows = findings(auditRecord(), [failed]);
    expect(rows.some((row) => row.category === 'Download')).toBe(true);
    expect(rows.some((row) => row.status === 'Sem nota ou recibo')).toBe(false);
    const incomplete = findings(auditRecord(), [
      auditFile(auditDoc(), emptyReading('ocr', 'Ilegível')),
    ]);
    expect(incomplete.some((row) => row.status === 'Sem nota ou recibo')).toBe(false);
    expect(
      incomplete.find((row) => row.category === 'Total global das referências')?.differenceCents,
    ).toBeNull();
  });
  it('não usa município do emitente para acusar erro e distingue faturamento de entrega', () => {
    const read = readFiscalXml(auditXml());
    read.recipient.city = 'Natal';
    read.recipient.state = 'RN';
    const rows = findings(auditRecord(), [auditFile(auditDoc(), read)]);
    expect(rows.find((row) => row.category === 'Cidade / destino')?.status).toBe('Revisão manual');
    read.delivery = { ...read.delivery, city: 'Fortaleza', state: 'CE' };
    expect(
      findings(auditRecord(), [auditFile(auditDoc(), read)]).find(
        (row) => row.category === 'Cidade / destino',
      )?.status,
    ).toBe('Divergência');
  });
  it('uma nota pode cobrir duas referências sem comparação/contagem duplicada', () => {
    const doc = auditDoc();
    doc.links.push({ ...doc.links[0], recordId: 'purchase:p2', reference: 'CMP-TESTE2' });
    const a = { ...auditRecord('purchase:p1', doc), totalCents: 5000n, storeCents: 5000n };
    const b = { ...auditRecord('purchase:p2', doc), totalCents: 6250n, storeCents: 6250n };
    const file = auditFile(doc);
    const rows = buildAuditFindings({
      records: [a, b],
      files: [file],
      store: auditStore,
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
    });
    expect(rows.filter((row) => row.category === 'Total global das referências')).toHaveLength(1);
    expect(rows.find((row) => row.category === 'Total global das referências')).toMatchObject({
      status: 'Conferido',
      differenceCents: 0n,
    });
    expect(auditSummary([a, b], [file], 'store-a').readableInvoiceCents).toBe(11250n);
    expect(
      rows.some(
        (row) =>
          row.category === 'Quantidade / preço / subtotal do item' && row.status === 'Conferido',
      ),
    ).toBe(false);
  });
  it('não imputa integralmente documento com referência fora da seleção ou várias lojas', () => {
    const doc = auditDoc();
    doc.links.push({
      ...doc.links[0],
      recordId: 'purchase:p2',
      reference: 'CMP-TESTE2',
      storeIds: ['store-b'],
    });
    const rows = findings(auditRecord('purchase:p1', doc), [auditFile(doc)]);
    expect(rows.find((row) => row.category === 'Documento compartilhado')?.status).toBe(
      'Revisão manual',
    );
    expect(
      rows.find((row) => row.category === 'Total global das referências')?.differenceCents,
    ).toBeNull();
    expect(
      auditSummary([auditRecord()], [auditFile(doc)], 'store-a').attributableInvoiceCents,
    ).toBe(0n);
  });
  it('consolida mesma chave fiscal em arquivos diferentes e preserva o aviso', () => {
    const doc = auditDoc('doc2');
    const files = [auditFile(), { ...auditFile(doc), hash: 'other-hash' }];
    const record = { ...auditRecord(), documents: [auditDoc(), doc] };
    expect(auditSummary([record], files, 'store-a').readableInvoiceCents).toBe(11250n);
    expect(findings(record, files).some((row) => row.category === 'Duplicidade fiscal')).toBe(true);
  });
  it('recibo não vira nota e não soma com a nota do mesmo lançamento', () => {
    const doc = { ...auditDoc(), type: 'receipt' as const };
    const file = auditFile(doc, {
      ...emptyReading('pdf_text', 'Recibo de teste'),
      totalCents: 11250n,
    });
    expect(
      findings(auditRecord('purchase:p1', doc), [file]).some(
        (row) => row.status === 'Documentado por recibo',
      ),
    ).toBe(true);
    expect(
      auditSummary([auditRecord('purchase:p1', doc)], [file], 'store-a').uniqueInvoiceCount,
    ).toBe(0);
  });
  it('OCR permanece provisório e não fornece um falso total conferido', () => {
    const read = readFiscalText(
      'VALOR TOTAL DA NOTA: R$ 112,50\nCNPJ DO DESTINATÁRIO: 00.000.000/0000-00',
      'ocr',
    );
    expect(read.totalCents).toBe(11250n);
    expect(read.reliable).toBe(false);
    expect(
      findings(auditRecord(), [auditFile(auditDoc(), read)]).find(
        (row) => row.category === 'Total global das referências',
      )?.status,
    ).toBe('Não verificável');
    expect(readFiscalText('VALOR TOTAL DA NOTA 1.200', 'pdf_text').totalCents).toBeNull();
  });
  it('não escolhe um valor arbitrário entre arquivos da mesma chave com totais diferentes', () => {
    const a = auditDoc(),
      b = auditDoc('outro');
    const files = [
      auditFile(a),
      {
        ...auditFile(b, readFiscalXml(auditXml('Thiago Lima Perdigao', '112.51'))),
        hash: 'outro-hash',
      },
    ];
    const record = { ...auditRecord(), documents: [a, b] };
    const rows = findings(record, files);
    expect(rows.find((row) => row.category === 'Duplicidade fiscal')?.status).toBe('Divergência');
    expect(
      rows.find((row) => row.category === 'Total global das referências')?.differenceCents,
    ).toBeNull();
    expect(auditSummary([record], files, 'store-a').readableInvoiceCents).toBe(0n);
  });
  it('reconhece linha DANFE completa como leitura provisória e preserva campos não discriminados', () => {
    const reading = readFiscalText(
      'DESTINATARIO: Thiago Lima Perdigao\n1 Item de teste 12345678 010 5102 UN 1,0000 100,0000 100,00',
      'pdf_text',
    );
    expect(reading.recipient.name).toBe('Thiago Lima Perdigao');
    expect(reading.items).toHaveLength(1);
    expect(reading.items[0].productCents).toBe(10000n);
    expect(reading.items[0].freightCents).toBeNull();
    expect(reading.reliable).toBe(false);
  });
  it('metadados de nota em outra referência impedem imputação integral sem provar identidade fiscal', () => {
    const doc = auditDoc();
    doc.possibleLinks = [{ ...doc.links[0], recordId: 'purchase:fora', reference: 'CMP-FORA' }];
    const record = auditRecord('purchase:p1', doc),
      file = auditFile(doc);
    const rows = findings(record, [file]);
    expect(rows.some((row) => row.category === 'Possível documento fora da seleção')).toBe(true);
    expect(
      rows.find((row) => row.category === 'Total global das referências')?.differenceCents,
    ).toBeNull();
    expect(auditSummary([record], [file], 'store-a').attributableInvoiceCents).toBe(0n);
    expect(
      readFiscalText('VALOR TOTAL DA NOTA: 10,00\nVALOR TOTAL DA NOTA: 20,00', 'pdf_text')
        .totalCents,
    ).toBeNull();
  });
  it('rejeita XML inválido/DTD e não preenche campos ausentes', () => {
    expect(readFiscalXml('<NFe>').reliable).toBe(false);
    expect(
      readFiscalXml('<!DOCTYPE x [<!ENTITY test SYSTEM "file:///etc/passwd">]><x/>').evidence,
    ).toBe('');
    expect(fiscalCents('112,50')).toBeNull();
    expect(fiscalCents('112,50', 'br')).toBe(11250n);
  });
});

describe('origem e rateio do sistema', () => {
  function purchase(): PurchaseV2 {
    return {
      id: 'p1',
      code: 'CMP-TESTE1',
      status: 'purchased',
      supplierName: 'Fornecedor',
      approvedTotal: '225.00',
      stores: [{ storeId: 'store-a' }, { storeId: 'store-b' }],
      items: [],
      attachments: [],
      orders: [
        {
          id: 'o1',
          status: 'active',
          lines: [
            {
              id: 'l1',
              itemCode: 'INTERNO',
              itemName: 'Item',
              quantity: '2',
              unit: 'UN',
              unitPrice: '100.00',
              discountAmount: '5.00',
              shippingAmount: '30.00',
              otherCosts: '0',
              lineTotal: '225.00',
              storeDistributionStatus: 'confirmed',
              stores: [
                { storeId: 'store-a', quantity: '1', code: 'A' },
                { storeId: 'store-b', quantity: '1', code: 'B' },
              ],
            },
          ],
        },
      ],
    } as unknown as PurchaseV2;
  }
  it('reutiliza rateio confirmado e distingue valor integral de valor da loja', () => {
    const p = purchase();
    const before = JSON.stringify(p);
    const [record] = buildAuditRecords('store-a', [p], []);
    expect(record.totalCents).toBe(22500n);
    expect(record.storeCents).toBe(11250n);
    expect(record.items[0].freightCents).toBe(3000n);
    expect(record.items[0].storeQuantity).toBe('1');
    expect(JSON.stringify(p)).toBe(before);
  });
  it('não cria rateio ou total quando a informação está pendente', () => {
    const p = purchase();
    p.orders[0].lines[0].storeDistributionStatus = 'pending';
    p.orders[0].lines[0].lineTotal = null;
    const [record] = buildAuditRecords('store-a', [p], []);
    expect(record.totalCents).toBeNull();
    expect(record.storeCents).toBeNull();
  });
  it('inclui obras sem pagamento e preserva contratado e componentes sem repetição', () => {
    const work = {
      id: 'w1',
      code: 'OBR-TESTE1',
      storeId: 'store-a',
      status: 'contracted',
      contractedAmount: '100.00',
      budgetAmount: '120.00',
      description: 'Serviço',
      documents: [],
      payments: [],
      components: [{ id: 'c1', amount: '100.00', category: 'Serviço' }],
    } as unknown as WorkService;
    const [record] = buildAuditRecords('store-a', [], [work]);
    expect(record.totalCents).toBe(10000n);
    expect(record.items).toHaveLength(1);
  });
});
