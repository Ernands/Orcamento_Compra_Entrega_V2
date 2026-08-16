import { describe, expect, it } from 'vitest';
import {
  formatCpfInput,
  isValidCpf,
  maskCpfLast4,
  normalizeCpf,
} from '../../supabase/functions/_shared/cpf';

describe('CPF', () => {
  it('normaliza mascara e caracteres nao numericos', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpf('CPF 529 982 247 25')).toBe('52998224725');
  });

  it('limita a normalizacao a 11 digitos', () => {
    expect(normalizeCpf('52998224725123')).toBe('52998224725');
  });

  it.each(['52998224725', '11144477735', '93541134780'])('aceita CPF valido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['', '123', '52998224724', '11111111111', '00000000000'])(
    'rejeita CPF invalido %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it('formata progressivamente sem alterar o valor numerico', () => {
    expect(formatCpfInput('52998224725')).toBe('529.982.247-25');
    expect(formatCpfInput('5299')).toBe('529.9');
  });

  it('mascara a listagem administrativa mantendo apenas quatro digitos', () => {
    expect(maskCpfLast4('4725')).toBe('***.***.*47-25');
  });
});
