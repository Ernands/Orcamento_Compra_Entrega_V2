import { describe, expect, it } from 'vitest';
import { buildBudgetForecast, type ForecastFilters, type ForecastIndicator, type ForecastDetail } from '../domain/budget-forecast';
import { aggregateForecastDetailsByStore } from '../domain/forecast-store-aggregation';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { Store } from '../domain/types';
import page from '../pages/budget-forecast-dashboard-page.tsx?raw';
import style from '../pages/budget-forecast-dashboard.css?raw';
import app from '../app/app.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import legacy from '../pages/dashboard-page.tsx?raw';

const stores = [
  { id:'a',code:'LOJ-001',name:'ACARAU',city:'ACARAU',state:'CE',
    status:'active',financialClosure:{state:'closed'} },
  { id:'b',code:'LOJ-002',name:'BAEPENDI',city:'BAEPENDI',state:'MG',
    status:'active',financialClosure:{state:'open'} },
  { id:'c',code:'LOJ-003',name:'INATIVA',city:'OUTRA',state:'MG',
    status:'inactive',financialClosure:{state:'closed'} },
] as unknown as Store[];
const row = (id:string,bb:bigint,planned:bigint,realized:bigint): FinanceOverviewStoreRow => ({
  storeId:id,code:stores.find(store=>store.id===id)!.code,
  budgetBbCents:bb,budgetTotalCents:planned,realizedTotalCents:realized,
} as FinanceOverviewStoreRow);
const overview = [row('a',50000n,40000n,55000n),row('b',35000n,25000n,20000n),
  row('c',10000n,11000n,5000n)];
const payment = (
  id:string,status:'paid'|'planned'|'unscheduled',amount:bigint,
  allocations:{storeId:string;amountCents:bigint}[],
):UnifiedFinancePaymentRow=>({
  id,status,amountCents:amount,storeIds:allocations.map(a=>a.storeId),
  storeCodes:allocations.map(a=>stores.find(s=>s.id===a.storeId)!.code),
  states:allocations.map(a=>stores.find(s=>s.id===a.storeId)!.state),
  referenceCodes:[id],installmentLabel:id,workServiceId:null,
  storeAllocations:allocations.map(a=>({
    ...a,storeCode:stores.find(s=>s.id===a.storeId)!.code,
    state:stores.find(s=>s.id===a.storeId)!.state,
    originAllocations:{equipment:a.amountCents,furniture:0n,works:0n},
  })),unallocatedCents:amount-allocations.reduce((s,a)=>s+a.amountCents,0n),
} as UnifiedFinancePaymentRow);
const payments = [
  payment('CMP-01','paid',30000n,[{storeId:'a',amountCents:20000n},{storeId:'b',amountCents:10000n}]),
  payment('CMP-02','planned',7000n,[{storeId:'a',amountCents:7000n}]),
  payment('OBR-03','unscheduled',9000n,[{storeId:'b',amountCents:8000n}]),
];
const all:ForecastFilters = {state:'',storeId:'',operation:'all',implantation:'all'};
const sum = (items:{amountCents:bigint}[]) => items.reduce((total,item)=>total+item.amountCents,0n);
describe('Previsão Orçamentária — indicadores financeiros reais',()=>{
 it('mantém somas e detalhamentos exatamente reconciliados',()=>{
  const forecast=buildBudgetForecast(stores,overview,payments,all);
  expect(forecast.bbCents).toBe(95000n);
  expect(forecast.activeStores).toBe(2);
  expect(forecast.storesWithBudget).toBe(3);
  expect(forecast.inactiveStoresWithBudget).toBe(1);
  expect(forecast.inactiveBudgetCents).toBe(10000n);
  expect(forecast.plannedCents).toBe(76000n);
  expect(forecast.contractedCents).toBe(80000n);
  expect(forecast.forecastBalanceCents).toBe(19000n);
  expect(forecast.contractBalanceCents).toBe(-4000n);
  expect(forecast.bbBalanceCents).toBe(15000n);
  expect(forecast.paidCents).toBe(30000n);
  expect(forecast.payableCents).toBe(16000n);
  expect(forecast.executionPercent).toBe(105.26);
  expect(sum(forecast.details.paid)).toBe(forecast.paidCents);
  expect(sum(forecast.details.payable)).toBe(forecast.payableCents);
  expect(forecast.details.payable.some(item=>item.storeName==='Não alocado')).toBe(true);
  for(const key of ['bb','planned','contracted','forecastBalance','contractBalance','bbBalance'] as const){
    const total=({bb:forecast.bbCents,planned:forecast.plannedCents,contracted:forecast.contractedCents,
      forecastBalance:forecast.forecastBalanceCents,contractBalance:forecast.contractBalanceCents,
      bbBalance:forecast.bbBalanceCents})[key];
    expect(sum(forecast.details[key])).toBe(total);
  }
 });
 it('deduz reembolso recebido e perda absorvida apenas no modo considerar reembolsos',()=>{
  const settlement=new Map([
    ['a',{receivedCents:4000n,absorbedCents:1000n}],
    ['b',{receivedCents:3000n,absorbedCents:0n}],
  ]);
  const full=buildBudgetForecast(stores,overview,payments,all,undefined,undefined,settlement);
  expect(full.originalBbCents).toBe(95000n);
  expect(full.reimbursedCents).toBe(7000n);
  expect(full.absorbedCents).toBe(1000n);
  expect(full.bbCents).toBe(87000n);
  expect(full.forecastBalanceCents).toBe(11000n);
  expect(full.bbBalanceCents).toBe(7000n);
  expect(full.plannedCents).toBe(76000n);
  expect(full.contractedCents).toBe(80000n);
  expect(full.paidCents).toBe(30000n);
  expect(full.payableCents).toBe(16000n);
  expect(sum(full.details.bb)).toBe(full.bbCents);
  expect(sum(full.details.reimbursed)).toBe(full.reimbursedCents);
  expect(sum(full.details.absorbed)).toBe(full.absorbedCents);
  expect(sum(full.details.forecastBalance)).toBe(full.forecastBalanceCents);
  expect(sum(full.details.bbBalance)).toBe(full.bbBalanceCents);
  const scoped=buildBudgetForecast(stores,overview,payments,{...all,state:'CE'},
    undefined,undefined,settlement);
  expect(scoped.originalBbCents).toBe(50000n);
  expect(scoped.bbCents).toBe(45000n);
  expect(scoped.reimbursedCents).toBe(4000n);
  expect(scoped.absorbedCents).toBe(1000n);
  expect(scoped.activeStores).toBe(1);
  const unaffected=buildBudgetForecast(stores,overview,payments,all);
  expect(unaffected.bbCents).toBe(95000n);
  expect(unaffected.reimbursedCents).toBe(0n);
  expect(unaffected.absorbedCents).toBe(0n);
 });
 it('filtra situação operacional e fechamento independentemente',()=>{
  const ended=buildBudgetForecast(stores,overview,payments,
    {...all,operation:'active',implantation:'closed'});
  expect(ended.bbCents).toBe(50000n);
  expect(ended.activeStores).toBe(1);
  expect(ended.storesWithBudget).toBe(1);
  expect(ended.inactiveStoresWithBudget).toBe(0);
  expect(ended.inactiveBudgetCents).toBe(0n);
  expect(ended.contractedCents).toBe(55000n);
  expect(ended.paidCents).toBe(20000n);
  expect(ended.payableCents).toBe(7000n);
  expect(ended.bbBalanceCents).toBe(-5000n);
  const inactive=buildBudgetForecast(stores,overview,payments,{...all,operation:'inactive'});
  expect(inactive.activeStores).toBe(0);
  expect(inactive.storesWithBudget).toBe(1);
  expect(inactive.inactiveStoresWithBudget).toBe(1);
  expect(inactive.inactiveBudgetCents).toBe(10000n);
  expect(inactive.bbCents).toBe(10000n);
  expect(buildBudgetForecast(stores,overview,payments,{...all,state:'CE'}).bbCents).toBe(50000n);
  expect(buildBudgetForecast(stores,overview,payments,{...all,storeId:'b'}).bbCents).toBe(35000n);
 });
 it('trata orçamento zero sem divisão por zero e sinaliza saldo negativo',()=>{
  const zero=buildBudgetForecast(stores,[row('a',0n,0n,600n)],[],{...all,storeId:'a'});
  expect(zero.executionPercent).toBeNull();
  expect(zero.contractBalanceCents).toBe(-600n);
 });
 it('restaura faixas coloridas, posiciona os ícones à direita e volta a barra abaixo dos indicadores',()=>{
  expect(style).toContain('border-top: 7px solid var(--forecast-accent)');
  const previousAccents = ['#ffdb54','#bea5ff','#96c9ff','#91eda7','#ffc28c'];
  for(const accent of previousAccents) expect(style).toContain(`--forecast-accent: ${accent}`);
  for(const softTone of ['#fdf4d8','#f0eafc','#e9f3fd','#e8f5ed','#fdf0e3']) {
    expect(style).toContain(softTone);
  }
  expect(style).toContain('background: var(--forecast-soft, #f2f5f6)');
  expect(style).toContain('border-right: 1px solid #e3e9ed');
  expect(style).toContain('border-radius: 0;');
  expect(style).toContain('box-shadow: none;');
  expect(style).toContain('@media (max-width: 670px)');
  expect(style).toContain('.forecast-card:focus-visible');
  expect(page).toContain('className="forecast-card__more"');
  const card = page.split('function ForecastCard(')[1].split('function ForecastSection(')[0];
  expect(card.indexOf('className="forecast-card__icon"')).toBeLessThan(card.indexOf('className="forecast-card__value"'));
  expect(style).toContain('justify-content: flex-start;');
  expect(page).toContain('forecast.inactiveStoresWithBudget > 0');
  expect(page).toContain('forecast.inactiveBudgetCents');
  const contracts = page.split('title="Contratações"')[1].split('title="Execução Financeira"')[0];
  expect(contracts).toContain("(['contracted','contractBalance'] as const)");
  expect(contracts).toContain('className="forecast-card-grid"');
  expect(contracts).not.toContain('forecast-card-grid--three');
  expect(contracts.indexOf('</div>\n            <div className="forecast-progress">')).toBeGreaterThan(0);
  expect(contracts).toContain('role="progressbar"');
  expect(contracts).toContain('Execução Orçamentária (%)');
  expect(page).toContain('Verba BB Reembolsável − Orçamento Previsto');
  expect(page).toContain('Programado + Não programado');
  expect(page).toContain('Orçamento previsto ultrapassado.');
 });
 it('mostra uma linha por loja em todos os popups financeiros',()=>{
  expect(page).toContain('aggregateForecastDetailsByStore(forecast.details[openIndicator])');
  expect(page).toContain('className="forecast-detail-modal"');
  expect(page).toContain('className="forecast-detail__store-code"');
  expect(page).toContain('className="forecast-detail__store-name"');
  expect(page).toContain('modalData.entries.map((entry)');
  expect(page).toContain('Linhas de origem');
  expect(page).toContain('Total por loja');
  expect(page).toContain('modalData.detailTotal');
  expect(page).toContain('reconciles:detailTotal===metricTotal');
  expect(page).toContain('role="alert"');
  expect(page).not.toContain('data-label="Referência"');
  expect(page).not.toContain('data-label="Categoria / Status"');
  expect(style).toContain('.modal.forecast-detail-modal');
  expect(style).toContain('width: min(calc(100vw - 36px), 1220px)');
  expect(style).toContain('.forecast-detail td { white-space: nowrap; }');
  expect(style).toContain('@media (max-width: 960px)');
  expect(style).toContain('grid-template-areas:');
  expect(style).toContain('"store store"');
  expect(style).toContain('overflow-x: hidden; overflow-y: auto;');
  expect(style).toContain('@media (max-width: 420px)');
 });
 it('agrega cada métrica por loja mantendo a soma exata do card com filtros e reembolso',()=>{
  const settlement=new Map([
    ['a',{receivedCents:4000n,absorbedCents:1000n}],
    ['b',{receivedCents:3000n,absorbedCents:0n}],
  ]);
  for (const f of [all,{...all,state:'CE'},{...all,storeId:'b'}]) {
    for (const reimbursement of [undefined,settlement]) {
      const snapshot=buildBudgetForecast(stores,overview,payments,f,undefined,undefined,reimbursement);
      const totals:Record<ForecastIndicator,bigint>={
        bb:snapshot.bbCents,activeStores:BigInt(snapshot.activeStores),
        planned:snapshot.plannedCents,forecastBalance:snapshot.forecastBalanceCents,
        contracted:snapshot.contractedCents,contractBalance:snapshot.contractBalanceCents,
        paid:snapshot.paidCents,payable:snapshot.payableCents,
        bbBalance:snapshot.bbBalanceCents,reimbursed:snapshot.reimbursedCents,
        absorbed:snapshot.absorbedCents,
      };
      for (const key of Object.keys(totals) as ForecastIndicator[]) {
        const groups=aggregateForecastDetailsByStore(snapshot.details[key]);
        expect(new Set(groups.map(group=>group.id)).size).toBe(groups.length);
        expect(sum(groups)).toBe(totals[key]);
        expect(sum(groups)).toBe(sum(snapshot.details[key]));
      }
    }
  }
 });
 it('concilia valores monetários exatos em centavos, inclusive 113.121,52 e 25.889,50',()=>{
  const origin=(storeCode:string,storeName:string,state:string,amountCents:bigint,id:string):ForecastDetail=>({
    id,storeCode,storeName,state,amountCents,reference:id,category:'Compra',
    status:'Consolidado',
  });
  const planned=[
    origin('LOJ-001','LOJA A','CE',3000000n,'plan-a1'),
    origin('LOJ-001','LOJA A','CE',2000000n,'plan-a2'),
    origin('LOJ-002','LOJA B','MG',4000000n,'plan-b1'),
    origin('LOJ-003','LOJA C','RN',2312152n,'plan-c1'),
  ];
  const contracted=[
    origin('LOJ-001','LOJA A','CE',1000000n,'cmp-a1'),
    origin('LOJ-001','LOJA A','CE',700000n,'obr-a2'),
    origin('LOJ-002','LOJA B','MG',888950n,'cmp-b1'),
  ];
  const groupedPlan=aggregateForecastDetailsByStore(planned);
  const groupedContract=aggregateForecastDetailsByStore(contracted);
  expect(groupedPlan).toHaveLength(3);
  expect(groupedPlan.find(group=>group.storeCode==='LOJ-001'))
    .toMatchObject({amountCents:5000000n,sourceRows:2});
  expect(sum(groupedPlan)).toBe(11312152n);
  expect(groupedContract).toHaveLength(2);
  expect(sum(groupedContract)).toBe(2588950n);
  expect(aggregateForecastDetailsByStore([
    ...contracted,origin('LOJ-002','LOJA B','MG',-500n,'adjustment'),
  ]).find(group=>group.storeCode==='LOJ-002')?.amountCents).toBe(888450n);
  expect(aggregateForecastDetailsByStore([
    origin('—','Não alocado','—',150n,'undistributed'),...contracted,
  ]).at(-1)?.storeName).toBe('Não alocado');
 });
 it('oculta abas antigas, mantém código legado e cria cinco quadros sem prospector',()=>{
  expect(app).toContain('path="dashboard/previsao-orcamentaria"');
  expect(legacy).toContain('temporariamente ocultas');
  expect(shell).toContain('Previsão Orçamentária');
  expect(shell).not.toContain('<NavLink to="/dashboard/implantacao"');
  expect(shell).not.toContain('<NavLink to="/dashboard/suprimentos"');
  expect(page).not.toContain('Prospector');
  // Reimbursement amounts are integrated in the original five sections.
  expect(page.match(/<ForecastSection color=/g)).toHaveLength(5);
  expect(page).toContain("(['bb','activeStores','reimbursed'] as const)");
  expect(page).toContain('Perda absorvida: ');
  expect(page).not.toContain('Situação do reembolso');
  expect(page).not.toContain('Reembolsos — Visão gerencial');
  for(const color of ['bb','purple','blue','green','orange'])expect(style).toContain(`forecast-section--${color}`);
  expect(page).toContain('Situação da Implantação');
  expect(page).toContain('Limpar filtros');
  expect(page).toContain('Total detalhado');
  expect(page).toContain('Não aplicável');
  expect(page).toContain('role="progressbar"');
 });
});
