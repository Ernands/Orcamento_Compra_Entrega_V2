import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';

describe('auditoria financeira sob demanda na Preview #85', () => {
  it('não dispara RPCs da auditoria durante o carregamento normal de Pagamentos', () => {
    expect(page).toContain("window.location.hostname.startsWith('deploy-preview-85--')");
    expect(page).toContain("searchParams.get('financeParity') !== '0'");
    expect(page).toContain("const financeParityAuto = searchParams.get('financeParity') === '1'");
    expect(page).toContain('const [financeParityRunId, setFinanceParityRunId] = useState(0)');
    expect(page).toContain('(!financeParityAuto && financeParityRunId === 0)');
    expect(page).toContain('if (!financeParityEnabled || loading || error ||');
  });

  it('permite conferir novamente sem modificar pagamentos e bloqueia clique simultâneo', () => {
    expect(page).toContain('onClick={() => setFinanceParityRunId((id) => id + 1)}');
    expect(page).toContain('disabled={financeParityLoading}');
    expect(page).toContain('Executar auditoria');
    expect(page).toContain('Reexecutar auditoria');
    expect(page).toContain('runFinancePreviewParity(purchases, works, rows)');
    expect(page).toContain('Diagnóstico sob demanda');
  });

  it('não transfere a projeção SQL experimental para KPIs nem exportações', () => {
    expect(page).toContain('const totals = useMemo(() => financePaymentTotals(summaryRows)');
    expect(page).toContain('rows={filteredRows}');
    expect(page).toContain('summaryRows={summaryRows}');
    expect(page).not.toContain('setPurchases(financeParity');
    expect(page).not.toContain('setWorks(financeParity');
  });
});
