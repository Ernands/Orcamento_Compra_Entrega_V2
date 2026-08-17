import { AlertTriangle, CalendarDays, Edit3, PackagePlus, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  calculateProgress,
  getStoreImplementation,
} from '../data/implementation/implementation-repository';
import { createStoreNeed, listStoreNeeds, updateStoreNeed } from '../data/needs/needs-repository';
import type { NeedPriority, NeedStatus, StoreNeed, StoreNeedValues } from '../domain/types';
import { useStoreWorkspace } from './store-workspace-page';

const EMPTY_NEED: StoreNeedValues = {
  title: '',
  description: '',
  category: '',
  quantity: 1,
  unit: '',
  priority: 'normal',
  status: 'identified',
  notes: '',
};

function formatDate(value: string | null): string {
  if (!value) return 'Nao definida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

interface NeedModalProps {
  open: boolean;
  need: StoreNeed | null;
  storeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function NeedModal({ open, need, storeId, onClose, onSaved }: NeedModalProps) {
  const [values, setValues] = useState<StoreNeedValues>(EMPTY_NEED);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open)
      setValues(
        need
          ? {
              title: need.title,
              description: need.description || '',
              category: need.category,
              quantity: need.quantity,
              unit: need.unit || '',
              priority: need.priority,
              status: need.status,
              notes: need.notes || '',
            }
          : EMPTY_NEED,
      );
    setError(null);
  }, [need, open]);
  const set = <K extends keyof StoreNeedValues>(key: K, value: StoreNeedValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.title.trim() || !values.category.trim() || values.quantity <= 0) {
      setError('Informe item, grupo e quantidade valida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (need) await updateStoreNeed(need.id, storeId, values);
      else await createStoreNeed(storeId, values);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel salvar a necessidade.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title={need ? 'Editar necessidade' : 'Nova necessidade'} onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field form-grid__wide">
            Item
            <input
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="field">
            Grupo / area
            <input
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            Quantidade
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={values.quantity}
              onChange={(event) => set('quantity', Number(event.target.value))}
              required
            />
          </label>
          <label className="field">
            Unidade
            <input
              value={values.unit}
              onChange={(event) => set('unit', event.target.value)}
              maxLength={40}
              placeholder="un, m, caixa"
            />
          </label>
          <label className="field">
            Prioridade
            <select
              value={values.priority}
              onChange={(event) => set('priority', event.target.value as NeedPriority)}
            >
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="critical">Critica</option>
            </select>
          </label>
          <label className="field">
            Status
            <select
              value={values.status}
              onChange={(event) => set('status', event.target.value as NeedStatus)}
            >
              <option value="identified">Identificada</option>
              <option value="under_review">Em analise</option>
              <option value="resolved">Resolvida</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          <label className="field form-grid__wide">
            Descricao
            <textarea
              rows={2}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
              maxLength={3000}
            />
          </label>
          <label className="field form-grid__wide">
            Observacao
            <textarea
              rows={2}
              value={values.notes}
              onChange={(event) => set('notes', event.target.value)}
              maxLength={3000}
            />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar necessidade'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function StoreSummaryNeedsPage() {
  const { store } = useStoreWorkspace();
  const { can } = useSession();
  const [needs, setNeeds] = useState<StoreNeed[]>([]);
  const [implementationStatus, setImplementationStatus] = useState('not_started');
  const [progress, setProgress] = useState(calculateProgress([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StoreNeed | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedNeeds, implementation] = await Promise.all([
        listStoreNeeds(store.id),
        getStoreImplementation(store.id),
      ]);
      setNeeds(loadedNeeds);
      setImplementationStatus(implementation?.implementation.status || 'not_started');
      setProgress(calculateProgress(implementation?.items || []));
    } catch {
      setError('Nao foi possivel carregar o resumo da loja.');
    } finally {
      setLoading(false);
    }
  }, [store.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const activeNeeds = useMemo(
    () => needs.filter((need) => !['resolved', 'cancelled'].includes(need.status)),
    [needs],
  );
  const criticalNeeds = activeNeeds.filter((need) => need.priority === 'critical').length;

  if (loading) return <InlineLoading label="Carregando resumo e necessidades" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <section className="workspace-section">
      <header className="section-heading">
        <div>
          <h3>Resumo e Necessidades</h3>
          <p>Visao operacional da unidade e itens identificados para as proximas etapas.</p>
        </div>
        {can('needs.create') && (
          <button
            className="button button--primary button--small"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <PackagePlus size={17} />
            Nova necessidade
          </button>
        )}
      </header>
      <div className="summary-grid">
        <article>
          <span>Implantacao</span>
          <StatusBadge status={implementationStatus} />
        </article>
        <article>
          <span>Progresso</span>
          <strong>{progress.percentage}%</strong>
        </article>
        <article>
          <span>Pendentes</span>
          <strong>{progress.pending + progress.inProgress}</strong>
        </article>
        <article className={progress.overdue ? 'summary-card--danger' : ''}>
          <span>Atrasadas</span>
          <strong>{progress.overdue}</strong>
        </article>
        <article>
          <span>Bloqueadas</span>
          <strong>{progress.blocked}</strong>
        </article>
        <article>
          <span>Necessidades</span>
          <strong>{activeNeeds.length}</strong>
        </article>
        <article className={criticalNeeds ? 'summary-card--danger' : ''}>
          <span>Criticas</span>
          <strong>{criticalNeeds}</strong>
        </article>
        <article>
          <span>Responsavel</span>
          <strong className="summary-card__text">
            <UserRound size={16} />
            {store.responsibleName || 'Nao definido'}
          </strong>
        </article>
        <article>
          <span>Inauguracao</span>
          <strong className="summary-card__text">
            <CalendarDays size={16} />
            {formatDate(store.plannedOpeningDate)}
          </strong>
        </article>
      </div>
      <section className="needs-section">
        <header>
          <h4>Necessidades da loja</h4>
          <span>{needs.length} registros</span>
        </header>
        {!needs.length ? (
          <EmptyState
            title="Nenhuma necessidade identificada"
            detail="Registre os itens necessarios para preparar a integracao futura com Suprimentos."
          />
        ) : (
          <div className="need-list">
            {needs.map((need) => (
              <article className="need-row" key={need.id}>
                <span
                  className={`priority-marker priority-marker--${need.priority}`}
                  title={`Prioridade ${need.priority}`}
                />{' '}
                <div>
                  <small>{need.category}</small>
                  <strong>{need.title}</strong>
                  <span>
                    {need.quantity} {need.unit || 'un.'}
                  </span>
                </div>
                <div className="need-row__description">{need.description || 'Sem descricao.'}</div>
                {need.priority === 'critical' && (
                  <span className="critical-label">
                    <AlertTriangle size={14} />
                    Critica
                  </span>
                )}
                <StatusBadge status={need.status} />
                {can('needs.edit') && (
                  <button
                    className="icon-button"
                    aria-label={`Editar ${need.title}`}
                    onClick={() => {
                      setEditing(need);
                      setModalOpen(true);
                    }}
                  >
                    <Edit3 size={17} />
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <NeedModal
        open={modalOpen}
        need={editing}
        storeId={store.id}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </section>
  );
}
