import {
  ArrowDownToLine, Banknote, Building2, ChevronRight, ClipboardList,
  Coins, FileCheck2, FileText, Handshake, Info, Landmark,
  RefreshCcw, TrendingUp, WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorState, InlineLoading, Modal } from '../components/ui';
import { useSession } from '../app/session-provider';
import { listStores } from '../data/stores/stores-repository';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listWorkServices, listFinanceStoreBudgets } from '../data/works/works-repository';
import { listPlannedBudget } from '../data/planned-budget/planned-budget-repository';
import { listFinanceReimbursements } from '../data/finance/finance-repository';
import { listManagerialReimbursements } from '../data/finance/managerial-reimbursements-repository';
import { managerialSettlementsByStore,
  type ManagerialReimbursementEntry } from '../domain/managerial-reimbursements';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import { buildFinanceOverviewRows } from '../domain/finance-overview';
import { buildUnifiedFinancePayments } from '../domain/finance-payments';
import { formatBRL } from '../domain/supply-calculations';
import { buildBudgetForecast, type ForecastFilters, type ForecastIndicator } from '../domain/budget-forecast';
import { buildBbReimbursementSummary } from '../domain/bb-reimbursement-summary';
import { aggregateForecastDetailsByStore } from '../domain/forecast-store-aggregation';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { FinanceStoreRow } from '../domain/finance-types';
import type { WorkService } from '../domain/works-types';
import type { PlannedBudgetItem } from '../domain/planned-budget-types';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { Store } from '../domain/types';
import './budget-forecast-dashboard.css';

const DEFAULT_FILTERS: ForecastFilters = {
  state: '', storeId: '', operation: 'all', implantation: 'all',
};
type ForecastDataset = {
  stores: Store[];
  overview: FinanceOverviewStoreRow[];
  payments: UnifiedFinancePaymentRow[];
  storePurchases: FinanceStoreRow[];
  works: WorkService[];
  plannedBudgetItems: PlannedBudgetItem[];
  managerialEntries: ManagerialReimbursementEntry[];
};
type MetricCardConfig = {
  key: ForecastIndicator;
  label: string;
  description: string;
  icon: ReactNode;
  value: bigint | number;
  isCount?: boolean;
  isBalance?: boolean;
  note?: string;
};
function valueText(value: bigint | number, isCount?: boolean) {
  return isCount ? Number(value).toLocaleString('pt-BR') : formatBRL(value as bigint);
}
function ForecastCard({
  metric, onClick,
}: { metric: MetricCardConfig; onClick: (id: ForecastIndicator) => void }) {
  const tone = metric.isBalance
    ? (metric.value as bigint) < 0n ? 'negative' : (metric.value as bigint) > 0n ? 'positive' : 'zero'
    : 'default';
  return (
    <button type="button" className={`forecast-card forecast-card--${tone}`}
      onClick={() => onClick(metric.key)}
      title={`${metric.description} Clique para ver a composição.`}
      aria-label={`Detalhar ${metric.label}: ${valueText(metric.value, metric.isCount)}`}>
      <span className="forecast-card__icon" aria-hidden="true">{metric.icon}</span>
      <span className="forecast-card__content">
        <span className="forecast-card__label">
          <span>{metric.label}</span>
          <Info className="forecast-card__info" size={13} aria-hidden="true" />
        </span>
        <strong className="forecast-card__value">{valueText(metric.value, metric.isCount)}</strong>
        {metric.note && <small className="forecast-card__note">{metric.note}</small>}
      </span>
      <ChevronRight className="forecast-card__more" size={15} aria-hidden="true" />
    </button>
  );
}
function ForecastSection({
  color, title, icon, children,
}: { color: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={`forecast-section forecast-section--${color}`}>
      <header className="forecast-section__heading">
        <span className="forecast-section__icon">{icon}</span>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}
export function BudgetForecastDashboardPage() {
  const { can } = useSession();
  const [dataset, setDataset] = useState<ForecastDataset | null>(null);
  const [filters, setFilters] = useState<ForecastFilters>(DEFAULT_FILTERS);
  const [considerReimbursements,setConsiderReimbursements] = useState(false);
  const [openIndicator, setOpenIndicator] = useState<ForecastIndicator | null>(null);
  const [openBbComposition, setOpenBbComposition] = useState<'total' | 'received' | 'remaining' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stores, purchases, works, budgets, planned, reimbursements, managerialEntries] = await Promise.all([
        listStores(), listSupplyPurchasesV2(), listWorkServices(),
        listFinanceStoreBudgets(), listPlannedBudget(), listFinanceReimbursements(),
        listManagerialReimbursements(),
      ]);
      const purchaseStoreRows = buildFinanceStoreRows(purchases, reimbursements);
      const overview = buildFinanceOverviewRows({
        stores, purchases, works, budgets,
        purchaseStoreRows, plannedBudgetItems: planned.items,
      });
      setDataset({
        stores, overview, payments: buildUnifiedFinancePayments(purchases, works),
        storePurchases: purchaseStoreRows, works, plannedBudgetItems: planned.items, managerialEntries,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const states = useMemo(() =>
    [...new Set((dataset?.stores || []).map((store) => store.state))].sort(), [dataset]);
  const eligibleStores = useMemo(() =>
    (dataset?.stores || []).filter((store) => !filters.state || store.state === filters.state),
    [dataset, filters.state]);
  const closureUnavailable = Boolean(dataset?.stores.some((store) =>
    store.financialClosure?.state === 'unavailable'));
  const bbSettlements = useMemo(() => dataset
    ? managerialSettlementsByStore(dataset.managerialEntries, dataset.overview) : null,
    [dataset]);
  // Existing financial forecast calculations still honor the independent toggle.
  const settlementByStore = considerReimbursements ? bbSettlements ?? undefined : undefined;
  // The BB receipt summary is always visible, including with the toggle = Não.
  // Its source stores, Financeiro rows and receipts are already scoped by wave.
  const bbSummary = useMemo(() => dataset && bbSettlements
    ? buildBbReimbursementSummary(dataset.stores, dataset.overview, filters, bbSettlements)
    : null, [dataset, filters, bbSettlements]);
  const bbCompositionRows = useMemo(() => !bbSummary ? []
    : openBbComposition === 'received'
      ? bbSummary.rows.filter((row) => row.receivedCents !== 0n)
      : bbSummary.rows,
    [bbSummary, openBbComposition]);
  const bbCompositionSums = useMemo(() => bbCompositionRows.reduce((total, row) => ({
    totalCents: total.totalCents + row.totalCents,
    receivedCents: total.receivedCents + row.receivedCents,
    remainingCents: total.remainingCents + row.remainingCents,
  }), { totalCents: 0n, receivedCents: 0n, remainingCents: 0n }), [bbCompositionRows]);
  const forecast = useMemo(() =>
    dataset ? buildBudgetForecast(dataset.stores, dataset.overview, dataset.payments, filters, {
      storePurchases: dataset.storePurchases, works: dataset.works,
      plannedBudgetItems: dataset.plannedBudgetItems,
    },undefined,settlementByStore) : null,
    [dataset,filters,settlementByStore]);
  const updateFilter = <K extends keyof ForecastFilters,>(key: K, value: ForecastFilters[K]) => {
    setFilters((current) => key === 'state'
      ? { ...current, state: value, storeId: '' }
      : { ...current, [key]: value });
  };
  const indicators = useMemo((): Record<ForecastIndicator, MetricCardConfig> | null =>
    !forecast ? null : ({
      bb: { key: 'bb', label: 'Verba BB Reembolsável', icon: <Coins size={18} />,
        value: forecast.bbCents,
        note: considerReimbursements
          ? `Verba original das lojas ativas: ${formatBRL(forecast.originalBbCents)}. Descontados recebimentos e perdas finalizadas.`
          : forecast.inactiveStoresWithBudget > 0
            ? `Excluídos ${formatBRL(forecast.inactiveBudgetCents)} de ${forecast.inactiveStoresWithBudget} ${forecast.inactiveStoresWithBudget === 1 ? 'loja inativa' : 'lojas inativas'}.`
            : 'Verba BB somente das lojas ativas com verba.',
        description: considerReimbursements
          ? 'Verba BB das lojas ativas com verba positiva, menos recebimentos e perdas absorvidas em reembolsos finalizados.'
          : 'Verba BB somente das lojas operacionais ativas com verba positiva, exatamente as mesmas de Lojas Ativas com Verba.' },
      reimbursed: { key:'reimbursed', label:'Já reembolsado',icon:<Banknote size={18}/>,
        value:forecast.reimbursedCents,
        note:`Perda absorvida: ${formatBRL(forecast.absorbedCents)}`,
        description:'Valor recebido do BB. Perda absorvida contabilizada somente após finalização.' },
      absorbed: { key:'absorbed',label:'Perda absorvida',icon:<WalletCards size={18}/>,
        value:forecast.absorbedCents,
        description:'Saldo não recebido reconhecido ao finalizar o reembolso da loja.' },
      activeStores: { key: 'activeStores', label: 'Lojas Ativas com Verba', icon: <Building2 size={18} />,
        isCount: true, value: forecast.activeStores,
        note: forecast.inactiveStoresWithBudget > 0
          ? `${forecast.inactiveStoresWithBudget} ${forecast.inactiveStoresWithBudget === 1 ? 'loja inativa excluída' : 'lojas inativas excluídas'} da verba BB.`
          : 'Mesmas lojas incluídas na Verba BB Reembolsável.',
        description: 'Quantidade única de lojas operacionais ativas com verba BB positiva, inclusive lojas finalizadas. Mesma lista da composição Verba BB Reembolsável.' },
      planned: { key: 'planned', label: 'Orçamento Previsto', icon: <ClipboardList size={18}/>,
        value: forecast.plannedCents, note: 'Total planejado para implantação.',
        description: 'Orçamento previsto de itens e obras, conforme Financeiro → Visão Geral.' },
      forecastBalance: { key: 'forecastBalance', label: 'Saldo da Previsão',
        icon: <TrendingUp size={18}/>, value: forecast.forecastBalanceCents, isBalance: true,
        note: 'Verba BB Reembolsável − Orçamento Previsto',
        description: 'Diferença entre a verba disponível e o orçamento total previsto.' },
      contracted: { key: 'contracted', label: 'Orçamentos Contratados',
        icon: <FileCheck2 size={18}/>, value: forecast.contractedCents,
        description: 'Total realizado em compras, obras e serviços, conforme Financeiro → Visão Geral.' },
      contractBalance: { key: 'contractBalance', label: 'Saldo a Contratar',
        icon: <Handshake size={18}/>, value: forecast.contractBalanceCents, isBalance: true,
        note: 'Orçamento Previsto − Orçamentos Contratados',
        description: 'Diferença entre o orçamento planejado e os compromissos realizados.' },
      paid: { key: 'paid', label: 'Pago', icon: <Banknote size={18}/>,
        value: forecast.paidCents, description: 'Pagamentos quitados contabilizados em Financeiro → Pagamentos.' },
      payable: { key: 'payable', label: 'A Pagar', icon: <WalletCards size={18}/>,
        value: forecast.payableCents, note: 'Programado + Não programado',
        description: 'Lançamentos programados e não programados do Financeiro → Pagamentos.' },
      bbBalance: { key: 'bbBalance', label: 'Saldo da Verba',
        icon: <TrendingUp size={18}/>, isBalance: true, value: forecast.bbBalanceCents,
        note: 'Verba BB Reembolsável − Orçamentos Contratados',
        description: 'Saldo da verba BB após os compromissos realizados.' },
    }), [forecast,considerReimbursements]);
  // Only the popup presentation is grouped by store: financial evidence and
  // card totals continue to come directly from buildBudgetForecast.
  const modalData = useMemo(()=>{
    if(!openIndicator || !forecast || !indicators)return null;
    const indicator=indicators[openIndicator];
    const entries=aggregateForecastDetailsByStore(forecast.details[openIndicator]);
    const detailTotal=entries.reduce((total,entry)=>total+entry.amountCents,0n);
    const metricTotal=typeof indicator.value==='bigint'
      ?indicator.value:BigInt(indicator.value);
    return {indicator,entries,detailTotal,reconciles:detailTotal===metricTotal};
  },[openIndicator,forecast,indicators]);

  const exportCsv = () => {
    if (!forecast || !indicators) return;
    const keys: ForecastIndicator[] = ['bb','activeStores','planned','forecastBalance',
      'contracted','contractBalance','paid','payable','bbBalance'];
    if(considerReimbursements)keys.push('reimbursed','absorbed');
    const lines = [['Indicador','Valor','Loja','UF','Referência','Categoria','Status']];
    keys.forEach((key) => forecast.details[key].forEach((item) => {
      lines.push([
        indicators[key].label,
        key === 'activeStores' ? '1' : (() => {
          const abs = item.amountCents < 0n ? -item.amountCents : item.amountCents;
          return `${item.amountCents < 0n ? '-' : ''}${abs / 100n},${String(abs % 100n).padStart(2, '0')}`;
        })(),
        `${item.storeCode} · ${item.storeName}`,item.state,item.reference,item.category,item.status,
      ]);
    }));
    const csv = '\uFEFF' + lines.map((row) => row.map((value) =>
      `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'Previsao_Orcamentaria_Implanta27.csv';
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  };

  return (
    <section className="page-stack forecast-page">
      <header className="page-heading forecast-page-heading">
        <div><p className="eyebrow">Dashboard</p><h2>Previsão Orçamentária</h2>
          <p>Indicadores dinâmicos com as mesmas fontes de dados do Financeiro.</p></div>
        <button type="button" className="button button--secondary" onClick={() => void load()}
          disabled={loading} title="Atualizar os indicadores"><RefreshCcw size={16}/> Atualizar</button>
      </header>
      <section className="forecast-filters" aria-label="Filtros da previsão orçamentária">
        <label>UF<select value={filters.state} onChange={(e)=>updateFilter('state',e.target.value)}>
          <option value="">Todas</option>{states.map((uf)=><option key={uf} value={uf}>{uf}</option>)}
        </select></label>
        <label>Loja<select value={filters.storeId} onChange={(e)=>updateFilter('storeId',e.target.value)}>
          <option value="">Todas</option>{eligibleStores.map((store)=>
            <option key={store.id} value={store.id}>{store.code} · {store.name} — {store.city}/{store.state}</option>)}
        </select></label>
        <label>Situação da Loja<select value={filters.operation}
          onChange={(e)=>updateFilter('operation',e.target.value as ForecastFilters['operation'])}>
          <option value="all">Todas</option><option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </select></label>
        <label>Situação da Implantação<select value={filters.implantation}
          disabled={closureUnavailable}
          title={closureUnavailable ? 'Requer o esquema de fechamento financeiro em banco DEV para identificar lojas finalizadas.' : undefined}
          onChange={(e)=>updateFilter('implantation',e.target.value as ForecastFilters['implantation'])}>
          <option value="all">Todas</option><option value="open">Em andamento</option>
          <option value="closed">Finalizadas</option>
        </select></label>
        <label>Considerar reembolsos
          <select value={considerReimbursements?'yes':'no'} onChange={e=>{
            setConsiderReimbursements(e.target.value==='yes');
          }}>
            <option value="no">Não</option><option value="yes">Sim</option>
          </select>
        </label>
        <button type="button" className="button button--secondary" onClick={() => {
          setFilters(DEFAULT_FILTERS);setConsiderReimbursements(false);
        }}>
          <RefreshCcw size={16}/> Limpar filtros</button>
        <button type="button" className="button button--primary" onClick={exportCsv}
          disabled={!forecast || !can('dashboard.view')}><ArrowDownToLine size={16}/> Exportar CSV</button>
      </section>
      {!loading && !error && closureUnavailable && (
        <div className="forecast-closure-notice" role="status">
          A situação de finalização ainda não está disponível neste ambiente. O filtro
          “Situação da Implantação” permanecerá desabilitado até a migração de segurança
          ser validada e aplicada no banco DEV. Os valores financeiros continuam disponíveis.
        </div>
      )}
      {loading ? <InlineLoading label="Atualizando previsão orçamentária..." /> : error
        ? <ErrorState message={error} onRetry={() => void load()} /> : forecast && indicators && <>
          <ForecastSection color="bb" title="Verba BB Reembolsável" icon={<Landmark size={18}/>}>
            <div className="forecast-card-grid forecast-card-grid--bb-breakdown">
              <div className="forecast-bb-primary">
                <button type="button" className="forecast-card forecast-bb-total"
                  onClick={() => setOpenBbComposition('total')}
                  title="Clique para ver a composição da verba BB total por loja."
                  aria-label={`Detalhar Verba BB Total: ${formatBRL(bbSummary?.totalCents ?? 0n)}`}>
                  <span className="forecast-card__icon" aria-hidden="true"><Coins size={18}/></span>
                  <span className="forecast-card__content">
                    <span className="forecast-card__label">
                      Verba BB Total <Info className="forecast-card__info" size={13} aria-hidden="true"/>
                    </span>
                    <strong className="forecast-card__value">{formatBRL(bbSummary?.totalCents ?? 0n)}</strong>
                    <small className="forecast-card__note">Verba BB original das lojas ativas com verba.</small>
                  </span>
                </button>
                <div className="forecast-bb-mini-stack">
                  <button type="button" className="forecast-bb-mini forecast-bb-mini--received"
                    onClick={() => setOpenBbComposition('received')}
                    title="Ver lojas e valores efetivamente reembolsados pelo BB."
                    aria-label={`Detalhar Valor Reembolsado: ${formatBRL(bbSummary?.receivedCents ?? 0n)}`}>
                    <span className="forecast-bb-mini__icon" aria-hidden="true"><Banknote size={19}/></span>
                    <span className="forecast-bb-mini__content">
                      <span className="forecast-bb-mini__label">Valor Reembolsado</span>
                      <strong className="forecast-bb-mini__value">{formatBRL(bbSummary?.receivedCents ?? 0n)}</strong>
                    </span>
                    <ChevronRight className="forecast-bb-mini__more" size={14} aria-hidden="true"/>
                  </button>
                  <button type="button" className="forecast-bb-mini forecast-bb-mini--remaining"
                    onClick={() => setOpenBbComposition('remaining')}
                    title="Ver por loja a verba original menos os recebimentos."
                    aria-label={`Detalhar Verba BB a Reembolsar: ${formatBRL(bbSummary?.remainingCents ?? 0n)}`}>
                    <span className="forecast-bb-mini__icon" aria-hidden="true"><Coins size={19}/></span>
                    <span className="forecast-bb-mini__content">
                      <span className="forecast-bb-mini__label">Verba BB a Reembolsar</span>
                      <strong className="forecast-bb-mini__value">{formatBRL(bbSummary?.remainingCents ?? 0n)}</strong>
                    </span>
                    <ChevronRight className="forecast-bb-mini__more" size={14} aria-hidden="true"/>
                  </button>
                </div>
              </div>
              <ForecastCard metric={indicators.activeStores} onClick={setOpenIndicator}/>
            </div>
          </ForecastSection>
          <ForecastSection color="purple" title="Planejamento Orçamentário" icon={<ClipboardList size={18}/>}>
            <div className="forecast-card-grid">{(['planned','forecastBalance'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
          </ForecastSection>
          <ForecastSection color="blue" title="Contratações" icon={<FileText size={18}/>}>
            <div className="forecast-card-grid">
              {(['contracted','contractBalance'] as const).map((key)=>
                <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}
            </div>
            <div className="forecast-progress">
              <div className="forecast-progress__label">
                <TrendingUp size={18} aria-hidden="true" />
                <span>Execução Orçamentária (%)</span>
                <Info size={13} aria-hidden="true" />
              </div>
              <strong>{forecast.executionPercent === null ? 'Não aplicável'
                : `${forecast.executionPercent.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`}</strong>
              <div className={`forecast-progress__track ${forecast.executionPercent !== null && forecast.executionPercent > 100 ? 'forecast-progress__track--over' : ''}`}
                role="progressbar" aria-label="Percentual de execução" aria-valuemin={0}
                aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,forecast.executionPercent||0))}>
                <span style={{width:`${Math.min(100,Math.max(0,forecast.executionPercent||0))}%`}} />
              </div>
              {forecast.executionPercent !== null && forecast.executionPercent > 100 && <small>Orçamento previsto ultrapassado.</small>}
            </div>
          </ForecastSection>
          <ForecastSection color="green" title="Execução Financeira" icon={<WalletCards size={18}/>}>
            <div className="forecast-card-grid">{(['paid','payable'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
          </ForecastSection>
          <ForecastSection color="orange" title="Comparativo Final da Verba" icon={<Coins size={18}/>}>
            <div className="forecast-card-grid forecast-card-grid--three">
              {(['bb','contracted','bbBalance'] as const).map((key)=>
                <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}
            </div>
          </ForecastSection>
        </>}
      <Modal open={openBbComposition !== null && bbSummary !== null}
        onClose={() => setOpenBbComposition(null)}
        className="forecast-detail-modal forecast-bb-composition-modal"
        title={`Composição — ${openBbComposition === 'received' ? 'Valor Reembolsado'
          : openBbComposition === 'remaining' ? 'Verba BB a Reembolsar' : 'Verba BB Total'}`}
        description="Composição por loja, respeitando filtros e ondas selecionadas. Valores efetivamente recebidos, sem deduzir perdas absorvidas.">
        {bbSummary && openBbComposition && <div className="forecast-bb-composition">
          <div className="forecast-detail__total">
            <strong>Total: {formatBRL(openBbComposition === 'received'
              ? bbSummary.receivedCents
              : openBbComposition === 'remaining' ? bbSummary.remainingCents : bbSummary.totalCents)}</strong>
            <small>{bbCompositionRows.length} {bbCompositionRows.length === 1 ? 'loja' : 'lojas'}</small>
          </div>
          {bbCompositionRows.length ? <div className="forecast-bb-composition__scroll">
            <table>
              <thead><tr><th>Loja</th><th>UF</th><th>Verba BB Total</th>
                <th>Valor Reembolsado</th><th>Verba BB a Reembolsar</th></tr></thead>
              <tbody>{bbCompositionRows.map((row) => <tr key={row.storeId}>
                <td data-label="Loja"><strong>{row.storeCode}</strong> · {row.storeName}</td>
                <td data-label="UF">{row.state}</td>
                <td data-label="Verba BB Total">{formatBRL(row.totalCents)}</td>
                <td data-label="Valor Reembolsado" className="forecast-bb-composition__received">
                  {formatBRL(row.receivedCents)}</td>
                <td data-label="Verba BB a Reembolsar" className="forecast-bb-composition__remaining">
                  {formatBRL(row.remainingCents)}</td>
              </tr>)}</tbody>
              <tfoot><tr>
                <th colSpan={2}>Total das lojas exibidas</th>
                <th>{formatBRL(bbCompositionSums.totalCents)}</th>
                <th className="forecast-bb-composition__received">{formatBRL(bbCompositionSums.receivedCents)}</th>
                <th className="forecast-bb-composition__remaining">{formatBRL(bbCompositionSums.remainingCents)}</th>
              </tr></tfoot>
            </table>
          </div> : <p>Nenhuma loja com reembolso recebido para os filtros e ondas selecionados.</p>}
        </div>}
      </Modal>
      <Modal open={Boolean(modalData)} onClose={()=>setOpenIndicator(null)}
        className="forecast-detail-modal"
        title={modalData ? `Composição — ${modalData.indicator.label}` : 'Composição'}
        description="Consulta somente leitura, com os filtros ativos aplicados.">
        {modalData && <div className="forecast-detail">
          <div className="forecast-detail__total">
            <strong>Total: {valueText(modalData.indicator.value, modalData.indicator.isCount)}</strong>
            <small>{modalData.entries.length} {modalData.entries.length===1?'loja':'lojas'}</small>
          </div>
          {!modalData.reconciles && <p className="forecast-detail__warning" role="alert">
            Divergência de conciliação: a soma das lojas ({valueText(
              modalData.detailTotal,modalData.indicator.isCount
            )}) não corresponde ao total do indicador. Confira os lançamentos de origem.
          </p>}
          {modalData.entries.length ? <div className="forecast-detail__scroll">
            <table>
              <thead><tr>
                <th>Loja</th><th>UF</th><th>Linhas de origem</th><th>Total por loja</th>
              </tr></thead>
              <tbody>{modalData.entries.map((entry)=><tr key={entry.id}>
                <td data-label="Loja" title={`${entry.storeCode} · ${entry.storeName}`}>
                  <span className="forecast-detail__store">
                    <span className="forecast-detail__store-code">{entry.storeCode}</span>
                    <span className="forecast-detail__store-separator"> · </span>
                    <span className="forecast-detail__store-name">{entry.storeName}</span>
                  </span>
                </td>
                <td data-label="UF">{entry.state}</td>
                <td data-label="Linhas de origem">{entry.sourceRows.toLocaleString('pt-BR')}</td>
                <td data-label="Total por loja">{valueText(entry.amountCents,modalData.indicator.isCount)}</td>
              </tr>)}</tbody>
              <tfoot><tr><th colSpan={3}>Total detalhado</th>
                <th>{valueText(modalData.detailTotal,modalData.indicator.isCount)}</th>
              </tr></tfoot>
            </table>
          </div> : <p>Não existem registros para os filtros selecionados.</p>}
        </div>}
      </Modal>
    </section>
  );
}
