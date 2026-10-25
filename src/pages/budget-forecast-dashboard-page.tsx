import {
  ArrowDownToLine, Banknote, Building2, ClipboardList,
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
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import { buildFinanceOverviewRows } from '../domain/finance-overview';
import { buildUnifiedFinancePayments } from '../domain/finance-payments';
import { formatBRL } from '../domain/supply-calculations';
import { buildBudgetForecast, type ForecastFilters, type ForecastIndicator } from '../domain/budget-forecast';
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
      <span className="forecast-card__icon">{metric.icon}</span>
      <span className="forecast-card__content">
        <span className="forecast-card__label">{metric.label} <Info size={14} aria-hidden="true" /></span>
        <strong>{valueText(metric.value, metric.isCount)}</strong>
        {metric.note && <small>{metric.note}</small>}
      </span>
    </button>
  );
}
function ForecastSection({
  color, title, icon, children,
}: { color: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={`forecast-section forecast-section--${color}`}>
      <header className="forecast-section__heading"><span>{icon}</span><h3>{title}</h3></header>
      {children}
    </section>
  );
}
export function BudgetForecastDashboardPage() {
  const { can } = useSession();
  const [dataset, setDataset] = useState<ForecastDataset | null>(null);
  const [filters, setFilters] = useState<ForecastFilters>(DEFAULT_FILTERS);
  const [openIndicator, setOpenIndicator] = useState<ForecastIndicator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stores, purchases, works, budgets, planned, reimbursements] = await Promise.all([
        listStores(), listSupplyPurchasesV2(), listWorkServices(),
        listFinanceStoreBudgets(), listPlannedBudget(), listFinanceReimbursements(),
      ]);
      const purchaseStoreRows = buildFinanceStoreRows(purchases, reimbursements);
      const overview = buildFinanceOverviewRows({
        stores, purchases, works, budgets,
        purchaseStoreRows, plannedBudgetItems: planned.items,
      });
      setDataset({
        stores, overview, payments: buildUnifiedFinancePayments(purchases, works),
        storePurchases: purchaseStoreRows, works, plannedBudgetItems: planned.items,
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
  const forecast = useMemo(() =>
    dataset ? buildBudgetForecast(dataset.stores, dataset.overview, dataset.payments, filters, {
      storePurchases: dataset.storePurchases, works: dataset.works,
      plannedBudgetItems: dataset.plannedBudgetItems,
    }) : null,
    [dataset, filters]);
  const updateFilter = <K extends keyof ForecastFilters,>(key: K, value: ForecastFilters[K]) => {
    setFilters((current) => key === 'state'
      ? { ...current, state: value, storeId: '' }
      : { ...current, [key]: value });
  };
  const indicators = useMemo((): Record<ForecastIndicator, MetricCardConfig> | null =>
    !forecast ? null : ({
      bb: { key: 'bb', label: 'Verba BB Reembolsável', icon: <Coins size={31} />,
        value: forecast.bbCents, description: 'Total de verba BB atribuído às lojas selecionadas.' },
      activeStores: { key: 'activeStores', label: 'Lojas Ativas com Verba', icon: <Building2 size={29} />,
        isCount: true, value: forecast.activeStores,
        description: 'Quantidade única de lojas operacionais ativas com verba BB, inclusive lojas finalizadas.' },
      planned: { key: 'planned', label: 'Orçamento Previsto', icon: <ClipboardList size={29}/>,
        value: forecast.plannedCents, description: 'Orçamento previsto de itens e obras, conforme Financeiro → Visão Geral.' },
      forecastBalance: { key: 'forecastBalance', label: 'Saldo da Previsão',
        icon: <TrendingUp size={29}/>, value: forecast.forecastBalanceCents, isBalance: true,
        note: 'Verba BB Reembolsável − Orçamento Previsto',
        description: 'Diferença entre a verba disponível e o orçamento total previsto.' },
      contracted: { key: 'contracted', label: 'Orçamentos Contratados',
        icon: <FileCheck2 size={28}/>, value: forecast.contractedCents,
        description: 'Total realizado em compras, obras e serviços, conforme Financeiro → Visão Geral.' },
      contractBalance: { key: 'contractBalance', label: 'Saldo a Contratar',
        icon: <Handshake size={29}/>, value: forecast.contractBalanceCents, isBalance: true,
        note: 'Orçamento Previsto − Orçamentos Contratados',
        description: 'Diferença entre o orçamento planejado e os compromissos realizados.' },
      paid: { key: 'paid', label: 'Pago', icon: <Banknote size={29}/>,
        value: forecast.paidCents, description: 'Pagamentos quitados contabilizados em Financeiro → Pagamentos.' },
      payable: { key: 'payable', label: 'A Pagar', icon: <WalletCards size={29}/>,
        value: forecast.payableCents, note: 'Programado + Não programado',
        description: 'Lançamentos programados e não programados do Financeiro → Pagamentos.' },
      bbBalance: { key: 'bbBalance', label: 'Saldo da Verba',
        icon: <TrendingUp size={29}/>, isBalance: true, value: forecast.bbBalanceCents,
        note: 'Verba BB Reembolsável − Orçamentos Contratados',
        description: 'Saldo da verba BB após os compromissos realizados.' },
    }), [forecast]);
  const modalData = openIndicator && forecast && indicators
    ? { indicator: indicators[openIndicator], entries: forecast.details[openIndicator] }
    : null;

  const exportCsv = () => {
    if (!forecast || !indicators) return;
    const keys: ForecastIndicator[] = ['bb','activeStores','planned','forecastBalance',
      'contracted','contractBalance','paid','payable','bbBalance'];
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
        <button type="button" className="button button--secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
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
          <ForecastSection color="bb" title="Verba BB Reembolsável" icon={<Landmark size={23}/>}>
            <div className="forecast-card-grid">{(['bb','activeStores'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
          </ForecastSection>
          <ForecastSection color="purple" title="Planejamento Orçamentário" icon={<ClipboardList size={23}/>}>
            <div className="forecast-card-grid">{(['planned','forecastBalance'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
          </ForecastSection>
          <ForecastSection color="blue" title="Contratações" icon={<FileText size={23}/>}>
            <div className="forecast-card-grid">{(['contracted','contractBalance'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
            <div className="forecast-progress">
              <div><span>Execução orçamentária</span>
                <strong>{forecast.executionPercent === null ? 'Não aplicável'
                  : `${forecast.executionPercent.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`}</strong></div>
              <div className={`forecast-progress__track ${forecast.executionPercent !== null && forecast.executionPercent > 100 ? 'forecast-progress__track--over' : ''}`}
                role="progressbar" aria-label="Percentual de execução" aria-valuemin={0}
                aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,forecast.executionPercent||0))}>
                <span style={{width:`${Math.min(100,Math.max(0,forecast.executionPercent||0))}%`}} />
              </div>
              {forecast.executionPercent !== null && forecast.executionPercent > 100 && <small>Orçamento previsto ultrapassado.</small>}
            </div>
          </ForecastSection>
          <ForecastSection color="green" title="Execução Financeira" icon={<WalletCards size={23}/>}>
            <div className="forecast-card-grid">{(['paid','payable'] as const).map((key)=>
              <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}</div>
          </ForecastSection>
          <ForecastSection color="orange" title="Comparativo Final da Verba" icon={<Coins size={23}/>}>
            <div className="forecast-card-grid forecast-card-grid--three">
              {(['bb','contracted','bbBalance'] as const).map((key)=>
                <ForecastCard key={key} metric={indicators[key]} onClick={setOpenIndicator}/>)}
            </div>
          </ForecastSection>
        </>}
      <Modal open={Boolean(modalData)} onClose={()=>setOpenIndicator(null)}
        title={modalData ? `Composição — ${modalData.indicator.label}` : 'Composição'}
        description="Consulta somente leitura, com os filtros ativos aplicados.">
        {modalData && <div className="forecast-detail">
          <div className="forecast-detail__total">
            <strong>Total: {valueText(modalData.indicator.value, modalData.indicator.isCount)}</strong>
            <small>{modalData.entries.length} registro(s)</small>
          </div>
          {modalData.entries.length ? <div className="forecast-detail__scroll"><table>
            <thead><tr><th>Loja</th><th>UF</th><th>Referência</th><th>Categoria / Status</th><th>Valor</th></tr></thead>
            <tbody>{modalData.entries.map((entry)=><tr key={entry.id}>
              <td>{entry.storeCode} · {entry.storeName}</td><td>{entry.state}</td>
              <td>{entry.reference}</td><td>{entry.category}<small>{entry.status}</small></td>
              <td>{modalData.indicator.isCount ? '1' : formatBRL(entry.amountCents)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th colSpan={4}>Total detalhado</th>
              <th>{valueText(modalData.indicator.isCount
                ? modalData.entries.length : modalData.entries.reduce((value,entry)=>value+entry.amountCents,0n),
                modalData.indicator.isCount)}</th></tr></tfoot>
          </table></div> : <p>Não existem registros para os filtros selecionados.</p>}
        </div>}
      </Modal>
    </section>
  );
}
