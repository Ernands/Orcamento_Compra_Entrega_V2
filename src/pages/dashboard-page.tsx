import {
  AlertTriangle,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileQuestion,
  ListChecks,
  MapPinned,
  PackageCheck,
  ReceiptText,
  Store,
  Truck,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import {
  loadImplementationDashboard,
  loadSupplyDashboard,
} from '../data/dashboard/dashboard-repository';
import type {
  ImplementationDashboard,
  ImplementationDashboardBreakdown,
  SupplyDashboard,
  SupplyDashboardBreakdown,
} from '../domain/types';

export type DashboardView = 'overview' | 'implementation' | 'supply';

function formatDate(value: string | null) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function Metric({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'good' | 'attention' | 'danger';
}) {
  return (
    <div className={`dashboard-metric dashboard-metric--${tone}`}>
      <span>{icon}</span>
      <strong>{value.toLocaleString('pt-BR')}</strong>
      <small>{label}</small>
    </div>
  );
}

function ImplementationBreakdown({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: ReactNode;
  rows: ImplementationDashboardBreakdown[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.storeCount));
  return (
    <section className="analytics-panel">
      <header>
        <span>{icon}</span>
        <h3>{title}</h3>
      </header>
      {rows.length ? (
        rows.slice(0, 8).map((row) => (
          <div className="analytics-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>
                {row.storeCount} lojas · {row.overdueStores} atrasadas
              </span>
            </div>
            <div className="analytics-bar">
              <span style={{ width: `${(row.storeCount / max) * 100}%` }} />
            </div>
            <strong>{row.averageProgress}%</strong>
            <small>{row.pendingActivities} pendencias</small>
          </div>
        ))
      ) : (
        <EmptyState title="Sem dados" detail="Nenhuma loja acessivel para esta analise." />
      )}
    </section>
  );
}

function SupplyBreakdown({
  title,
  rows,
  suffix,
}: {
  title: string;
  rows: SupplyDashboardBreakdown[];
  suffix: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="analytics-panel analytics-panel--compact">
      <header>
        <h3>{title}</h3>
      </header>
      {rows.length ? (
        rows.map((row) => (
          <div className="supply-analytics-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              {row.secondaryValue ? (
                <span>{row.secondaryValue.toLocaleString('pt-BR')} unidades</span>
              ) : null}
            </div>
            <div className="analytics-bar">
              <span style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
            <strong>
              {row.count} {suffix}
            </strong>
          </div>
        ))
      ) : (
        <span className="analytics-empty">Sem dados acessiveis.</span>
      )}
    </section>
  );
}

function ImplementationView({
  data,
  compact = false,
}: {
  data: ImplementationDashboard;
  compact?: boolean;
}) {
  return (
    <>
      <div className={`dashboard-metrics${compact ? ' dashboard-metrics--compact' : ''}`}>
        <Metric icon={<Store size={20} />} label="Total de lojas" value={data.totalStores} />
        <Metric
          icon={<ClipboardList size={20} />}
          label="Nao iniciadas"
          value={data.notStartedStores}
          tone="attention"
        />
        <Metric
          icon={<ListChecks size={20} />}
          label="Em implantacao"
          value={data.inProgressStores}
        />
        <Metric
          icon={<CheckCircle2 size={20} />}
          label="Prontas"
          value={data.readyStores}
          tone="good"
        />
        {!compact && (
          <Metric
            icon={<AlertTriangle size={20} />}
            label="Lojas atrasadas"
            value={data.overdueStores}
            tone="danger"
          />
        )}
        {!compact && (
          <Metric
            icon={<ClipboardList size={20} />}
            label="Atividades pendentes"
            value={data.pendingActivities}
            tone="attention"
          />
        )}
        {!compact && (
          <Metric
            icon={<AlertTriangle size={20} />}
            label="Atividades criticas"
            value={data.criticalActivities}
            tone="danger"
          />
        )}
      </div>

      {!compact && (
        <div className="dashboard-analytics-grid">
          <ImplementationBreakdown
            title="Visao por UF"
            icon={<MapPinned size={18} />}
            rows={data.byState}
          />
          <ImplementationBreakdown
            title="Visao por responsavel"
            icon={<UsersRound size={18} />}
            rows={data.byResponsible}
          />
        </div>
      )}

      <section className="dashboard-section">
        <header>
          <div>
            <h3>{compact ? 'Proximas inauguracoes' : 'Lojas e andamento'}</h3>
            <p>
              {compact
                ? 'Marcos previstos nas lojas acessiveis.'
                : 'Prioridade para atrasos, pendencias e proximos vencimentos.'}
            </p>
          </div>
          {!compact && <Link to="/lojas">Abrir lojas</Link>}
        </header>
        {compact ? (
          data.upcomingOpenings.length ? (
            <div className="milestone-strip">
              {data.upcomingOpenings.map((store) => (
                <Link to={`/lojas/${store.id}/implantacao`} key={store.id}>
                  <CalendarDays size={18} />
                  <span>
                    <strong>{formatDate(store.plannedOpeningDate)}</strong>
                    <small>
                      {store.code} · {store.name}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sem inauguracoes programadas"
              detail="Nenhuma data futura foi encontrada no escopo atual."
            />
          )
        ) : data.stores.length ? (
          <div className="dashboard-store-list">
            <div className="dashboard-store-list__header">
              <span>Loja</span>
              <span>Local e responsavel</span>
              <span>Progresso</span>
              <span>Situacao</span>
              <span>Proximo vencimento</span>
            </div>
            {data.stores.map((store) => (
              <Link
                to={`/lojas/${store.id}/implantacao`}
                className="dashboard-store-row"
                key={store.id}
              >
                <div>
                  <small>{store.code}</small>
                  <strong>{store.name}</strong>
                </div>
                <div>
                  <strong>
                    {store.city} / {store.state}
                  </strong>
                  <span>{store.responsibleName || 'Responsavel nao definido'}</span>
                </div>
                <div className="dashboard-progress">
                  <span>
                    <i style={{ width: `${store.progress}%` }} />
                  </span>
                  <strong>{store.progress}%</strong>
                </div>
                <div>
                  <StatusBadge status={store.status} />
                  {store.overdueCount > 0 && (
                    <small className="text-danger">{store.overdueCount} atrasadas</small>
                  )}
                </div>
                <div>
                  <strong>{formatDate(store.nextDueDate)}</strong>
                  <span>{store.nextDueTitle || 'Sem pendencias com data'}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem lojas acessiveis"
            detail="A RLS nao retornou lojas para esta visao."
          />
        )}
      </section>
    </>
  );
}

function SupplyView({ data, compact = false }: { data: SupplyDashboard; compact?: boolean }) {
  return (
    <>
      <div className={`dashboard-metrics${compact ? ' dashboard-metrics--compact' : ''}`}>
        <Metric icon={<Boxes size={20} />} label="Itens ativos" value={data.activeItems} />
        <Metric
          icon={<PackageCheck size={20} />}
          label="Necessidades abertas"
          value={data.openNeeds}
          tone="attention"
        />
        <Metric
          icon={<FileQuestion size={20} />}
          label="Sem item vinculado"
          value={data.unlinkedNeeds}
          tone="danger"
        />
        <Metric
          icon={<Truck size={20} />}
          label="Fornecedores ativos"
          value={data.activeSuppliers}
        />
        {!compact && (
          <Metric
            icon={<ReceiptText size={20} />}
            label="Total de cotacoes"
            value={data.totalQuotes}
          />
        )}
        {!compact && (
          <Metric
            icon={<ReceiptText size={20} />}
            label="Cotacoes recebidas"
            value={data.receivedQuotes}
            tone="good"
          />
        )}
        {!compact && (
          <Metric
            icon={<CheckCircle2 size={20} />}
            label="Validas para comparativo"
            value={data.comparableQuotes}
            tone="good"
          />
        )}
      </div>

      {!compact && (
        <div className="supply-dashboard-grid">
          <SupplyBreakdown
            title="Necessidades por status"
            rows={data.needsByStatus}
            suffix="demandas"
          />
          <SupplyBreakdown
            title="Necessidades por loja"
            rows={data.needsByStore}
            suffix="demandas"
          />
          <SupplyBreakdown
            title="Itens mais recorrentes"
            rows={data.recurringItems}
            suffix="demandas"
          />
          <SupplyBreakdown title="Cotacoes por loja" rows={data.quotesByStore} suffix="cotacoes" />
          <SupplyBreakdown title="Cotacoes por item" rows={data.quotesByItem} suffix="cotacoes" />
        </div>
      )}

      {compact && (
        <section className="dashboard-section quick-links-band">
          <header>
            <div>
              <h3>Atalhos de suprimentos</h3>
              <p>Continue pelas filas que exigem decisao.</p>
            </div>
          </header>
          <div>
            <Link to="/suprimentos/necessidades">
              <FileQuestion size={18} />
              <span>
                <strong>{data.unlinkedNeeds}</strong> necessidades sem item
              </span>
            </Link>
            <Link to="/suprimentos/comparativo">
              <ReceiptText size={18} />
              <span>
                <strong>{data.comparableQuotes}</strong> cotacoes comparaveis
              </span>
            </Link>
            <Link to="/suprimentos/itens">
              <Boxes size={18} />
              <span>
                <strong>{data.activeItems}</strong> itens ativos
              </span>
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

export function DashboardPage({ view }: { view: DashboardView }) {
  const [implementation, setImplementation] = useState<ImplementationDashboard | null>(null);
  const [supply, setSupply] = useState<SupplyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === 'implementation') setImplementation(await loadImplementationDashboard());
      else if (view === 'supply') setSupply(await loadSupplyDashboard());
      else {
        const [implementationData, supplyData] = await Promise.all([
          loadImplementationDashboard(),
          loadSupplyDashboard(),
        ]);
        setImplementation(implementationData);
        setSupply(supplyData);
      }
    } catch {
      setError('Nao foi possivel carregar o dashboard com seu escopo de acesso.');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page-stack dashboard-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>
            {view === 'supply'
              ? 'Suprimentos'
              : view === 'implementation'
                ? 'Implantacao'
                : 'Visao Geral'}
          </h2>
          <p>Indicadores executivos calculados a partir do seu escopo de acesso.</p>
        </div>
      </header>
      <nav className="dashboard-tabs" aria-label="Visoes do dashboard">
        <Link className={view === 'overview' ? 'active' : ''} to="/dashboard">
          <Building2 size={17} />
          Visao Geral
        </Link>
        <Link className={view === 'implementation' ? 'active' : ''} to="/dashboard/implantacao">
          <Factory size={17} />
          Implantacao
        </Link>
        <Link className={view === 'supply' ? 'active' : ''} to="/dashboard/suprimentos">
          <Boxes size={17} />
          Suprimentos
        </Link>
      </nav>
      {loading ? (
        <InlineLoading label="Carregando dashboard" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          {view === 'overview' && implementation && supply && (
            <>
              <ImplementationView data={implementation} compact />
              <SupplyView data={supply} compact />
            </>
          )}
          {view === 'implementation' && implementation && (
            <ImplementationView data={implementation} />
          )}
          {view === 'supply' && supply && <SupplyView data={supply} />}
        </>
      )}
    </section>
  );
}
