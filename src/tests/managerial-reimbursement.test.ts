import { describe, expect, it } from 'vitest';
import { buildManagerialReimbursements, managerialTotals, reimbursementStatus, managerialSettlementsByStore } from '../domain/managerial-reimbursements';
import type { ManagerialReimbursementEntry } from '../domain/managerial-reimbursements';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { Store } from '../domain/types';
import page from '../pages/managerial-reimbursement-page.tsx?raw';
import forecast from '../pages/budget-forecast-dashboard-page.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import app from '../app/app.tsx?raw';
import finance from '../pages/finance-page.tsx?raw';
import migration from '../../supabase/migrations/20261025235317_finance_managerial_reimbursement_entries.sql?raw';
import closureMigration from '../../supabase/migrations/20261026012300_finance_managerial_reimbursement_finalization.sql?raw';

const store={id:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  status:'active',financialClosure:{state:'closed'}} as unknown as Store;
const row={storeId:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  budgetTotalCents:1250000n,budgetVarianceToBbCents:-250000n,
  realizedVarianceToBbCents:200000n,
  realizedTotalCents:800000n,paidCents:500000n,payableCents:300000n} as FinanceOverviewStoreRow;
const entry=(id:string,type:'requested'|'received'|'finalized',cents:bigint,reversalOf:string|null=null):ManagerialReimbursementEntry=>({
  id,storeId:'s1',type,amountCents:cents,date:'2026-10-25',protocol:'TESTE',
  notes:'',reversalOf,createdBy:'u1',createdAt:'2026-10-25T13:00:00Z',
});
describe('Dashboard gerencial de reembolso',()=>{
  it('filtra lojas com lançamento, identifica finalização e preserva diferença da verba',()=>{
    const rows=buildManagerialReimbursements([store],[row],[entry('a','requested',700000n),entry('b','received',200000n)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].storeStatus).toBe('Finalizada');
    expect(rows[0].realizedTotalCents).toBe(800000n);
    expect(managerialTotals(rows).realizedTotalCents).toBe(800000n);
    expect(rows[0].varianceToBbCents).toBe(200000n);
    expect(managerialTotals(rows).varianceToBbCents).toBe(200000n);
    expect(rows[0].pendingCents).toBe(500000n);
    expect(rows[0].disbursementCents).toBe(300000n);
    expect(rows[0].reimbursementStatus).toBe('partial');
    expect(managerialTotals(rows).receivedCents).toBe(200000n);
  });
  it('usa a diferença Verba BB − Realizado, inclusive quando negativa',()=>{
    const overBudgetRow={...row,realizedTotalCents:1400000n,
      realizedVarianceToBbCents:-400000n};
    const result=buildManagerialReimbursements([store],[overBudgetRow],[]);
    expect(result).toHaveLength(1);
    expect(result[0].varianceToBbCents).toBe(-400000n);
    expect(managerialTotals(result).varianceToBbCents).toBe(-400000n);
    // O indicador não pode reaproveitar a diferença sobre o Orçado (-250000n).
    expect(result[0].varianceToBbCents).not.toBe(overBudgetRow.budgetVarianceToBbCents);
  });
  it('apenas finalização absorve perda; novo ciclo não contamina a perda anterior',()=>{
    const requested=entry('a','requested',5000000n);
    const received=entry('b','received',4000000n);
    const open=buildManagerialReimbursements([store],[row],[requested,received]);
    expect(open[0].absorbedCents).toBe(0n);
    expect(open[0].pendingCents).toBe(1000000n);
    expect(open[0].reimbursementStatus).toBe('partial');

    const finalization={...entry('c','finalized',1000000n),createdAt:'2026-10-25T14:00:00Z'};
    const finished=buildManagerialReimbursements([store],[row],[requested,received,finalization]);
    expect(finished[0].pendingCents).toBe(0n);
    expect(finished[0].reimbursementStatus).toBe('finalized');
    expect(finished[0].absorbedCents).toBe(1000000n);
    expect(managerialTotals(finished).absorbedCents).toBe(1000000n);
    const settlement=managerialSettlementsByStore(finished[0].events).get('s1');
    expect(settlement).toEqual({receivedCents:4000000n,absorbedCents:1000000n});

    const nextRequest={...entry('d','requested',2000000n),createdAt:'2026-10-25T15:00:00Z'};
    const reopened=buildManagerialReimbursements([store],[row],[requested,received,finalization,nextRequest]);
    expect(reopened[0].pendingCents).toBe(2000000n);
    expect(reopened[0].absorbedCents).toBe(1000000n);
    expect(reopened[0].reimbursementStatus).not.toBe('finalized');

    const zeroLoss={...entry('e','finalized',0n),createdAt:'2026-10-25T16:00:00Z'};
    const zero=buildManagerialReimbursements([store],[row],[entry('a','requested',5000000n),
      entry('b','received',5000000n),zeroLoss]);
    expect(zero[0].reimbursementStatus).toBe('finalized');
    expect(zero[0].absorbedCents).toBe(0n);
  });
  it('lida com estorno auditável sem perda do lançamento original',()=>{
    const rows=buildManagerialReimbursements([store],[row],[
      entry('a','requested',700000n),entry('b','requested',-700000n,'a'),
    ]);
    expect(rows[0].requestedCents).toBe(0n);
    expect(rows[0].events).toHaveLength(2);
    expect(rows[0].reimbursementStatus).toBe('not_requested');
  });
  it('detecta recebimento excessivo e conserva registros financeiros',()=>{
    expect(reimbursementStatus(500n,600n)).toBe('divergent');
    expect(reimbursementStatus(600n,600n)).toBe('received');
    expect(reimbursementStatus(600n,0n)).toBe('requested');
    expect(buildManagerialReimbursements([store],[{...row,realizedTotalCents:0n,paidCents:0n,payableCents:0n}],[])).toHaveLength(0);
  });
  it('inclui rota e menu e oculta fluxo antigo por compra sem apagar dados',()=>{
    expect(app).toContain('dashboard/reembolso');
    expect(shell).toContain('to="/dashboard/reembolso"');
    expect(shell.indexOf('to="/dashboard/reembolso"')).toBeGreaterThan(shell.indexOf('to="/dashboard/composicao-financeira"'));
    expect(finance).toContain('const canReimbursements = false;');
    expect(finance).toContain('listFinanceReimbursements()');
    expect(page).toContain('listManagerialReimbursements()');
    expect(page).toContain('Gerenciar');
    expect(page).toContain('Estornar');
    expect(page).toContain("['Loja','UF','Situação da loja','Realizado total'");
    expect(page).toContain("label:'Realizado total',value:totals.realizedTotalCents,group:'execution'");
    expect(page).toContain('<th>Loja · Cidade/UF</th><th>Realizado total</th>');
    expect(page).toContain('<FinanceAmount cents={r.realizedTotalCents}/>');
    expect(page).not.toContain('Orçado total');
    expect(page).toContain('Dif. em relação à verba = Verba BB − Realizado total.');
    expect(page).toContain("label:'Dif. em relação à verba',value:totals.varianceToBbCents,group:'execution'");
  });
  it('mantém lançamentos em tabela isolada RLS e limita correções ao estorno',()=>{
    expect(migration).toContain('finance_managerial_reimbursement_entries');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('app.can_store');
    expect(migration).toContain('reversal_of uuid unique');
    expect(forecast).toContain('Considerar reembolsos');
    expect(forecast).toContain('buildBudgetForecast');
    expect(forecast).toContain('managerialSettlementsByStore(dataset.managerialEntries)');
    expect(forecast).toContain('Perda absorvida: ');
    expect(page).toContain('Marcar como finalizado');
    expect(page).toContain("type:'finalized',amountCents:loss");
    expect(closureMigration).toContain("entry_type in ('requested','received','finalized')");
    expect(closureMigration).toContain('new.amount_cents <> open_balance');
    expect(closureMigration).toContain('Reimbursement already finalized');
  });
});
