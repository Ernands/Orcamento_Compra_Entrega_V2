import { ArrowLeft, CalendarDays, MapPin, Store as StoreIcon, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { getStore } from '../data/stores/stores-repository';
import type { Store } from '../domain/types';

function formatDate(value: string | null): string {
  if (!value) return 'Nao definida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function StoreDetailPage() {
  const { id } = useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setStore(await getStore(id));
    } catch {
      setError('Loja nao encontrada ou sem permissao de acesso.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <InlineLoading label="Carregando loja" />;
  if (error || !store)
    return <ErrorState message={error || 'Loja nao encontrada.'} onRetry={() => void load()} />;

  return (
    <section className="page-stack">
      <Link className="back-link" to="/lojas">
        <ArrowLeft size={17} />
        Voltar para lojas
      </Link>
      <header className="store-detail-heading">
        <span className="store-detail-heading__icon">
          <StoreIcon size={25} />
        </span>
        <div>
          <p>{store.code}</p>
          <h2>{store.name}</h2>
          <span>
            {store.city} / {store.state}
          </span>
        </div>
        <StatusBadge status={store.status} />
      </header>
      <section className="detail-section">
        <header>
          <h3>Dados da loja</h3>
          <p>Informacoes fundamentais disponiveis nesta fase.</p>
        </header>
        <dl className="detail-grid">
          <div>
            <dt>
              <MapPin size={17} />
              Localizacao
            </dt>
            <dd>{store.address || `${store.city} / ${store.state}`}</dd>
          </div>
          <div>
            <dt>
              <UserRound size={17} />
              Responsavel
            </dt>
            <dd>{store.responsibleName || 'Nao definido'}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={17} />
              Inauguracao planejada
            </dt>
            <dd>{formatDate(store.plannedOpeningDate)}</dd>
          </div>
          <div>
            <dt>Observacoes</dt>
            <dd>{store.notes || 'Sem observacoes.'}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
