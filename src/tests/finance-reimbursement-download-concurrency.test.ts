import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReimbursementZipAttachments } from '../data/exports/finance-reimbursement-export';
import type { ReimbursementFiscalDocument, ReimbursementPaymentProof } from '../domain/finance-reimbursement';

const fiscal = (id: string): ReimbursementFiscalDocument => ({
  id,
  source: 'purchase',
  type: 'invoice',
  name: id + '.pdf',
  number: null,
  storagePath: 'docs/' + id + '.pdf',
  needsStoreReview: false,
});

afterEach(() => vi.unstubAllGlobals());

describe('downloads do ZIP de reembolso com concorrência limitada', () => {
  it('baixa cada anexo único uma vez, no máximo quatro simultâneos, com ordem estável', async () => {
    const documents = Array.from({ length: 10 }, (_, index) => fiscal('doc-' + index));
    const plannedNames = new Map(documents.map((doc) => [
      'purchase:' + doc.id, 'Notas_e_Recibos/' + doc.id + '.pdf',
    ]));
    let active = 0;
    let maxActive = 0;
    const fakeFetch = vi.fn(async (url: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      // Pending requests overlap without relying on timers or external network.
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return {
        ok: !url.endsWith('doc-7'),
        status: url.endsWith('doc-7') ? 404 : 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });
    vi.stubGlobal('fetch', fakeFetch);
    const sign = vi.fn(async (doc: ReimbursementFiscalDocument | ReimbursementPaymentProof) => {
      if (doc.id === 'doc-3') throw new Error('Objeto ausente do Storage DEV');
      return 'https://storage.invalid/' + doc.id;
    });
    const result = await fetchReimbursementZipAttachments(
      [...documents, documents[0]], plannedNames, sign,
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(sign).toHaveBeenCalledTimes(10);
    expect(fakeFetch).toHaveBeenCalledTimes(9);
    expect([...result.unavailable].sort()).toEqual(['purchase:doc-3', 'purchase:doc-7']);
    expect(result.downloaded).toHaveLength(8);
    expect(result.downloaded.map((entry) => entry.key)).toEqual(
      documents.filter((doc) => !['doc-3', 'doc-7'].includes(doc.id))
        .map((doc) => 'purchase:' + doc.id),
    );
    expect(result.downloaded.every((item) => item.bytes.byteLength === 3)).toBe(true);
    expect(result.downloaded[0].filename).toBe('Notas_e_Recibos/doc-0.pdf');
  });

  it('sinaliza falta do nome no ZIP sem solicitar URL nem ocultar a falha', async () => {
    const first = fiscal('missing-filename');
    const sign = vi.fn(async () => 'https://storage.invalid/file');
    const fakeFetch = vi.fn();
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchReimbursementZipAttachments([first], new Map(), sign);
    expect(result.downloaded).toEqual([]);
    expect([...result.unavailable]).toEqual(['purchase:missing-filename']);
    expect(sign).not.toHaveBeenCalled();
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('não interrompe o ZIP quando todos os documentos do Storage estiverem indisponíveis', async () => {
    const documents = Array.from({ length: 4 }, (_, index) => fiscal('missing-' + index));
    const names = new Map(documents.map((doc) => [
      'purchase:' + doc.id, 'Notas_e_Recibos/' + doc.id + '.pdf',
    ]));
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchReimbursementZipAttachments(
      documents,
      names,
      async (doc) => 'https://storage.invalid/' + doc.id,
    );
    expect(result.downloaded).toEqual([]);
    expect(result.unavailable.size).toBe(4);
    expect(fakeFetch).toHaveBeenCalledTimes(4);
  });
});
