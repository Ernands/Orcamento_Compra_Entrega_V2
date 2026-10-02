import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';
import styles from '../pages/finance-payments-page.css?raw';

describe('finance payments filtered summary', () => {
  it('recalcula os indicadores e origem com o mesmo escopo dos filtros', () => {
    expect(page).toContain('const summaryRows = useMemo');
    expect(page).toContain('financePaymentTotals(summaryRows)');
    expect(page).toContain('financePaymentOriginSummary(summaryRows)');
    expect(page).toContain('.filter((row) => row.status === view)');
  });

  it('indica no topo quando existem filtros ativos', () => {
    expect(page).toContain('finance-payments-filter-indicator');
    expect(page).toContain('filtros ativos');
    expect(styles).toContain('.finance-payments-filter-indicator');
  });
});
