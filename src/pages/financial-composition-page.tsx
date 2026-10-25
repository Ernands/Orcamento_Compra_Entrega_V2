import {
  ArrowDownToLine, Building2, CheckCircle2, ChevronDown, ChevronRight, FileText,
  Landmark, ReceiptText, RefreshCcw, Search, WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { FinanceStoreBudget, WorkService } from '../domain/works-types';
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
export function FinancialCompositionPage() {
  const { can } = useSession();
  const [data,setData] = useState<ReportData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [storeId,setStoreId] = useState('');
  const [group,setGroup] = useState<GroupFilter>('all');
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState<string|null>(null);
  const [limit,setLimit] = useState(60);

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
    return report.lines.filter((line)=>group==='all'||line.group===group).filter((line)=>
      !query || [line.storeLabel,line.reference,line.name,line.origin,line.status].join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
  },[report,group,search]);
  const visibleLines = filteredLines.slice(0,limit);
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
  const availableBb = t ? t.budgetBbCents-t.budgetTotalCents : 0n;
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
            setStoreId(event.target.value);setExpanded(null);setLimit(60);}}>
            <option value="">Todas as lojas — consolidado</option>
            {(data?.stores||[]).map((store)=>
              <option value={store.id} key={store.id}>
                {store.code} · {store.name} — {store.city}/{store.state}
              </option>)}
          </select>
        </label>
        <label>Grupo
          <select value={group} onChange={(event)=>{
            setGroup(event.target.value as GroupFilter);setLimit(60);setExpanded(null);}}>
            {(Object.entries(groupNames) as Array<[GroupFilter,string]>).map(([key,name])=>
              <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>Buscar
          <span className="financial-composition__search"><Search size={16}/>
            <input value={search} onChange={(event)=>{setSearch(event.target.value);setLimit(60);}}
              placeholder="Item, serviço, código, fornecedor..." />
          </span>
        </label>
        <button type="button" className="button button--secondary button--small"
          onClick={()=>{setStoreId('');setGroup('all');setSearch('');setExpanded(null);setLimit(60);}}>
          Limpar filtros
        </button>
      </section>
      {loading ? <InlineLoading label="Consolidando informações financeiras..." /> :
        error ? <ErrorState message={error} onRetry={()=>void load()}/> : report && t && <>
        <section className="finance-store-detail__kpis finance-store-detail__kpis--grouped"
          aria-label="Resumo financeiro consolidado">
          <div className="finance-store-detail__kpi-group finance-store-detail__kpi-group--budget">
            <span className="finance-store-detail__kpi-group-title">Planejamento</span>
            <div>
              <article>
                <Landmark size={20}/><span>Verba BB</span>
                <strong title={formatBRL(t.budgetBbCents)}>{formatBRL(t.budgetBbCents)}</strong>
                <small className={`finance-store-bb-available ${availableBb<0n?'is-negative':'is-positive'}`}>
                  Disponível BB: {formatBRL(availableBb)}
                </small>
              </article>
              <article>
                <ReceiptText size={20}/><span>Orçado total</span>
                <strong title={formatBRL(t.budgetTotalCents)}>{formatBRL(t.budgetTotalCents)}</strong>
              </article>
            </div>
          </div>
          <div className="finance-store-detail__kpi-group finance-store-detail__kpi-group--execution">
            <span className="finance-store-detail__kpi-group-title">Execução</span>
            <div>
              <article className="is-primary">
                <Building2 size={20}/><span>Realizado</span>
                <strong title={formatBRL(t.realizedTotalCents)}>{formatBRL(t.realizedTotalCents)}</strong>
              </article>
              <article className={t.realizedVarianceToBbCents<0n?'is-negative':'is-positive'}>
                <CheckCircle2 size={20}/><span>Dif. em relação à verba</span>
                <strong title={formatBRL(t.realizedVarianceToBbCents)}>{formatBRL(t.realizedVarianceToBbCents)}</strong>
              </article>
            </div>
          </div>
          <div className="finance-store-detail__kpi-group finance-store-detail__kpi-group--cash">
            <span className="finance-store-detail__kpi-group-title">Financeiro</span>
            <div>
              <article><WalletCards size={20}/><span>Pago</span>
                <strong title={formatBRL(t.paidCents)}>{formatBRL(t.paidCents)}</strong></article>
              <article><WalletCards size={20}/><span>A pagar</span>
                <strong title={formatBRL(t.payableCents)}>{formatBRL(t.payableCents)}</strong></article>
            </div>
          </div>
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
                ({budget:'Orçado',realized:'Realizado',paid:'Pago',payable:'A pagar'}[key])).join(', ')}:
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
              detail="Altere a loja, o grupo ou a busca para localizar outros registros."/> :
            <div className="financial-composition__scroll">
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
            </div>}
          {filteredLines.length>limit&&<button type="button"
            className="button button--secondary financial-composition__load-more"
            onClick={()=>setLimit((current)=>current+60)}>
            Exibir mais registros ({filteredLines.length-limit} restantes)
          </button>}
          <div className="financial-composition__footer">
            <span>Os filtros de grupo e pesquisa afetam somente as linhas. Os totais acima são definidos pelo filtro de loja.</span>
            <strong>Totais oficiais: Orçado {formatBRL(t.budgetTotalCents)} · Realizado {formatBRL(t.realizedTotalCents)} · Pago {formatBRL(t.paidCents)} · A pagar {formatBRL(t.payableCents)}</strong>
          </div>
        </section>
      </>}
    </div>
  );
}
