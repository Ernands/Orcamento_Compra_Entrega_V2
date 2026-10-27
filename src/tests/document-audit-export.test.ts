// @vitest-environment node
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import {
  auditFileNames,
  createAuditWorkbook,
  generateAuditPackage,
} from '../data/exports/document-audit-export';
import { ACCEPTED_AUDIT_RECIPIENTS } from '../domain/document-audit-recipients';
import { buildAuditFindings } from '../domain/document-audit';
import { emptyReading, readFiscalXml } from '../domain/fiscal-document-reading';
import { auditStore, auditXml, auditDoc, auditRecord, auditFile } from './fixtures/document-audit';
import type { AuditDocument } from '../domain/document-audit-types';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
});
afterEach(() => vi.unstubAllGlobals());

describe('Excel e ZIP de conferência', () => {
  it('gera exatamente três abas com valores, contexto e links locais', async () => {
    const records = [auditRecord()],
      files = [auditFile()];
    const findings = buildAuditFindings({
      records,
      files,
      store: auditStore,
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
    });
    const bytes = await createAuditWorkbook({
      records,
      files,
      findings,
      store: auditStore,
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
      generatedAt: new Date('2026-10-27T12:00:00Z'),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Itens do sistema',
      'Notas fiscais',
      'Conferência e divergências',
    ]);
    const system = workbook.getWorksheet('Itens do sistema')!;
    expect(system.getCell('P8').value).toBe(15);
    expect(system.getCell('Q8').value).toBe(2.5);
    expect(system.getCell('U9').value).toBe(112.5);
    expect(system.getCell('V9').value).toBe(112.5);
    const fiscal = workbook.getWorksheet('Notas fiscais')!;
    expect(fiscal.getCell('B8').value).toMatchObject({ hyperlink: files[0].path });
    expect(fiscal.getCell('AJ8').value).toBe(112.5);
    expect(fiscal.getCell('AJ9').value).toBeNull();
    expect(fiscal.getCell('R8').value).toBe('Thiago Lima Perdigao');
    expect(fiscal.getCell('AE9').value).toBe('Não verificável');
    expect(workbook.worksheets.every((sheet) => sheet.views[0].showGridLines === false)).toBe(true);
  });
  it('reutiliza nomes do reembolso, preserva extensão e evita colisão de nomes', () => {
    const names = [...auditFileNames([auditDoc(), auditDoc('doc2')]).values()];
    expect(names[0]).toBe('Notas_e_Recibos/Nota_Fornecedor_CMP-TESTE1.xml');
    expect(names[1]).toBe('Notas_e_Recibos/Nota_Fornecedor_CMP-TESTE1_1.xml');
  });
  it('baixa todos os originais antes de ler os documentos e construir o resultado', async () => {
    const first = auditDoc();
    const second = auditDoc('doc2');
    const events: string[] = [];
    const progress: string[] = [];
    const result = await generateAuditPackage({
      store: auditStore,
      records: [{ ...auditRecord(), documents: [first, second] }],
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
      ocr: false,
      getSignedUrl: vi.fn(),
      progress: (message) => progress.push(message),
      fetchDocument: (doc) => {
        events.push(`download:${doc.id}`);
        return Promise.resolve(new TextEncoder().encode(doc.id).buffer);
      },
      reader: {
        read: vi.fn((_bytes: ArrayBuffer, doc: AuditDocument) => {
          events.push(`read:${doc.id}`);
          return Promise.resolve(readFiscalXml(auditXml()));
        }),
        dispose: vi.fn(() => Promise.resolve()),
      },
    });
    expect(events).toEqual([
      'download:doc-1',
      'download:doc2',
      'read:doc-1',
      'read:doc2',
    ]);
    expect(progress.some((step) => step.startsWith('Etapa 1/3'))).toBe(true);
    expect(progress.some((step) => step.startsWith('Etapa 2/3'))).toBe(true);
    expect(progress.some((step) => step.startsWith('Etapa 3/3'))).toBe(true);
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((name) => name.endsWith('.xlsx'))).toHaveLength(1);
    expect(Object.keys(zip.files).filter((name) => name.startsWith('Notas_e_Recibos/') && !zip.files[name].dir)).toHaveLength(2);
  });
  it('inclui o original uma vez por conteúdo e mantém ambos os vínculos', async () => {
    const a = auditDoc(),
      b = auditDoc('doc2');
    const record = { ...auditRecord(), documents: [a, b] };
    const original = new TextEncoder().encode(auditXml());
    const read = vi.fn(() => Promise.resolve(readFiscalXml(auditXml())));
    const result = await generateAuditPackage({
      store: auditStore,
      records: [record],
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
      ocr: false,
      getSignedUrl: vi.fn(),
      fetchDocument: () => Promise.resolve(original.buffer),
      reader: { read, dispose: vi.fn(() => Promise.resolve()) },
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.files).toHaveLength(2);
    expect(result.files[1].duplicateOf).toBe(a.key);
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const documents = Object.keys(zip.files).filter(
      (name) => name.startsWith('Notas_e_Recibos/') && !zip.files[name].dir,
    );
    expect(documents).toHaveLength(1);
    expect(await zip.file(documents[0])!.async('uint8array')).toEqual(original);
    expect(Object.keys(zip.files).filter((name) => name.endsWith('.xlsx'))).toHaveLength(1);
    expect(result.summary.readableInvoiceCents).toBe(11250n);
  });
  it('falha de download aparece na planilha e não é confundida com documento ausente', async () => {
    const result = await generateAuditPackage({
      store: auditStore,
      records: [auditRecord()],
      recipients: ACCEPTED_AUDIT_RECIPIENTS,
      ocr: false,
      getSignedUrl: vi.fn(),
      fetchDocument: () => Promise.reject(new Error('https://url-assinada?token=sensivel')),
      reader: {
        read: vi.fn(() => Promise.resolve(emptyReading('unsupported', 'Não usado'))),
        dispose: vi.fn(() => Promise.resolve()),
      },
    });
    expect(result.summary.failedFiles).toBe(1);
    expect(result.files[0].path).toBeNull();
    expect(result.findings.some((finding) => finding.category === 'Download')).toBe(true);
    expect(
      JSON.stringify(result.files, (_: string, val: unknown) =>
        typeof val === 'bigint' ? String(val) : val,
      ),
    ).not.toContain('token=sensivel');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file('Leia-me.txt')!.async('text')).toContain('Falhas de download: 1');
  });
  it('interrompe exportação cancelada sem gerar arquivo parcial como concluído', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      generateAuditPackage({
        store: auditStore,
        records: [auditRecord()],
        recipients: ACCEPTED_AUDIT_RECIPIENTS,
        ocr: false,
        getSignedUrl: vi.fn(),
        signal: abort.signal,
        reader: { read: vi.fn(), dispose: vi.fn(() => Promise.resolve()) },
      }),
    ).rejects.toThrow('Geração cancelada');
  });
});
