import {
  ArrowLeft,
  Edit3,
  FileText,
  ListChecks,
  PackageSearch,
  Store as StoreIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { StoreFormModal } from '../components/store-form-modal';
import { ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { getStore, listResponsibleUsers, updateStore } from '../data/stores/stores-repository';
import type { ResponsibleUser, Store } from '../domain/types';

export interface StoreWorkspaceContextValue {
  store: Store;
  reloadStore: () => Promise<void>;
}

export const StoreWorkspaceContext = createContext<StoreWorkspaceContextValue | null>(null);

export function useStoreWorkspace() {
  const context = useContext(StoreWorkspaceContext);
  if (!context) throw new Error('Store workspace context ausente.');
  return context;
}

export function StoreWorkspacePage() {
  const { id } = useParams();
  const { can } = useSession();
  const [store, setStore] = useState<Store | null>(null);
  const [responsibleUsers, setResponsibleUsers] = useState<ResponsibleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

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

  useEffect(() => {
    if (can('stores.edit')) {
      void listResponsibleUsers()
        .then(setResponsibleUsers)
        .catch(() => setResponsibleUsers([]));
    }
  }, [can]);

  if (loading) return <InlineLoading label="Carregando loja" />;
  if (error || !store)
    return <ErrorState message={error || 'Loja nao encontrada.'} onRetry={() => void load()} />;

  return (
    <StoreWorkspaceContext.Provider value={{ store, reloadStore: load }}>
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
          <div className="store-heading-actions">
            <StatusBadge status={store.status} />
            {can('stores.edit') && (
              <button
                className="button button--secondary button--small"
                onClick={() => setFormOpen(true)}
              >
                <Edit3 size={16} />
                Editar
              </button>
            )}
          </div>
        </header>
        <nav className="store-tabs" aria-label="Areas da loja">
          <NavLink to="implantacao">
            <ListChecks size={18} />
            Implantacao
          </NavLink>
          <NavLink to="resumo-necessidades">
            <PackageSearch size={18} />
            Resumo e Necessidades
          </NavLink>
          <NavLink to="anexos">
            <FileText size={18} />
            Anexos
          </NavLink>
        </nav>
        <Outlet />
        <StoreFormModal
          open={formOpen}
          store={store}
          responsibleUsers={responsibleUsers}
          onClose={() => setFormOpen(false)}
          onSave={async (values) => {
            await updateStore(store.id, values);
            await load();
          }}
        />
      </section>
    </StoreWorkspaceContext.Provider>
  );
}
