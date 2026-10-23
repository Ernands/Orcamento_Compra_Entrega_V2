import { ArrowLeft, CalendarDays, LockKeyhole, MapPin, Store as StoreIcon, UserRound, History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import { useSession } from '../app/session-provider';
import {
  changeStoreFinancialClosure, listStoreFinancialClosureEvents,
  type StoreFinancialClosureEvent,
} from '../data/stores/store-financial-closure-repository';
import '../styles/store-financial-close.css';
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
  const [events, setEvents] = useState<StoreFinancialClosureEvent[]>([]);
  const { can } = useSession();
  const [action, setAction] = useState<'close' | 'reopen' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [storeData, history] = await Promise.all([getStore(id),listStoreFinancialClosureEvents(id)]);
      setStore(storeData);
      setEvents(history);
    } catch {
      setError('Loja nao encontrada ou sem permissao de acesso.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closure = store?.financialClosure;
  const closed = closure?.state === 'closed';
  const canChange = can('stores.finalize_reopen');
  const expected = action === 'close' ? 'FINALIZAR' : 'REABRIR';
  const submit = async () => {
    if (!id || !action || confirmation !== expected || (action === 'reopen' && reason.trim().length < 10)) return;
    setBusy(true);
    setActionError(null);
    try {
      await changeStoreFinancialClosure(id,action,confirmation,reason.trim());
      setAction(null);setConfirmation('');setReason('');
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Nao foi possivel alterar o fechamento.');
    } finally { setBusy(false); }
  };
  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));

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
        <span className={`store-close-badge ${closed ? 'store-close-badge--closed' : ''}`}>
          {closed && <LockKeyhole size={14} />}
          {closed ? 'Finalizada' : closure?.state === 'unavailable' ? 'Fechamento indisponivel' : 'Em andamento'}
        </span>
      </header>
      {closed && <aside className="store-close-banner">
        <LockKeyhole size={18} />
        <span>Loja finalizada em {closure?.closedAt ? formatDateTime(closure.closedAt) : '—'}
        {closure?.closedByName ? ` por ${closure.closedByName}` : ''}.
        <small>Fechamento financeiro concluido. Os valores estao protegidos contra novas movimentacoes.</small></span>
      </aside>}
      {closure?.state === 'unavailable' && <aside className="store-close-banner">
        O fechamento financeiro ainda nao foi habilitado no banco deste ambiente. Finalizar e reabrir estao desativados.
      </aside>}
      {canChange && closure?.state !== 'unavailable' && <div className="store-close-action-bar">
        <button type="button" className="button button--secondary" onClick={() => {
          setAction(closed?'reopen':'close');setConfirmation('');setReason('');setActionError(null);
        }}>{closed?'Reabrir Loja':'Finalizar Loja'}</button>
      </div>}
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
      <section className="detail-section">
        <header><h3><History size={17} /> Historico de fechamento</h3>
          <p>Alteracoes de status e inclusoes documentais realizadas apos o fechamento.</p>
        </header>
        {events.length === 0 ? <p>Nenhum fechamento registrado.</p> :
        <ol className="store-close-history">{events.map((event) => <li key={event.id}>
          <strong>{formatDateTime(event.occurredAt)} — {event.event === 'closed' ? 'Loja finalizada' :
             event.event === 'reopened' ? 'Loja reaberta' : 'Documento incluido'}</strong>
          {event.actorName ? ` por ${event.actorName}` : ''}
          {event.reason ? ` — Motivo: ${event.reason}` : ''}
        </li>)}</ol>}
      </section>
      <Modal open={Boolean(action)} onClose={() => {if(!busy)setAction(null);}}
        title={action==='close'?'Finalizar esta loja?':'Reabrir esta loja?'}
        description={action==='close'
          ? 'Novas compras, obras, pagamentos e alteracoes financeiras desta loja serao bloqueados. Consulte os valores antes de confirmar.'
          : 'A reabertura libera novas alteracoes financeiras e exige justificativa para auditoria.'}>
        <div className="store-close-confirm">
          {action==='reopen' && <label>Motivo da reabertura (obrigatorio)
            <textarea value={reason} onChange={(e)=>setReason(e.target.value)} rows={3}
              placeholder="Descreva a justificativa (minimo de 10 caracteres)" />
          </label>}
          <label>Digite <strong>{expected}</strong> para confirmar
            <input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)}
              placeholder={expected} autoComplete="off" />
          </label>
          {actionError && <p role="alert" className="store-close-error">{actionError}</p>}
          <div className="modal-actions">
            <button className="button button--secondary" disabled={busy} onClick={() => setAction(null)}>Cancelar</button>
            <button className="button button--primary" disabled={busy||confirmation!==expected||(action==='reopen'&&reason.trim().length<10)}
              onClick={() => void submit()}>{busy?'Processando...':action==='close'?'Confirmar finalizacao':'Confirmar reabertura'}</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
