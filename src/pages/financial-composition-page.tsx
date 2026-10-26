import {
  ArrowDownToLine, Building2, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FileText,
  Landmark, ReceiptText, RefreshCcw, Search, WalletCards,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading } from '../components/ui';
import { listFinanceReimbursements } from '../data/finance/finance-repository';
import { listPlannedBudget } from '../data/planned-budget/planned-budget-repository';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import { listFinanceStoreBudgets, listWorkServices } from '../data/works/works-repository';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import {
  buildFinancialCompositionReport, type CompositionLine,
} from '../domain/finance-composition-report';
import { buildFinanceOverviewRows, type FinanceOverviewStoreRow } from '../domain/finance-overview';
import { buildUnifiedFinancePayments, type UnifiedFinancePaymentRow } from '../domain/finance-payments';
import { formatBRL } from '../domain/supply-calculations';
import type { FinanceStoreRow } from '../domain/finance-types';
import type { PlannedBudgetItem } from '../domain/planned-budget-types';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { WorkService } from '../domain/works-types';
import '../pages/finance-store-detail-page.css';
import './financial-composition-page.css';

type ReportData = {
  stores: Store[];
  overviewRows: FinanceOverviewStoreRow[];
  storeRows: FinanceStoreRow[];
  purchases: PurchaseV2[];
  plannedBudgetItems: PlannedBudgetItem[];
  works: WorkService[];
  payments: UnifiedFinancePaymentRow[];
};
const groupNames = {
  all: 'Todos os grupos',
  equipment: 'Equipamentos',
  furniture: 'Mobiliário',
  works: 'Obras e Serviços',
} as const;
type GroupFilter = keyof typeof groupNames;
const statusNames = {
  all: 'Todas as situações',
  budget: 'Orçado',
  paid: 'Pago',
  partial: 'Parcialmente pago',
  due: 'A pagar',
  unknown: 'Não individualizado',
} as const;
type StatusFilter = keyof typeof statusNames;
const DETAIL_BATCH_SIZE = 60;
const amount = (cents: bigint | null) => cents === null ? '—' : formatBRL(cents);
function moneyCsv(cents: bigint | null) {
  if (cents === null) return 'Não individualizado';
  const positive = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${positive / 100n},${String(positive % 100n).padStart(2,'0')}`;
}
function downloadCsv(rows: string[][]) {
  const body = '\uFEFF' + rows.map((line) => line.map((cell) =>
    `"${cell.replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'Composicao_Financeira_Implanta27.csv';
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function financialStatus(row: CompositionLine) {
  return <span className={`financial-composition__status financial-composition__status--${row.status === 'Pago' ? 'paid' : row.status === 'Orçado' ? 'budget' : row.status === 'Não individualizado' ? 'unknown' : 'due'}`}>
    {row.status}
  </span>;
}
type OverviewMetricProps = {
  label: string;
  value: bigint;
  icon: ReactNode;
  isBalance?: boolean;
};
function OverviewMetric({label,value,icon,isBalance=false}:OverviewMetricProps) {
  const tone = !isBalance ? '' : value<0n ? ' is-negative' : value>0n ? ' is-positive' : ' is-zero';
  return (
    <article className={`financial-composition__overview-metric${tone}`}>
      <span className="financial-composition__overview-metric-icon" aria-hidden="true">{icon}</span>
      <div className="financial-composition__overview-metric-body">
        <span className="financial-composition__overview-metric-label">{label}</span>
      </div>
      <span className="financial-composition__overview-metric-money"
        title={formatBRL(value)}>
        <small>R$</small>
        <strong className="financial-composition__overview-metric-value">
          {formatBRL(value).replace(/^R\$\s*/, '')}
        </strong>
      </span>
    </article>
  );
}
export function FinancialCompositionPage() {
  const { can } = useSession();
  const [data,setData] = useState<ReportData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [storeId,setStoreId] = useState('');
  const [group,setGroup] = useState<GroupFilter>('all');
  const [status,setStatus] = useState<StatusFilter>('all');
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState<string|null>(null);
  const [limit,setLimit] = useState(DETAIL_BATCH_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const resetDetailView = () => {
    setExpanded(null);
    setLimit(DETAIL_BATCH_SIZE);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const load = useCallback(async () => {
    setLoading(true);setError(null);
    try {
      const [stores,purchases,planned,works,budgets,reimbursements] = await Promise.all([
        listStores(),listSupplyPurchasesV2(),listPlannedBudget(),
        listWorkServices(),listFinanceStoreBudgets(),listFinanceReimbursements(),
      ]);
      const storeRows = buildFinanceStoreRows(purchases, reimbursements);
      const overviewRows = buildFinanceOverviewRows({
        stores, purchases, plannedBudgetItems:planned.items,
        purchaseStoreRows:storeRows, works, budgets,
      });
      setData({
        stores,overviewRows,storeRows,purchases,plannedBudgetItems:planned.items,works,
        payments:buildUnifiedFinancePayments(purchases,works),
      });
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar a Composição Financeira.');
    } finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const report = useMemo(()=> data ? buildFinancialCompositionReport({
    stores:data.stores, selectedStoreId:storeId, overviewRows:data.overviewRows,
    purchaseStoreRows:data.storeRows, purchases:data.purchases,
    plannedBudgetItems:data.plannedBudgetItems,works:data.works,
  }) : null,[data,storeId]);

  const filteredLines = useMemo(()=>{
    if(!report) return [];
    const query = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return report.lines.filter((line)=>
      (group==='all'||line.group===group) &&
      (status==='all'||line.status===statusNames[status]) &&
      (!query || [line.storeLabel,line.reference,line.name,line.origin,line.status].join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)));
  },[report,group,status,search]);
  const visibleLines = filteredLines.slice(0,limit);

  // Keep the initial DOM small. Append the next block automatically when users
  // approach the bottom of this report's own scrolling region.
  useEffect(()=>{
    const scrollRoot = scrollRef.current;
    const sentinel = sentinelRef.current;
    if(!scrollRoot||!sentinel||filteredLines.length<=limit)return;
    const observer = new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting) {
        setLimit((current)=>Math.min(current+DETAIL_BATCH_SIZE,filteredLines.length));
      }
    },{root:scrollRoot,rootMargin:'0px 0px 240px 0px'});
    observer.observe(sentinel);
    return ()=>observer.disconnect();
  },[filteredLines.length,limit]);
  const canSeePayments = can('finance.view') && can('finance.payments_view');
  const canSeeDetail = can('finance.view') && can('finance.store_detail_view');

  const paymentLink = (line: CompositionLine): string | null => {
    if(!data||!canSeePayments)return null;
    const matching = data.payments.filter((payment)=>
      payment.storeIds.includes(line.storeId) &&
      (line.kind==='work'
        ? payment.workServiceId===line.workServiceId
        : payment.supplyItemIds.includes(line.supplyItemId||'')));
    if(!matching.length)return null;
    const view = matching.some((payment)=>payment.status==='paid') ? 'paid'
      : matching.some((payment)=>payment.status==='planned') ? 'planned' : 'unscheduled';
    const params = new URLSearchParams({view,store:line.storeId});
    params.set(line.kind==='work' ? 'service' : 'item',
      line.kind==='work' ? line.workServiceId||'' : line.supplyItemId||'');
    return `/financeiro/pagamentos?${params.toString()}`;
  };
  const exportRows = () => {
    if(!report)return;
    const t = report.totals;
    const rows = [
      ['Composição Financeira','Implanta 27'],
      ['Filtro de loja',storeId ? data?.stores.find((store)=>store.id===storeId)?.code||storeId : 'Todas as lojas'],
      ['Indicador','Valor'],['Verba BB',moneyCsv(t.budgetBbCents)],
      ['Orçado total',moneyCsv(t.budgetTotalCents)],['Realizado total',moneyCsv(t.realizedTotalCents)],
      ['Diferença (realizado - orçado)',moneyCsv(t.executionDifferenceCents)],
      ['Diferença (verba BB - realizado)',moneyCsv(t.realizedVarianceToBbCents)],
      ['Pago',moneyCsv(t.paidCents)],['A pagar',moneyCsv(t.payableCents)],
      [],['Grupo','Orçado','Realizado','Diferença orçado - realizado','Pago','A pagar'],
      ...report.groups.map((g)=>[g.label,moneyCsv(g.budgetCents),moneyCsv(g.realizedCents),
        moneyCsv(g.differenceCents),moneyCsv(g.paidCents),moneyCsv(g.payableCents)]),
      [],['Loja','UF','Grupo','Código','Descrição','Orçado','Realizado','Pago','A pagar','Situação','Observação'],
      ...filteredLines.map((r)=>[
        r.storeLabel,r.storeState,groupNames[r.group],r.reference,r.name,
        moneyCsv(r.budgetCents),moneyCsv(r.realizedCents),moneyCsv(r.paidCents),
        moneyCsv(r.payableCents),r.status,r.paymentAllocationNote,
      ]),
    ];
    downloadCsv(rows);
  };
  const t=report?.totals;
  return (
    <div className="page-stack finance-store-detail financial-composition">
      <header className="finance-store-detail__heading">
        <div className="finance-store-detail__identity">
          <span className="eyebrow">Dashboard · Relatório financeiro</span>
          <h2>Composição Financeira</h2>
          <p>Visão consolidada de todas as lojas e detalhamento por unidade.</p>
        </div>
        <div className="finance-store-detail__actions">
          <button type="button" className="button button--secondary button--small"
            disabled={loading} onClick={()=>void load()}><RefreshCcw size={16}/> Atualizar</button>
          <button type="button" className="button button--secondary button--small"
            disabled={!report} onClick={exportRows}><ArrowDownToLine size={16}/> Exportar CSV</button>
        </div>
      </header>
      <section className="financial-composition__filters" aria-label="Filtros da Composição Financeira">
        <label>Loja
          <select value={storeId} onChange={(event)=>{
            setStoreId(event.target.value);resetDetailView();}}>
            <option value="">Todas as lojas — consolidado</option>
            {(data?.stores||[]).map((store)=>
              <option value={store.id} key={store.id}>
                {store.code} · {store.name} — {store.city}/{store.state}
              </option>)}
          </select>
        </label>
        <label>Grupo
          <select value={group} onChange={(event)=>{
            setGroup(event.target.value as GroupFilter);resetDetailView();}}>
            {(Object.entries(groupNames) as Array<[GroupFilter,string]>).map(([key,name])=>
              <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>Situação financeira
          <select value={status} onChange={(event)=>{
            setStatus(event.target.value as StatusFilter);resetDetailView();}}>
            {(Object.entries(statusNames) as Array<[StatusFilter,string]>).map(([key,name])=>
              <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>Buscar
          <span className="financial-composition__search"><Search size={16}/>
            <input value={search} onChange={(event)=>{setSearch(event.target.value);resetDetailView();}}
              placeholder="Item, serviço, código, fornecedor..." />
          </span>
        </label>
        <button type="button" className="button button--secondary button--small"
          onClick={()=>{setStoreId('');setGroup('all');setStatus('all');setSearch('');resetDetailView();}}>
          Limpar filtros
        </button>
      </section>
      {loading ? <InlineLoading label="Consolidando informações financeiras..." /> :
        error ? <ErrorState message={error} onRetry={()=>void load()}/> : report && t && <>
        <section className="financial-composition__overview"
          aria-label="Resumo financeiro consolidado">
          <section className="financial-composition__overview-section financial-composition__overview-section--planning"
            aria-labelledby="financial-composition-planning">
            <header className="financial-composition__overview-heading">
              <ClipboardList size={19} aria-hidden="true"/>
              <h3 id="financial-composition-planning">Planejamento</h3>
            </header>
            <div className="financial-composition__overview-metrics">
              <OverviewMetric label="Verba BB" value={t.budgetBbCents} icon={<Landmark size={21}/>}/>
              <OverviewMetric label="Orçado total" value={t.budgetTotalCents} icon={<ReceiptText size={21}/>}/>
            </div>
          </section>
          <section className="financial-composition__overview-section financial-composition__overview-section--execution"
            aria-labelledby="financial-composition-execution">
            <header className="financial-composition__overview-heading">
              <Building2 size={19} aria-hidden="true"/>
              <h3 id="financial-composition-execution">Execução</h3>
            </header>
            <div className="financial-composition__overview-metrics">
              <OverviewMetric label="Realizado" value={t.realizedTotalCents} icon={<Building2 size={21}/>}/>
              <OverviewMetric label="Dif. em relação à verba" value={t.realizedVarianceToBbCents}
                icon={<CheckCircle2 size={21}/>} isBalance/>
            </div>
          </section>
          <section className="financial-composition__overview-section financial-composition__overview-section--financial"
            aria-labelledby="financial-composition-financial">
            <header className="financial-composition__overview-heading">
              <WalletCards size={19} aria-hidden="true"/>
              <h3 id="financial-composition-financial">Financeiro</h3>
            </header>
            <div className="financial-composition__overview-metrics">
              <OverviewMetric label="Pago" value={t.paidCents} icon={<WalletCards size={21}/>}/>
              <OverviewMetric label="A pagar" value={t.payableCents} icon={<WalletCards size={21}/>}/>
            </div>
          </section>
        </section>
        <section className="finance-store-detail__group-summary">
          <header>
            <div><h3>Composição Financeira</h3>
              <p>{storeId?'Valores da loja selecionada.':'Valores consolidados de todas as lojas.'} Mesmos critérios do Detalhe da Loja.</p>
            </div>
            <span className="financial-composition__store-count">{report.storesCount} loja(s)</span>
          </header>
          <div className="finance-store-detail__composition-scroll">
            <table className="finance-store-detail__composition-table">
              <thead><tr><th>Grupo</th><th>Orçado</th><th>Realizado</th><th>Diferença</th><th>Pago</th><th>A pagar</th></tr></thead>
              <tbody>
                {report.groups.map((row)=><tr key={row.key}>
                  <td><strong>{row.label}</strong>
                    <small>{row.key==='works'?'Serviços, mão de obra e execução':'Itens conforme categoria histórica da compra'}</small></td>
                  <td><strong>{formatBRL(row.budgetCents)}</strong></td>
                  <td>{formatBRL(row.realizedCents)}</td>
                  <td title="Orçado menos realizado">
                    <strong className={row.differenceCents<0n?'value-negative':'value-positive'}>{formatBRL(row.differenceCents)}</strong>
                  </td>
                  <td>{formatBRL(row.paidCents)}</td>
                  <td>{formatBRL(row.payableCents)}</td>
                </tr>)}
                <tr className="finance-store-detail__composition-total">
                  <td><strong>{storeId?'Total da loja':'Total das lojas'}</strong></td>
                  <td><strong>{formatBRL(t.budgetTotalCents)}</strong></td>
                  <td><strong>{formatBRL(t.realizedTotalCents)}</strong></td>
                  <td title="Realizado menos orçado">
                    <strong className={t.executionDifferenceCents>0n?'value-negative':'value-positive'}>
                      {formatBRL(t.executionDifferenceCents)}
                    </strong>
                  </td>
                  <td><strong>{formatBRL(t.paidCents)}</strong></td>
                  <td><strong>{formatBRL(t.payableCents)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          {Object.entries(report.reconciliation).some(([,ok])=>!ok) && (
            <p className="financial-composition__reconcile-note" role="status">
              {Object.entries(report.reconciliation).filter(([,ok])=>!ok).map(([key])=>
                ({budget:'Orçado',realized:'Realizado',paid:'Pago',payable:'A pagar'} as Record<string,string>)[key]).join(', ')}:
              existem diferenças entre a soma dos grupos e o total consolidado original.
              Os valores foram preservados para conferência; nenhum ajuste automático foi aplicado.
            </p>
          )}
          <small className="financial-composition__method">No detalhamento por grupo, a diferença mantém a regra histórica Orçado − Realizado. No total, a diferença é Realizado − Orçado, conforme aprovado.</small>
        </section>
        <section className="financial-composition__detail">
          <div className="financial-composition__detail-heading">
            <div><h3>Detalhamento Financeiro {storeId?'da Loja':'das Lojas'}</h3>
              <p>Itens de compra, equipamentos, mobiliário, obras e serviços em uma tabela única.</p></div>
            <span>{filteredLines.length} registro(s)</span>
          </div>
          <p className="financial-composition__allocation-note">
            <strong>Conciliação dos pagamentos:</strong> os totais de Pago e A pagar acima
            são os consolidados oficiais da loja. Nas linhas de itens de compra, “—” identifica
            pagamentos sem rateio individual comprovado; consulte Pagamentos para os lançamentos.
            Valores de obras vêm diretamente dos pagamentos dos serviços.
          </p>
          {filteredLines.length===0 ? <EmptyState title="Nenhum registro encontrado"
              detail="Altere a loja, o grupo, a situação financeira ou a busca para localizar outros registros."/> :
            <div className="financial-composition__scroll" ref={scrollRef}
              tabIndex={0} aria-label="Registros financeiros, rolagem automática">
              <table className="financial-composition__table">
                <thead><tr>
                  <th>Loja / Descrição</th><th>Grupo</th><th>Orçado</th><th>Realizado</th>
                  <th>Pago</th><th>A pagar</th><th>Situação</th><th>Detalhes</th>
                </tr></thead>
                {visibleLines.map((line)=>{
                    const isOpen=expanded===line.id;
                    const href=paymentLink(line);
                    return <tbody key={line.id} className="financial-composition__record">
                      <tr>
                        <td>
                          <span className="financial-composition__store-label">{line.storeLabel}</span>
                          <strong>{line.reference} · {line.name}</strong>
                          <small>{line.origin}</small>
                        </td>
                        <td>{groupNames[line.group]}</td>
                        <td className="financial-composition__money">{amount(line.budgetCents)}</td>
                        <td className="financial-composition__money">{amount(line.realizedCents)}</td>
                        <td className="financial-composition__money" title={line.paidCents===null?line.paymentAllocationNote:undefined}>{amount(line.paidCents)}</td>
                        <td className="financial-composition__money" title={line.payableCents===null?line.paymentAllocationNote:undefined}>{amount(line.payableCents)}</td>
                        <td>{financialStatus(line)}</td>
                        <td><button type="button" className="financial-composition__expand"
                          onClick={()=>setExpanded(isOpen?null:line.id)}
                          aria-label={`Detalhar ${line.reference}`} aria-expanded={isOpen}>
                          {isOpen?<ChevronDown size={16}/>:<ChevronRight size={16}/>}
                          {isOpen?'Fechar':'Ver'}
                        </button></td>
                      </tr>
                      {isOpen&&<tr className="financial-composition__expanded"><td colSpan={8}>
                        <div className="financial-composition__expanded-body">
                          <div><strong>{line.kind==='item'?'Item / Compra':'Obra / Serviço'}:</strong> {line.reference} · {line.name}</div>
                          <div><strong>Loja:</strong> {line.storeLabel}</div>
                          <div><strong>Origem:</strong> {line.origin}</div>
                          {line.kind==='item'&&<div><strong>Quantidades:</strong> Aprovada {Number(line.quantityApproved||0n)/1000} {line.unit} · Comprada {Number(line.quantityPurchased||0n)/1000} {line.unit}</div>}
                          {line.kind==='work'&&<div><strong>Execução:</strong> {line.progressPercent}% · <strong>Situação operacional:</strong> {line.workStatus}</div>}
                          <div><strong>Pagamento:</strong> {line.paymentAllocationNote}</div>
                          <div className="financial-composition__expanded-actions">
                            {href&&<Link className="button button--secondary button--small" to={href}>
                              <WalletCards size={15}/> Ver pagamentos
                            </Link>}
                            {canSeeDetail&&<Link className="button button--secondary button--small"
                              to={`/financeiro/lojas/${line.storeId}`}>
                              <FileText size={15}/> Ver documentos e detalhes da loja
                            </Link>}
                          </div>
                        </div>
                      </td></tr>}
                    </tbody>;
                  })}
              </table>
              {filteredLines.length>limit&&<div ref={sentinelRef}
                className="financial-composition__sentinel" aria-hidden="true"/>}
            </div>}
        </section>
      </>}
    </div>
  );
}
