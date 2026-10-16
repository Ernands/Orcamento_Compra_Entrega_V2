import { describe, expect, it } from 'vitest';
import page from '../pages/finance-page.tsx?raw';
import styles from '../pages/finance-page.css?raw';

describe('finance store budget variance column', () => {
  it('retains the budget variance to BB in the existing separate column', () => {
    expect(page).toContain('<th>Dif. Em Relação a Verba</th>');
    expect(page).toContain('row.budgetVarianceToBbCents < 0n');
    expect(page).toContain('formatBRL(row.budgetVarianceToBbCents)');
    expect(page).toContain('finance-difference--negative');
    expect(page).toContain('finance-difference--positive');
  });

  it('does not duplicate a budget variance notice below Orçado total', () => {
    expect(page).toContain('<strong>{formatBRL(row.budgetTotalCents)}</strong>');
    expect(page).not.toContain('Acima da verba em');
    expect(page).not.toContain('className="finance-store-budget-alert"');
    expect(styles).not.toContain('.finance-store-budget-alert {');
  });
});
