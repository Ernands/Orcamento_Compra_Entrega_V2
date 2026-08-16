import { ArrowRight, MapPin, Search, Store as StoreIcon, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { listStores } from '../data/stores/stores-repository';
import type { Store } from '../domain/types';

export function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStores(await listStores());
    } catch {
      setError('Nao foi possivel carregar as lojas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    if (!search) return stores;
    return stores.filter((store) =>
      [store.code, store.name, store.city, store.state, store.responsibleName || '']
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(search),
    );
  }, [query, stores]);

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Base operacional</p>
          <h2>Lojas</h2>
          <p>Visualize somente as unidades liberadas para seu acesso.</p>
        </div>
        <div className="summary-number">
          <strong>{stores.length}</strong>
          <span>lojas acessiveis</span>
        </div>
      </header>
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por codigo, nome, cidade ou responsavel"
          aria-label="Buscar lojas"
        />
      </label>
      {loading ? (
        <InlineLoading label="Carregando lojas" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={stores.length === 0 ? 'Nenhuma loja liberada' : 'Nenhum resultado'}
          detail={
            stores.length === 0
              ? 'Seu acesso ainda nao possui lojas associadas.'
              : 'Ajuste os termos da busca.'
          }
        />
      ) : (
        <div className="store-list">
          {filtered.map((store) => (
            <article className="store-row" key={store.id}>
              <span className="store-row__icon">
                <StoreIcon size={21} />
              </span>
              <div className="store-row__identity">
                <span>{store.code}</span>
                <strong>{store.name}</strong>
              </div>
              <div className="store-row__meta">
                <MapPin size={16} />
                <span>
                  {store.city} / {store.state}
                </span>
              </div>
              <div className="store-row__meta">
                <UserRound size={16} />
                <span>{store.responsibleName || 'Nao definido'}</span>
              </div>
              <StatusBadge status={store.status} />
              <Link
                className="icon-button"
                to={`/lojas/${store.id}`}
                aria-label={`Abrir ${store.name}`}
                title="Abrir loja"
              >
                <ArrowRight size={20} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
