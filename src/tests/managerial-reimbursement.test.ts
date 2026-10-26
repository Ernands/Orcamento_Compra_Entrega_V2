import { describe, expect, it } from 'vitest';
import { buildManagerialReimbursements, managerialTotals, reimbursementStatus, managerialSettlementsByStore,
  calculateManagerialReimbursementFinancials,
  reimbursementBalanceLines, reimbursementWorkflowStatus } from '../domain/managerial-reimbursements';
import type { ManagerialReimbursementEntry } from '../domain/managerial-reimbursements';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { Store } from '../domain/types';
import page from '../pages/managerial-reimbursement-page.tsx?raw';
import forecast from '../pages/budget-forecast-dashboard-page.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import app from '../app/app.tsx?raw';
import finance from '../pages/finance-page.tsx?raw';
import migration from '../../supabase/migrations/20261025235317_finance_managerial_reimbursement_entries.sql?raw';
import closureMigration from '../../supabase/migrations/20261026013456_finance_managerial_reimbursement_finalization.sql?raw';
import bbLimitMigration from '../../supabase/migrations/20261026025214_finance_managerial_finalization_bb_limit.sql?raw';
import pageCss from '../pages/managerial-reimbursement-page.css?raw';

const store={id:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  status:'active',financialClosure:{state:'closed'}} as unknown as Store;
const row={storeId:'s1',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
  budgetBbCents:1000000n,budgetTotalCents:1250000n,budgetVarianceToBbCents:-250000n,
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
    expect(rows[0].bbCents).toBe(1000000n);
    expect(managerialTotals(rows).bbCents).toBe(1000000n);
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
    const closedCostRow={...row,budgetBbCents:6000000n,realizedTotalCents:5000000n};
    const open=buildManagerialReimbursements([store],[closedCostRow],[requested,received]);
    expect(open[0].absorbedCents).toBe(0n);
    expect(open[0].pendingCents).toBe(1000000n);
    expect(open[0].reimbursementStatus).toBe('partial');

    const finalization={...entry('c','finalized',1000000n),createdAt:'2026-10-25T14:00:00Z'};
    const finished=buildManagerialReimbursements([store],[closedCostRow],[requested,received,finalization]);
    expect(finished[0].pendingCents).toBe(0n);
    expect(finished[0].reimbursementStatus).toBe('finalized');
    expect(finished[0].absorbedCents).toBe(1000000n);
    expect(managerialTotals(finished).absorbedCents).toBe(1000000n);
    const settlement=managerialSettlementsByStore(finished[0].events).get('s1');
    expect(settlement).toEqual({receivedCents:4000000n,absorbedCents:1000000n});

    const nextRequest={...entry('d','requested',2000000n),createdAt:'2026-10-25T15:00:00Z'};
    const reopened=buildManagerialReimbursements([store],[closedCostRow],[requested,received,finalization,nextRequest]);
    expect(reopened[0].pendingCents).toBe(2000000n);
    expect(reopened[0].absorbedCents).toBe(1000000n);
    expect(reopened[0].reimbursementStatus).not.toBe('finalized');

    const zeroLoss={...entry('e','finalized',0n),createdAt:'2026-10-25T16:00:00Z'};
    const zero=buildManagerialReimbursements([store],[closedCostRow],[entry('a','requested',5000000n),
      entry('b','received',5000000n),zeroLoss]);
    expect(zero[0].reimbursementStatus).toBe('finalized');
    expect(zero[0].absorbedCents).toBe(0n);
  });
  it('corrige a loja 3 com finalização histórica de perda zero sem alterar o lançamento',()=>{
    const testStore={...row,budgetBbCents:5000000n,realizedTotalCents:660150n};
    const historical=[
      entry('req','requested',510000n),
      {...entry('rec','received',510000n),createdAt:'2026-10-25T14:00:00Z'},
      {...entry('fin','finalized',0n),createdAt:'2026-10-25T15:00:00Z'},
    ];
    const res=buildManagerialReimbursements([store],[testStore],historical);
    expect(res[0].eligibleCents).toBe(660150n);
    expect(res[0].receivedCents).toBe(510000n);
    expect(res[0].absorbedCents).toBe(150150n);
    expect(res[0].recordedLossCents).toBe(0n);
    expect(res[0].extraCents).toBe(0n);
    expect(res[0].pendingCents).toBe(0n);
    expect(res[0].reimbursementStatus).toBe('finalized');
    expect(managerialSettlementsByStore(historical,[testStore]).get('s1'))
      .toEqual({receivedCents:510000n,absorbedCents:150150n});
  });
  it('separa perda elegível de gasto extra sem debitar excedente da verba BB',()=>{
    const bb=5000000n,realizado=6500000n;
    const historical=[
      entry('req','requested',4500000n),
      {...entry('rec','received',4500000n),createdAt:'2026-10-25T14:00:00Z'},
      {...entry('fin','finalized',0n),createdAt:'2026-10-25T15:00:00Z'},
    ];
    const calculated=calculateManagerialReimbursementFinancials(bb,realizado,historical);
    expect(calculated.eligibleCents).toBe(5000000n);
    expect(calculated.absorbedCents).toBe(500000n);
    expect(calculated.extraCents).toBe(1500000n);
    expect(calculated.receivedCents+calculated.absorbedCents).toBe(bb);
    const withRow=buildManagerialReimbursements([store],[{
      ...row,budgetBbCents:bb,realizedTotalCents:realizado,
      realizedVarianceToBbCents:-1500000n,
    }],historical);
    expect(managerialTotals(withRow).extraCents).toBe(1500000n);
    expect(managerialTotals(withRow).absorbedCents).toBe(500000n);
    expect(managerialSettlementsByStore(historical,[{
      ...row,budgetBbCents:bb,realizedTotalCents:realizado,
    }]).get('s1')).toEqual({receivedCents:4500000n,absorbedCents:500000n});
    const pending=calculateManagerialReimbursementFinancials(bb,realizado,
      historical.filter(e=>e.type!=='finalized'));
    expect(pending.absorbedCents).toBe(0n);
    expect(pending.extraCents).toBe(1500000n);
  });
  it('classifica saldo aberto, perda finalizada e excedente sem confundi-los',()=>{
    expect(reimbursementBalanceLines({absorbedCents:0n,pendingCents:1000000n}))
      .toEqual([{kind:'pending',label:'Pendente',amountCents:1000000n}]);
    expect(reimbursementBalanceLines({absorbedCents:1000000n,pendingCents:0n}))
      .toEqual([{kind:'loss',label:'Perda absorvida',amountCents:1000000n}]);
    expect(reimbursementBalanceLines({absorbedCents:0n,pendingCents:-200000n}))
      .toEqual([{kind:'excess',label:'Acima do solicitado',amountCents:200000n}]);
    expect(reimbursementBalanceLines({absorbedCents:1000000n,pendingCents:400000n}))
      .toEqual([{kind:'loss',label:'Perda absorvida',amountCents:1000000n},
        {kind:'pending',label:'Pendente',amountCents:400000n}]);
    expect(reimbursementBalanceLines({absorbedCents:0n,pendingCents:0n}))
      .toEqual([{kind:'settled',label:'Sem saldo',amountCents:0n}]);
    expect(reimbursementBalanceLines({absorbedCents:500000n,pendingCents:0n,extraCents:1500000n}))
      .toEqual([{kind:'loss',label:'Perda absorvida',amountCents:500000n},
        {kind:'extra',label:'Gasto extra',amountCents:1500000n}]);
    expect(reimbursementWorkflowStatus({reimbursementStatus:'finalized'})).toBe('Finalizado');
    expect(reimbursementWorkflowStatus({reimbursementStatus:'partial'})).toBe('Aberto');
    expect(reimbursementWorkflowStatus({reimbursementStatus:'received'})).toBe('Aberto');
    expect(reimbursementWorkflowStatus({reimbursementStatus:'not_requested'})).toBe('Aberto');
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
    expect(page).toContain("['Loja','UF','Verba BB','Realizado total'");
    expect(page).toContain("label:'Realizado total',value:totals.realizedTotalCents,group:'execution'");
    expect(page).toContain('<th>Loja · Cidade/UF</th><th>Verba BB</th><th>Realizado total</th>');
    expect(page).toContain('<FinanceAmount cents={r.bbCents}/>');
    expect(page).toContain('<th>Saldo / Perda / Excedente</th>');
    expect(page).toContain('<th>Status do reembolso</th>');
    expect(page).toContain("label:'Perdas absorvidas',value:totals.absorbedCents,group:'loss'");
    expect(page).toContain("label:'Gasto extra',value:totals.extraCents,group:'extra'");
    expect(page).toContain('data-label="Verba BB"');
    expect(page).toContain("numeric(r.extraCents)");
    expect(pageCss).toContain('@media(max-width:1250px)');
    expect(pageCss).toContain('overflow-x:visible');
    expect(pageCss).toContain('table-layout:fixed');
    expect(pageCss).toContain('.managerial-refunds__balance-line--extra');
    expect(page).toContain("selected.absorbedCents!==selected.recordedLossCents");
    expect(page).toContain('reimbursementBalanceLines(r).map');
    expect(page).toContain('reimbursementWorkflowStatus(r)');
    expect(page).toContain("numeric(r.bbCents)");
    expect(page).toContain('numeric(r.absorbedCents)');
    expect(page).toContain("numeric(r.pendingCents<0n?-r.pendingCents:0n)");
    expect(page).toContain("colSpan={10}");
    expect(pageCss).toContain('.managerial-refunds__workflow--closed');
    expect(pageCss).toContain('.managerial-refunds__balance-line--excess');
    expect(page).toContain('<FinanceAmount cents={r.realizedTotalCents}/>');
    expect(page).not.toContain('Orçado total');
    expect(page).toContain('Gasto extra = Realizado acima da Verba BB.');
    expect(page).toContain("label:'Dif. em relação à verba',value:totals.varianceToBbCents,group:'execution'");
  });
  it('mantém lançamentos em tabela isolada RLS e limita correções ao estorno',()=>{
    expect(migration).toContain('finance_managerial_reimbursement_entries');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('app.can_store');
    expect(migration).toContain('reversal_of uuid unique');
    expect(forecast).toContain('Considerar reembolsos');
    expect(forecast).toContain('buildBudgetForecast');
    expect(forecast).toContain('managerialSettlementsByStore(dataset.managerialEntries,dataset.overview)');
    expect(forecast).toContain('Perda absorvida: ');
    expect(page).toContain('Marcar como finalizado');
    expect(page).toContain("type:'finalized',amountCents:loss");
    expect(closureMigration).toContain("entry_type in ('requested','received','finalized')");
    expect(closureMigration).toContain('new.amount_cents <> open_balance');
    expect(closureMigration).toContain('Reimbursement already finalized');
    expect(bbLimitMigration).toContain('Absorbed loss exceeds the remaining BB allowance');
    expect(bbLimitMigration).toContain('total_received+registered_losses+new.amount_cents');
  });
});
