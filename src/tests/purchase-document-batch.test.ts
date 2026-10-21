import { describe, expect, it, vi } from 'vitest';
import { uploadPurchaseDocumentsBatch } from '../domain/purchase-document-batch';
import page from '../pages/supply-purchases-page.tsx?raw';

describe('anexos multiplos em compra ja cadastrada', () => {
  it('mantem selecao multipla e controles de progresso no formulario de documentos', () => {
    const modal = page.split('function DocumentsModal(')[1].split('type PurchaseManagementTab')[0];
    expect(modal).toContain('type="file" multiple');
    expect(modal).toContain('Array.from(event.target.files || [])');
    expect(modal).toContain('uploadPurchaseDocumentsBatch(pending');
    expect(modal).toContain('setFiles(result.failed.map((entry) => entry.file))');
    expect(modal).toContain('Reenviar');
    expect(modal).toContain('setUploadProgress({ processed, total })');
    expect(modal).toContain('lastDocumentContextRef').toBe(false);
    expect(modal).toContain('documentContextRef.current === context');
    expect(modal).toContain('Numero, Data e Valor');
    expect(modal).toContain('purchaseOrderId, file, description, documentType');
  });

  it('envia 34 notas, reporta cada uma e nao perde nenhuma', async () => {
    const files = Array.from({ length: 34 }, (_, i) => `nota-${String(i + 1).padStart(2, '0')}.pdf`);
    const uploaded: string[] = [];
    const progress: string[] = [];
    const result = await uploadPurchaseDocumentsBatch(files, async (file) => {
      uploaded.push(file);
    }, (processed, total) => progress.push(`${processed}/${total}`));
    expect(uploaded).toEqual(files);
    expect(result.uploaded).toEqual(files);
    expect(result.failed).toEqual([]);
    expect(progress).toHaveLength(34);
    expect(progress[0]).toBe('1/34');
    expect(progress[33]).toBe('34/34');
  });

  it('em falha parcial envia apenas arquivos que falharam, sem repetir os 31 ja cadastrados', async () => {
    const files = Array.from({ length: 34 }, (_, i) => `nota-${i + 1}.pdf`);
    const attempts = new Map<string, number>();
    const worker = vi.fn(async (file: string) => {
      attempts.set(file, (attempts.get(file) || 0) + 1);
      if (attempts.get(file) === 1 && ['nota-4.pdf', 'nota-12.pdf', 'nota-30.pdf'].includes(file)) {
        throw new Error('Erro ao registrar nota');
      }
    });
    const first = await uploadPurchaseDocumentsBatch(files, worker);
    expect(first.uploaded).toHaveLength(31);
    expect(first.failed.map((failure) => failure.file)).toEqual([
      'nota-4.pdf', 'nota-12.pdf', 'nota-30.pdf',
    ]);
    expect(first.failed[0].reason).toBe('Erro ao registrar nota');
    const retry = await uploadPurchaseDocumentsBatch(first.failed.map((failure) => failure.file), worker);
    expect(retry.uploaded).toHaveLength(3);
    expect(retry.failed).toEqual([]);
    expect(worker).toHaveBeenCalledTimes(37);
    expect(attempts.get('nota-1.pdf')).toBe(1);
    expect(attempts.get('nota-4.pdf')).toBe(2);
  });

  it('continua o lote quando o upload rejeita valores nao-Error', async () => {
    const result = await uploadPurchaseDocumentsBatch(['a.pdf', 'b.pdf'], async (file) => {
      if (file === 'a.pdf') throw null;
    });
    expect(result.uploaded).toEqual(['b.pdf']);
    expect(result.failed).toEqual([{ file: 'a.pdf', reason: 'Nao foi possivel enviar o documento.' }]);
  });
});
