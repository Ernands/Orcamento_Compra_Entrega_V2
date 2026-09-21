import { describe, expect, it } from 'vitest';
import page from '../pages/finance-page.tsx?raw';
import styles from '../pages/finance-page.css?raw';

describe('finance store budget excess alert', () => {
  it('shows the alert only when total budget exceeds the BB allowance', () => {
    expect(page).toContain('row.budgetTotalCents > row.budgetBbCents');
    expect(page).toContain('Acima da verba em');
    expect(page).toContain('row.budgetTotalCents - row.budgetBbCents');
  });

  it('keeps the alert compact and visually negative', () => {
    expect(styles).toContain('.finance-store-budget-alert');
    expect(styles).toContain('color: #9b342b');
    expect(styles).toContain('font-size: 0.58rem');
  });
});
