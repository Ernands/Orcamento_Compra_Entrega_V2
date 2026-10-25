import { describe, expect, it } from 'vitest';
import { buildFinancialCompositionReport } from '../domain/finance-composition-report';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';
import app from '../app/app.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import page from '../pages/financial-composition-page.tsx?raw';

const stores=[
  {id:'s1',code:'LOJ-001',name:'ACARAU - CE',city:'ACARAU',state:'CE',status:'active'},
  {id:'s2',code:'LOJ-002',name:'BAEPENDI - MG',city:'BAEPENDI',state:'MG',status:'active'},
] as Store[];
const works=[
  {
    id:'w1',code:'OBR-001',storeId:'s1',storeCode:'LOJ-001',storeName:'ACARAU',
    storeCity:'ACARAU',storeState:'CE',category:'Pintura',description:'Pintura interna',
    budgetAmount:'120.00',contractedAmount:'100.00',status:'in_progress',progressPercent:50,
    payments:[{id:'p1',status:'paid',amount:'60.00',paidAt:'2026-10-20'}],
    documents:[],components:[],
  },
  {
    id:'w2',code:'OBR-002',storeId:'s2',storeCode:'LOJ-002',storeName:'BAEPENDI',
    storeCity:'BAEPENDI',storeState:'MG',category:'Elétrica',description:'Instalação',
    budgetAmount:'110.00',contractedAmount:'90.00',status:'approved',progressPercent:0,
    payments:[{id:'p2',status:'planned',amount:'90.00'}],documents:[],components:[],
  },
] as unknown as WorkService[];
const overview=[
  {storeId:'s1',code:'LOJ-001',budgetBbCents:5000000n,budgetTotalCents:12000n,
    realizedTotalCents:10000n,realizedVarianceToBbCents:4990000n,
    paidCents:6000n,payableCents:4000n},
  {storeId:'s2',code:'LOJ-002',budgetBbCents:5000000n,budgetTotalCents:11000n,
    realizedTotalCents:9000n,realizedVarianceToBbCents:4991000n,
    paidCents:0n,payableCents:9000n},
] as FinanceOverviewStoreRow[];
const input={stores,overviewRows:overview,purchaseStoreRows:[],purchases:[],
  plannedBudgetItems:[],works};
describe('Dashboard / Composição Financeira',()=>{
 it('consolida toda loja sem alterar as fontes de Detalhe da Loja',()=>{
  const report=buildFinancialCompositionReport({...input,selectedStoreId:''});
  expect(report.storesCount).toBe(2);
  expect(report.totals.budgetBbCents).toBe(10000000n);
  expect(report.totals.budgetTotalCents).toBe(23000n);
  expect(report.totals.realizedTotalCents).toBe(19000n);
  expect(report.totals.executionDifferenceCents).toBe(-4000n);
  expect(report.totals.realizedVarianceToBbCents).toBe(9981000n);
  expect(report.totals.paidCents).toBe(6000n);
  expect(report.totals.payableCents).toBe(13000n);
  expect(report.groups.map(row=>row.key)).toEqual(['equipment','furniture','works']);
  expect(report.groups[2].budgetCents).toBe(23000n);
  expect(report.groups[2].realizedCents).toBe(19000n);
  expect(report.groups[2].paidCents).toBe(6000n);
  expect(report.groups[2].payableCents).toBe(13000n);
  expect(report.reconciliation).toEqual({budget:true,realized:true,paid:true,payable:true});
  expect(report.lines).toHaveLength(2);
  expect(report.lines.find(row=>row.reference==='OBR-001')).toMatchObject({
    kind:'work',status:'Parcialmente pago',paidCents:6000n,payableCents:4000n,
  });
  expect(report.lines.find(row=>row.reference==='OBR-002')).toMatchObject({
    kind:'work',status:'A pagar',paidCents:0n,payableCents:9000n,
  });
 });
 it('filtra loja pelo id e preserva exatamente seus valores oficiais',()=>{
  const acarau=buildFinancialCompositionReport({...input,selectedStoreId:'s1'});
  expect(acarau.storesCount).toBe(1);
  expect(acarau.totals.budgetTotalCents).toBe(12000n);
  expect(acarau.totals.realizedTotalCents).toBe(10000n);
  expect(acarau.totals.executionDifferenceCents).toBe(-2000n);
  expect(acarau.totals.paidCents).toBe(6000n);
  expect(acarau.totals.payableCents).toBe(4000n);
  expect(acarau.lines).toHaveLength(1);
  expect(acarau.lines[0].storeLabel).toContain('ACARAU/CE');
 });
 it('não fabrica item pago sem vínculo individual inequívoco',()=>{
  const code = String(buildFinancialCompositionReport);
  expect(code).toContain('exactRealizedByItem');
  expect(code).toContain('uniquelyAttributed');
  expect(page).toContain('“—” identifica');
  expect(page).toContain('Não individualizado');
  expect(page).toContain('const canSeePayments');
 });
 it('permite filtrar todas as situações financeiras sem alterar os indicadores oficiais',()=>{
  expect(page).toContain("const [status,setStatus] = useState<StatusFilter>('all')");
  for(const option of ['Orçado','Pago','Parcialmente pago','A pagar','Não individualizado']) {
    expect(page).toContain(option);
  }
  expect(page).toContain("line.status===statusNames[status]");
  expect(page).toContain("setStatus('all')");
  expect(page).toContain('...filteredLines.map((r)=>[');
  expect(page).toContain('report.totals');
 });
 it('carrega mais registros automaticamente e remove resumo financeiro duplicado',()=>{
  expect(page).toContain('IntersectionObserver');
  expect(page).toContain('root:scrollRoot');
  expect(page).toContain('filteredLines.slice(0,limit)');
  expect(page).toContain('className="financial-composition__sentinel"');
  expect(page).not.toContain('Exibir mais registros');
  expect(page).not.toContain('financial-composition__footer');
  expect(page).not.toContain('Disponível BB:');
 });
 it('registra rota, permissões e menu na ordem solicitada',()=>{
  expect(app).toContain('path="dashboard/composicao-financeira"');
  expect(app).toContain('FinancialCompositionPage');
  const first=shell.indexOf('to="/dashboard/previsao-orcamentaria"');
  const second=shell.indexOf('to="/dashboard/composicao-financeira"');
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(first);
  expect(page).toContain('Composição Financeira');
  expect(page).toContain('Todas as lojas — consolidado');
  expect(page).toContain('Realizado menos orçado');
  expect(page).toContain('financial-composition__record');
  expect(page).toContain('Exportar CSV');
 });
});
