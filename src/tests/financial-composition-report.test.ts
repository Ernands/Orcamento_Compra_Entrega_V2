import { describe, expect, it } from 'vitest';
import { buildFinancialCompositionReport } from '../domain/finance-composition-report';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';
import app from '../app/app.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import page from '../pages/financial-composition-page.tsx?raw';
import compositionCss from '../pages/financial-composition-page.css?raw';

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
 it('usa o padrão executivo da Previsão Orçamentária com valores e rótulos alinhados',()=>{
  expect(page).toContain('financial-composition__overview-section--planning');
  expect(page).toContain('financial-composition__overview-section--execution');
  expect(page).toContain('financial-composition__overview-section--financial');
  expect(page).toContain('financial-composition__overview-metric-label');
  expect(page).toContain('financial-composition__overview-metric-value');
  expect(page).toContain('value={t.budgetBbCents}');
  expect(page).toContain('value={t.budgetTotalCents}');
  expect(page).toContain('value={t.realizedTotalCents}');
  expect(page).toContain('value={t.realizedVarianceToBbCents}');
  expect(page).toContain('value={t.paidCents}');
  expect(page).toContain('value={t.payableCents}');
  expect(page).not.toContain('finance-store-detail__kpis--grouped');
  expect(compositionCss).toContain('border-top:7px solid var(--composition-accent)');
  expect(compositionCss).toContain('--composition-accent:#bea5ff');
  expect(compositionCss).toContain('--composition-accent:#96c9ff');
  expect(compositionCss).toContain('--composition-accent:#91eda7');
  expect(compositionCss).toContain('grid-template-rows:minmax(38px,auto) auto');
  expect(compositionCss).toContain('font-variant-numeric:tabular-nums');
  expect(compositionCss).toContain('@media(max-width:550px)');
 });
 it('mantém R$ e milhões na mesma linha e dá toda a largura do cartão ao valor',()=>{
  expect(page).toContain('financial-composition__overview-metric-money');
  expect(page).toContain('<small>R$</small>');
  expect(page).toContain("formatBRL(value).replace(/^R\\$\\s*/, '')");
  expect(compositionCss).toContain('.financial-composition__overview-metric-money {');
  expect(compositionCss).toContain('grid-column:1/-1');
  expect(compositionCss).toContain('justify-content:center');
  expect(compositionCss).toContain('white-space:nowrap');
  expect(compositionCss).toContain('word-break:keep-all');
  expect(compositionCss).not.toContain('overflow-wrap:anywhere');
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


type FixtureOrder = {
  id: string;
  lines: Array<{ item: 'a' | 'b'; priceCents: number; stores?: string[] }>;
  paidCents?: number;
  plannedCents?: number;
};
const money = (cents: number): string =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

function compositionPurchase(orders: FixtureOrder[], selectedStores = stores.slice(0, 1)): PurchaseV2 {
  return {
    id: 'p1', code: 'CMP-01000', status: 'purchased', supplierName: 'Mercado Livre',
    stores: selectedStores.map((store) => ({
      id: `ps-${store.id}`, storeId: store.id, code: store.code, name: store.name,
      city: store.city, state: store.state,
    })),
    items: (['a', 'b'] as const).map((key) => ({
      id: `pi-${key}`, purchaseId: 'p1', supplyItemId: `catalog-${key}`,
      itemCode: key === 'a' ? 'ITM-101' : 'ITM-102',
      itemName: key === 'a' ? 'Impressora' : 'Monitor',
      itemCategory: 'Equipamentos', itemFinancialGroup: 'equipment',
      unit: 'un', destinations: [],
    })),
    orders: orders.map((order) => ({
      id: order.id, status: 'active', purchasedOn: '2026-10-19',
      lines: order.lines.map((line, index) => {
        const targetStores = line.stores || [selectedStores[0].id];
        return {
          id: `${order.id}-line-${index}`, orderId: order.id,
          purchaseItemId: `pi-${line.item}`, itemCode: line.item === 'a' ? 'ITM-101' : 'ITM-102',
          itemName: line.item === 'a' ? 'Impressora' : 'Monitor',
          quantity: String(targetStores.length), unit: 'un',
          unitPrice: money(line.priceCents), discountAmount: '0',
          shippingType: 'free', actualShippingType: 'free', shippingAmount: '0',
          otherCosts: '0', lineTotal: money(line.priceCents * targetStores.length),
          storeDistributionStatus: 'confirmed',
          stores: targetStores.map((storeId) => {
            const store = selectedStores.find((entry) => entry.id === storeId);
            if (!store) throw new Error(`Unknown fixture store ${storeId}`);
            return {
              id: `alloc-${order.id}-${index}-${storeId}`, storeId,
              code: store.code, name: store.name, city: store.city,
              state: store.state, quantity: '1', allocationSource: 'direct',
            };
          }),
        };
      }),
    })),
    payments: orders.flatMap((order) => [
      ...(order.paidCents === undefined ? [] : [{
        id: `paid-${order.id}`, purchaseId: 'p1', purchaseOrderId: order.id,
        amount: money(order.paidCents), status: 'paid',
      }]),
      ...(order.plannedCents === undefined ? [] : [{
        id: `planned-${order.id}`, purchaseId: 'p1', purchaseOrderId: order.id,
        amount: money(order.plannedCents), status: 'planned',
      }]),
    ]),
    attachments: [], quoteAttachments: [],
  } as unknown as PurchaseV2;
}

function financialFixtureReport(orders: FixtureOrder[], selectedStores = stores.slice(0, 1)) {
  const purchases = [compositionPurchase(orders, selectedStores)];
  const purchaseStoreRows = buildFinanceStoreRows(purchases, []);
  const overviewRows = selectedStores.map((store) => {
    const row = purchaseStoreRows.find((current) => current.storeId === store.id);
    const realized = row?.realizedCents || 0n;
    const paid = row?.paidCents || 0n;
    return {
      storeId: store.id, code: store.code,
      budgetBbCents: 0n, budgetTotalCents: 0n,
      realizedTotalCents: realized, realizedVarianceToBbCents: -realized,
      paidCents: paid, payableCents: realized > paid ? realized - paid : 0n,
    };
  }) as FinanceOverviewStoreRow[];
  return buildFinancialCompositionReport({
    stores: selectedStores, selectedStoreId: '', overviewRows,
    purchaseStoreRows, purchases, plannedBudgetItems: [], works: [],
  });
}

describe('Composição financeira — individualização segura dos pagamentos', () => {
  it('marca dois itens como Pago quando o pedido da loja está integralmente quitado', () => {
    const report = financialFixtureReport([{
      id: 'order-1', lines: [{item: 'a',priceCents: 6000},{item: 'b',priceCents: 4000}],
      paidCents: 10000,
    }]);
    expect(report.lines.map((line) => [line.reference, line.status, line.paidCents, line.payableCents]))
      .toEqual([['ITM-101','Pago',6000n,0n],['ITM-102','Pago',4000n,0n]]);
    expect(report.totals.paidCents).toBe(10000n);
    expect(report.groups[0].paidCents).toBe(10000n);
    expect(report.reconciliation).toEqual({ budget:true,realized:true,paid:true,payable:true });
  });

  it('marca itens comprados sem nenhum pagamento realizado como A pagar, mesmo havendo boleto programado', () => {
    const report = financialFixtureReport([{
      id: 'order-1', lines: [{item:'a',priceCents:6000},{item:'b',priceCents:4000}],
      plannedCents:10000,
    }]);
    expect(report.lines.map((line) => [line.status,line.paidCents,line.payableCents]))
      .toEqual([['A pagar',0n,6000n],['A pagar',0n,4000n]]);
    expect(report.totals.paidCents).toBe(0n);
    expect(report.totals.payableCents).toBe(10000n);
  });

  it('não divide arbitrariamente o pagamento parcial de um pedido com vários itens', () => {
    const report = financialFixtureReport([{
      id: 'order-1', lines: [{item:'a',priceCents:6000},{item:'b',priceCents:4000}],
      paidCents:3000,
    }]);
    expect(report.lines.map((line) => [line.status,line.paidCents,line.payableCents]))
      .toEqual([['Não individualizado',null,null],['Não individualizado',null,null]]);
    expect(report.totals.paidCents).toBe(3000n);
    expect(report.groups[0].paidCents).toBe(3000n);
  });

  it('preserva a individualização de pagamento parcial com item único', () => {
    const report = financialFixtureReport([{
      id: 'order-1', lines: [{item:'a',priceCents:6000}],paidCents:3000,
    }]);
    expect(report.lines.find((line) => line.reference==='ITM-101'))
      .toMatchObject({ status:'Parcialmente pago',paidCents:3000n,payableCents:3000n });
  });

  it('não mascara pagamento parcial ambíguo de um item que também consta de um pedido totalmente pago', () => {
    const report = financialFixtureReport([
      {id:'order-full',lines:[{item:'a',priceCents:1000}],paidCents:1000},
      {id:'order-partial',lines:[{item:'a',priceCents:2000},{item:'b',priceCents:1000}],paidCents:1000},
    ]);
    expect(report.lines.map((line) => [line.reference,line.status]))
      .toEqual([['ITM-101','Não individualizado'],['ITM-102','Não individualizado']]);
    expect(report.totals.paidCents).toBe(2000n);
    expect(report.groups[0].paidCents).toBe(2000n);
  });

  it('avalia cada loja individualmente em pedido compartilhado e totalmente pago', () => {
    const report = financialFixtureReport([{
      id:'order-shared',
      lines:[
        {item:'a',priceCents:6000,stores:['s1','s2']},
        {item:'b',priceCents:4000,stores:['s1','s2']},
      ],
      paidCents:20000,
    }],stores);
    expect(report.lines).toHaveLength(4);
    expect(report.lines.every((line) => line.status==='Pago')).toBe(true);
    expect(report.lines.reduce((total,line) => total+(line.paidCents||0n),0n)).toBe(20000n);
    expect(report.totals.paidCents).toBe(20000n);
    expect(report.reconciliation.paid).toBe(true);
  });

  it('não classifica pagamento parcial de pedido compartilhado com vários itens como quitado', () => {
    const report = financialFixtureReport([{
      id:'order-shared',
      lines:[
        {item:'a',priceCents:6000,stores:['s1','s2']},
        {item:'b',priceCents:4000,stores:['s1','s2']},
      ],
      paidCents:10000,
    }],stores);
    expect(report.lines).toHaveLength(4);
    expect(report.lines.every((line) => line.status==='Não individualizado')).toBe(true);
    expect(report.totals.paidCents).toBe(10000n);
    expect(report.groups[0].paidCents).toBe(10000n);
  });
});
