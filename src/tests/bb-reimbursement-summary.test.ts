import { describe, expect, it } from 'vitest';
import { buildBbReimbursementSummary } from '../domain/bb-reimbursement-summary';
import type { ForecastFilters } from '../domain/budget-forecast';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { ManagerialSettlement } from '../domain/managerial-reimbursements';
import type { Store } from '../domain/types';
import pageSource from '../pages/budget-forecast-dashboard-page.tsx?raw';
import cssSource from '../pages/budget-forecast-dashboard.css?raw';
import repositorySource from '../data/finance/managerial-reimbursements-repository.ts?raw';
import waveShellSource from '../app/app-shell.tsx?raw';

const filter: ForecastFilters = {
  state: '', storeId: '', operation: 'all', implantation: 'all',
};
const store = (id: string, waveId: number, status: 'active' | 'inactive' = 'active'): Store => ({
  id, code: id, name: id, city: 'Cidade', state: waveId === 2 ? 'MG' : 'CE',
  status, financialClosure: { state: 'open' }, waveId,
} as unknown as Store);
const finance = (s: Store): FinanceOverviewStoreRow => ({
  storeId: s.id, code: s.code, budgetBbCents: 5000000n,
  budgetTotalCents: 0n, realizedTotalCents: 0n,
} as FinanceOverviewStoreRow);
const wave1 = Array.from({ length: 28 }, (_, i) =>
  store('LOJ-' + String(i + 1).padStart(3, '0'), 1, i >= 26 ? 'inactive' : 'active'));
const wave2 = Array.from({ length: 5 }, (_, i) => store('LOJ-' + (i + 29), 2));
const overview = [...wave1, ...wave2].map(finance);
const settlements = new Map<string, ManagerialSettlement>([
  [wave1[5].id, { receivedCents: 5000000n, absorbedCents: 400000n }],
  [wave1[24].id, { receivedCents: 5000000n, absorbedCents: 200000n }],
  [wave1[26].id, { receivedCents: 5000000n, absorbedCents: 0n }],
  [wave2[0].id, { receivedCents: 2000000n, absorbedCents: 300000n }],
]);

describe('Resumo visual da verba BB: recebimentos e filtros de ondas', () => {
  it('mostra 26 lojas da primeira onda e R$ 100 mil efetivamente recebidos', () => {
    const result = buildBbReimbursementSummary(wave1, overview, filter, settlements);
    expect(result.rows).toHaveLength(26);
    expect(result.totalCents).toBe(130000000n);
    expect(result.receivedCents).toBe(10000000n);
    expect(result.remainingCents).toBe(120000000n);
    expect(result.rows.filter((row) => row.receivedCents !== 0n).map((row) => row.storeCode))
      .toEqual(['LOJ-006', 'LOJ-025']);
    expect(result.rows.every((row) =>
      row.totalCents - row.receivedCents === row.remainingCents)).toBe(true);
    // Losses recorded in finalization must not be treated as received cash.
    expect(result.remainingCents).not.toBe(119400000n);
  });

  it('segunda onda não importa recebimentos da primeira, mesmo com dados financeiros globais', () => {
    const result = buildBbReimbursementSummary(wave2, overview, filter, settlements);
    expect(result.rows).toHaveLength(5);
    expect(result.totalCents).toBe(25000000n);
    expect(result.receivedCents).toBe(2000000n);
    expect(result.remainingCents).toBe(23000000n);
    expect(result.rows.map((row) => row.storeId)).toEqual(wave2.map((s) => s.id));
  });

  it('múltiplas ondas consolidam cada loja uma vez, sem duplicar recebimentos', () => {
    const result = buildBbReimbursementSummary([...wave1, ...wave2], overview, filter, settlements);
    expect(result.rows).toHaveLength(31);
    expect(result.totalCents).toBe(155000000n);
    expect(result.receivedCents).toBe(12000000n);
    expect(result.remainingCents).toBe(143000000n);
    expect(new Set(result.rows.map((r) => r.storeId)).size).toBe(31);
  });

  it('respeita filtros de loja, UF, situação e implantação e mantém ondas vazias zeradas', () => {
    const loja = buildBbReimbursementSummary(wave1, overview,
      { ...filter, storeId: 'LOJ-006' }, settlements);
    expect(loja.rows).toHaveLength(1);
    expect(loja.receivedCents).toBe(5000000n);
    expect(loja.remainingCents).toBe(0n);
    expect(buildBbReimbursementSummary(wave1, overview,
      { ...filter, state: 'MG' }, settlements).rows).toHaveLength(0);
    expect(buildBbReimbursementSummary(wave1, overview,
      { ...filter, operation: 'inactive' }, settlements).rows).toHaveLength(0);
    expect(buildBbReimbursementSummary(wave1, overview,
      { ...filter, implantation: 'closed' }, settlements).rows).toHaveLength(0);
    expect(buildBbReimbursementSummary([], overview, filter, settlements))
      .toEqual({ rows: [], totalCents: 0n, receivedCents: 0n, remainingCents: 0n });
  });

  it('liga os três valores ao detalhamento por loja, sem alterar os demais cards', () => {
    expect(pageSource).toContain("buildBbReimbursementSummary(dataset.stores, dataset.overview, filters, bbSettlements)");
    expect(pageSource).toContain("setOpenBbComposition('total')");
    expect(pageSource).toContain("setOpenBbComposition('received')");
    expect(pageSource).toContain("setOpenBbComposition('remaining')");
    expect(pageSource).toContain('bbCompositionRows.map((row)');
    expect(pageSource).toContain('forecast-bb-composition-modal');
    expect(pageSource).toContain('className="forecast-bb-mini forecast-bb-mini--received"');
    expect(pageSource).toContain('className="forecast-bb-mini forecast-bb-mini--remaining"');
    expect(cssSource).toContain('.forecast-bb-mini--received .forecast-bb-mini__value { color: #20804e; }');
    expect(cssSource).toContain('.forecast-bb-mini--remaining .forecast-bb-mini__value { color: #245fc1; }');
    expect(pageSource).toContain('considerReimbursements ? bbSettlements ?? undefined : undefined');
    expect(pageSource).toContain("(['contracted','contractBalance'] as const)");
    expect(repositorySource).toContain('getWaveScopedStoreIds()');
    expect(waveShellSource).toContain('<Outlet key={waveKey} />');
  });
});
