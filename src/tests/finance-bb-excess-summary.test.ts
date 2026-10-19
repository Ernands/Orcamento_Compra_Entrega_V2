import { describe, expect, it } from 'vitest';
import page from '../pages/finance-page.tsx?raw';
import styles from '../pages/finance-page.css?raw';

describe('saldo disponível / excedente no resumo executivo', () => {
  it('mostra Excedente positivo e vermelho quando o orçamento ultrapassa a Verba BB', () => {
    expect(page).toContain('availableBbCents < 0n');
    expect(page).toContain('Excedente: ${formatBRL(-availableBbCents)}');
    expect(styles).toContain('.finance-bb-available.is-negative');
    expect(styles).toContain('color: #a33a32');
  });

  it('mantém Disponível BB quando há saldo positivo ou zero', () => {
    expect(page).toContain('Disponível BB: ${formatBRL(availableBbCents)}');
    expect(styles).toContain('.finance-bb-available.is-positive');
  });

  it('não duplica o alerta no cartão Orçado total do resumo executivo', () => {
    expect(page).not.toContain('Atenção: orçamento');
    expect(page).not.toContain('className="finance-budget-alert"');
    expect(styles).not.toContain('.finance-budget-alert {');
  });
});
