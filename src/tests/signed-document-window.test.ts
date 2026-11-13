import { describe, expect, it, vi } from 'vitest';
import { openSignedDocumentInNewTab } from '../lib/signed-document-window';

function mockTab() {
  const replace = vi.fn();
  const close = vi.fn();
  const tab = {
    opener: { name: 'parent' },
    closed: false,
    location: { replace },
    close,
  };
  return { tab, replace, close };
}

describe('abertura segura de documentos assinados em nova aba', () => {
  it('abre aba antes da consulta assíncrona, isola opener e redireciona para URL', async () => {
    const { tab, replace, close } = mockTab();
    let resolveUrl!: (url: string) => void;
    const pending = new Promise<string>((resolve) => { resolveUrl = resolve; });
    const createSignedUrl = vi.fn(() => pending);
    const openWindow = vi.fn(() => tab as unknown as Window);

    const promise = openSignedDocumentInNewTab(createSignedUrl, openWindow);
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(tab.opener).toBeNull();
    expect(replace).not.toHaveBeenCalled();

    resolveUrl('https://storage.example.test/object?token=valid');
    await promise;
    expect(replace).toHaveBeenCalledWith('https://storage.example.test/object?token=valid');
    expect(close).not.toHaveBeenCalled();
  });

  it('não tenta consultar Storage se pop-up for bloqueado', async () => {
    const createSignedUrl = vi.fn(() => Promise.resolve('https://storage.example.test/a'));
    await expect(openSignedDocumentInNewTab(createSignedUrl, () => null))
      .rejects.toThrow('Permita pop-ups');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('fecha aba em caso de erro de acesso, sem abrir URL inválida', async () => {
    const { tab, replace, close } = mockTab();
    const error = new Error('Sem acesso ao arquivo');
    await expect(openSignedDocumentInNewTab(
      () => Promise.reject(error), () => tab as unknown as Window,
    )).rejects.toBe(error);
    expect(replace).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(tab.opener).toBeNull();
  });

  it('impede navegação sem URL e limpa a aba de espera', async () => {
    const { tab, replace, close } = mockTab();
    await expect(openSignedDocumentInNewTab(
      () => Promise.resolve('   '), () => tab as unknown as Window,
    )).rejects.toThrow('link do documento');
    expect(replace).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('não redireciona se o usuário fechar a aba antes da assinatura', async () => {
    const { tab, replace } = mockTab();
    const signed = vi.fn(async () => {
      await Promise.resolve();
      tab.closed = true;
      return 'https://storage.example.test/a';
    });
    await expect(openSignedDocumentInNewTab(
      signed, () => tab as unknown as Window,
    )).rejects.toThrow('aba foi fechada');
    expect(replace).not.toHaveBeenCalled();
  });
});
