import {
  ArrowLeft,
  Edit3,
  FileText,
  ListChecks,
  LockKeyhole,
  History,
  PackageSearch,
  Store as StoreIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { StoreFormModal } from '../components/store-form-modal';
import { ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  changeStoreFinancialClosure,
  listStoreFinancialClosureEvents,
  type StoreFinancialClosureEvent,
} from '../data/stores/store-financial-closure-repository';
import '../styles/store-financial-close.css';
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
  const { can, viewer } = useSession();
  const [store, setStore] = useState<Store | null>(null);
  const [responsibleUsers, setResponsibleUsers] = useState<ResponsibleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [closureAction, setClosureAction] = useState<'close' | 'reopen' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [changingClosure, setChangingClosure] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureHistory, setClosureHistory] = useState<StoreFinancialClosureEvent[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [nextStore, events] = await Promise.all([getStore(id), listStoreFinancialClosureEvents(id)]);
      setStore(nextStore);
      setClosureHistory(events);
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

  const financialClosure = store?.financialClosure;
  const isClosed = financialClosure?.state === 'closed';
  const closureUnavailable = financialClosure?.state === 'unavailable';
  const canFinalizeReopen = viewer?.profile.key === 'administrator' || can('stores.finalize_reopen');
  const confirmWord = closureAction === 'close' ? 'FINALIZAR' : 'REABRIR';
  const showClosureAction = (next: 'close' | 'reopen') => {
    setClosureAction(next);
    setConfirmation('');
    setReopenReason('');
    setClosureError(null);
  };
  const changeClosure = async () => {
    if (!id || !closureAction || !canFinalizeReopen || closureUnavailable ||
        confirmation !== confirmWord ||
        (closureAction === 'reopen' && reopenReason.trim().length < 10)) return;
    setChangingClosure(true);
    setClosureError(null);
    try {
      await changeStoreFinancialClosure(id, closureAction, confirmation, reopenReason.trim());
      setClosureAction(null);
      await load();
    } catch (cause) {
      setClosureError(cause instanceof Error ? cause.message : 'Falha ao atualizar fechamento financeiro.');
    } finally {
      setChangingClosure(false);
    }
  };
  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

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
            <span className={`store-close-badge ${isClosed ? 'store-close-badge--closed' : ''}`}>
              {isClosed && <LockKeyhole size={14} />}
              {isClosed ? 'Finalizada' : closureUnavailable ? 'Fechamento indisponível' : 'Em andamento'}
            </span>
            {canFinalizeReopen && (
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={closureUnavailable || !financialClosure || changingClosure}
                title={closureUnavailable ? 'Requer migração de segurança em um banco DEV antes de finalizar.' : undefined}
                onClick={() => showClosureAction(isClosed ? 'reopen' : 'close')}
              >
                <LockKeyhole size={16} />
                {isClosed ? 'Reabrir Loja' : 'Finalizar Loja'}
              </button>
            )}
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
        {isClosed && (
          <aside className="store-close-banner" role="status">
            <LockKeyhole size={18} />
            <span>
              Loja finalizada em {financialClosure?.closedAt ? formatDateTime(financialClosure.closedAt) : '—'}
              {financialClosure?.closedByName ? ` por ${financialClosure.closedByName}` : ''}.
              <small>Fechamento financeiro concluído. Novas movimentações financeiras estão bloqueadas.</small>
            </span>
          </aside>
        )}
        {closureUnavailable && (
          <aside className="store-close-banner" role="status">
            Bloqueio financeiro indisponível nesta Preview: migração de segurança ainda não aplicada no banco DEV.
          </aside>
        )}
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
        <section className="detail-section">
          <header>
            <h3><History size={17} /> Histórico de fechamento financeiro</h3>
            <p>Finalizações, reaberturas e inclusões de documentos após a finalização.</p>
          </header>
          {closureHistory.length === 0 ? <p>Nenhum fechamento financeiro registrado.</p> : (
            <ol className="store-close-history">
              {closureHistory.map((event) => (
                <li key={event.id}>
                  <strong>{formatDateTime(event.occurredAt)} — {
                    event.event === 'closed' ? 'Loja finalizada' :
                    event.event === 'reopened' ? 'Loja reaberta' : 'Documento incluído'
                  }</strong>
                  {event.actorName ? ` por ${event.actorName}` : ''}
                  {event.reason ? ` — Motivo: ${event.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
        </section>
        <Modal
          open={Boolean(closureAction)}
          title={closureAction === 'close' ? 'Finalizar esta loja?' : 'Reabrir esta loja?'}
          description={closureAction === 'close'
            ? 'Após a finalização, novas compras, obras, pagamentos e alterações financeiras da loja ficarão bloqueados.'
            : 'A reabertura permite novas movimentações financeiras. O motivo será registrado no histórico.'}
          onClose={() => { if (!changingClosure) setClosureAction(null); }}
        >
          <div className="store-close-confirm">
            {closureAction === 'reopen' && (
              <label>Motivo da reabertura (obrigatório, mínimo 10 caracteres)
                <textarea
                  rows={3}
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                  placeholder="Descreva a necessidade do ajuste financeiro."
                />
              </label>
            )}
            <label>Digite <strong>{confirmWord}</strong> para confirmar
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={confirmWord}
                autoComplete="off"
              />
            </label>
            {closureError && <p className="store-close-error" role="alert">{closureError}</p>}
            <div className="modal-actions">
              <button className="button button--secondary" disabled={changingClosure} onClick={() => setClosureAction(null)}>
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={changingClosure || confirmation !== confirmWord ||
                  (closureAction === 'reopen' && reopenReason.trim().length < 10)}
                onClick={() => void changeClosure()}
              >
                {changingClosure ? 'Processando...' : closureAction === 'close' ? 'Confirmar finalização' : 'Confirmar reabertura'}
              </button>
            </div>
          </div>
        </Modal>
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
