import { describe, expect, it } from 'vitest';
import { exportErrorMessage } from '../data/exports/export-errors';

describe('exportErrorMessage', () => {
  const fallback = 'Não foi possível gerar o arquivo.';

  it.each([
    'Failed to fetch dynamically imported module: https://implanta-27.netlify.app/assets/exceljs.min-By4GIYmB.js',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'ChunkLoadError: Loading chunk 5 failed',
    'Failed to load module script: Expected a JavaScript module script',
  ])('explica o módulo indisponível sem expor erro técnico: %s', (message) => {
    const actual = exportErrorMessage(new TypeError(message), fallback);
    expect(actual).toContain('Ctrl + Shift + R');
    expect(actual).toContain('Salve qualquer formulário');
    expect(actual).not.toContain('Failed to fetch');
  });

  it('preserva mensagens de outros erros de exportação', () => {
    expect(exportErrorMessage(new Error('Sem permissão para exportar'), fallback)).toBe(
      'Sem permissão para exportar',
    );
  });

  it('utiliza a mensagem alternativa quando erro não tem descrição', () => {
    expect(exportErrorMessage({}, fallback)).toBe(fallback);
  });
});
