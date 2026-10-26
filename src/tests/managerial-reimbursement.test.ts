import { describe, expect, it } from 'vitest';
import { buildManagerialReimbursements, managerialTotals, reimbursementStatus } from '../domain/managerial-reimbursements';
import type { ManagerialReimbursementEntry } from '../domain/managerial-reimbursements';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { Store } from '../domain/types';
import page from '../pages/managerial-reimbursement-page.tsx?raw';
import forecast from '../pages/budget-forecast-dashboard-page.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import app from '../app/app.tsx?raw';
import finance from '../pages/finance-page.tsx?raw';
import migration from '../../supabase/migrations/20261025235317_finance_managerial_reimbursement_entries.sql?raw';

const store={id:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  status:'active',financialClosure:{state:'closed'}} as unknown as Store;
const row={storeId:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  budgetTotalCents:1250000n,budgetVarianceToBbCents:-250000n,
  realizedTotalCents:800000n,paidCents:500000n,payableCents:300000n} as FinanceOverviewStoreRow;
const entry=(id:string,type:'requested'|'received',cents:bigint,reversalOf:string|null=null):ManagerialReimbursementEntry=>({
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
    expect(rows[0].varianceToBbCents).toBe(-250000n);
    expect(rows[0].pendingCents).toBe(500000n);
    expect(rows[0].disbursementCents).toBe(300000n);
    expect(rows[0].reimbursementStatus).toBe('partial');
    expect(managerialTotals(rows).receivedCents).toBe(200000n);
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
  });
  it('mantém lançamentos em tabela isolada RLS e limita correções ao estorno',()=>{
    expect(migration).toContain('finance_managerial_reimbursement_entries');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('app.can_store');
    expect(migration).toContain('reversal_of uuid unique');
    expect(forecast).toContain('Considerar reembolsos');
    expect(forecast).toContain('buildBudgetForecast');
    expect(forecast).toContain('forecast.paidCents-filteredManagerialTotals.receivedCents');
  });
});
