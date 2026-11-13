import { describe, expect, it } from 'vitest';
import { normalizeFiscalDocumentNumber } from '../domain/fiscal-document-number';

describe('chave de comparação de números fiscais', () => {
  it('ignora variação de letras e espaços internos/externos', () => {
    expect(normalizeFiscalDocumentNumber('NF-DEV-4587')).toBe('NF-DEV-4587');
    expect(normalizeFiscalDocumentNumber('  nf - dev - 4 5 8 7  ')).toBe('NF-DEV-4587');
    expect(normalizeFiscalDocumentNumber('\tn f - d e v - 4 5 8 7\n')).toBe('NF-DEV-4587');
  });

  it('não remove zeros, hífens, barras nem pontuação fiscal', () => {
    expect(normalizeFiscalDocumentNumber('nf-000123')).toBe('NF-000123');
    expect(normalizeFiscalDocumentNumber('NF/000123')).toBe('NF/000123');
    expect(normalizeFiscalDocumentNumber('NF000123')).toBe('NF000123');
    expect(normalizeFiscalDocumentNumber('NF-000123')).not.toBe(
      normalizeFiscalDocumentNumber('NF000123'),
    );
  });

  it('trata metadados sem número como ausência de candidato', () => {
    expect(normalizeFiscalDocumentNumber(null)).toBe('');
    expect(normalizeFiscalDocumentNumber(undefined)).toBe('');
    expect(normalizeFiscalDocumentNumber(' \t\n ')).toBe('');
  });
});
