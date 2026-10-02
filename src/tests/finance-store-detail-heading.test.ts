import { describe, expect, it } from 'vitest';
import page from '../pages/finance-store-detail-page.tsx?raw';
import styles from '../pages/finance-store-detail-page.css?raw';

describe('finance store detail heading', () => {
  it('keeps the back link before the finance context label', () => {
    const backIndex = page.indexOf('Voltar para Visão Geral');
    const contextIndex = page.indexOf('Financeiro · Detalhe da loja');
    expect(backIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeGreaterThan(backIndex);
  });

  it('stacks the identity content vertically', () => {
    expect(styles).toContain('.finance-store-detail__identity');
    expect(styles).toContain('display: grid');
    expect(styles).toContain('justify-items: start');
  });

  it('desabilita Ver pagamentos quando nao ha linha financeira relacionada', () => {
    expect(page).toContain('const hasPaymentRowsFor');
    expect(page).toContain('finance-store-detail__payment-link is-disabled');
    expect(page).toContain('Nenhum pagamento relacionado a este item');
    expect(page).toContain('Nenhum pagamento relacionado a este serviço');
    expect(styles).toContain('.finance-store-detail__payment-link:disabled');
  });

});
