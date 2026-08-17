import { CalendarClock, Filter, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { listPendingImplementationItems } from '../data/implementation/implementation-repository';
import type { ImplementationItemStatus, PendingImplementationItem } from '../domain/types';

export function PendingItemsPage() {
  const [items, setItems] = useState<PendingImplementationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ImplementationItemStatus | ''>('');
  const [category, setCategory] = useState('');
  const [responsible, setResponsible] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listPendingImplementationItems());
    } catch {
      setError('Nao foi possivel carregar as pendencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort(),
    [items],
  );
  const responsibles = useMemo(
    () =>
      [...new Set(items.map((item) => item.responsibleName).filter(Boolean) as string[])].sort(),
    [items],
  );
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const text = `${item.storeCode} ${item.storeName} ${item.title}`.toLocaleLowerCase('pt-BR');
        return (
          (!query || text.includes(query.toLocaleLowerCase('pt-BR'))) &&
          (!status || item.status === status) &&
          (!category || item.category === category) &&
          (!responsible || item.responsibleName === responsible) &&
          (!overdueOnly || item.overdueDays > 0)
        );
      }),
    [category, items, overdueOnly, query, responsible, status],
  );

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Implantacao</p>
          <h2>Pendencias</h2>
          <p>Atividades abertas das lojas dentro do seu escopo.</p>
        </div>
        <div className="summary-number">
          <strong>{filtered.length}</strong>
          <span>atividades</span>
        </div>
      </header>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar pendencias"
            placeholder="Loja ou atividade"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="filter-select">
          <Filter size={16} />
          <select
            aria-label="Filtrar por status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ImplementationItemStatus | '')}
          >
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="blocked">Bloqueada</option>
          </select>
        </label>
        <label className="filter-select">
          <select
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <select
            aria-label="Filtrar por responsavel"
            value={responsible}
            onChange={(event) => setResponsible(event.target.value)}
          >
            <option value="">Todos os responsaveis</option>
            {responsibles.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
          />
          Somente atrasadas
        </label>
      </div>
      {loading ? (
        <InlineLoading label="Carregando pendencias" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !filtered.length ? (
        <EmptyState
          title="Nenhuma pendencia encontrada"
          detail="Ajuste os filtros ou acompanhe as atividades concluidas em cada loja."
        />
      ) : (
        <div className="pending-list">
          <div className="pending-list__header">
            <span>Loja</span>
            <span>Atividade</span>
            <span>Responsavel</span>
            <span>Prazo</span>
            <span>Status</span>
          </div>
          {filtered.map((item) => (
            <Link className="pending-row" key={item.id} to={`/lojas/${item.storeId}/implantacao`}>
              <span>
                <strong>{item.storeCode}</strong>
                {item.storeName}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.category}</small>
              </span>
              <span>{item.responsibleName || 'Nao definido'}</span>
              <span className={item.overdueDays ? 'text-danger' : ''}>
                <CalendarClock size={15} />
                {item.dueDate
                  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
                      new Date(`${item.dueDate}T00:00:00Z`),
                    )
                  : 'Sem prazo'}
                {item.overdueDays > 0 && <small>{item.overdueDays} dias em atraso</small>}
              </span>
              <StatusBadge status={item.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
