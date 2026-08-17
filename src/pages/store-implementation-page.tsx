import { CalendarClock, CheckCircle2, CircleAlert, Edit3, Play, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import { listPublishedChecklistVersions } from '../data/checklists/checklists-repository';
import {
  calculateProgress,
  getStoreImplementation,
  startStoreImplementation,
  updateImplementationItem,
} from '../data/implementation/implementation-repository';
import { listResponsibleUsers } from '../data/stores/stores-repository';
import type {
  ChecklistVersion,
  ImplementationItem,
  ImplementationItemStatus,
  ResponsibleUser,
  StoreImplementation,
} from '../domain/types';
import { useStoreWorkspace } from './store-workspace-page';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

interface ItemModalProps {
  item: ImplementationItem | null;
  users: ResponsibleUser[];
  onClose: () => void;
  onSave: () => Promise<void>;
}

function ItemModal({ item, users, onClose, onSave }: ItemModalProps) {
  const [status, setStatus] = useState<ImplementationItemStatus>('pending');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setStatus(item.status);
      setResponsibleUserId(item.responsibleUserId || '');
      setDueDate(item.dueDate || '');
      setNotes(item.notes || '');
      setError(null);
    }
  }, [item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      await updateImplementationItem(item.id, { status, responsibleUserId, dueDate, notes });
      await onSave();
      onClose();
    } catch {
      setError('Nao foi possivel atualizar a atividade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(item)} title="Atualizar atividade" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ImplementationItemStatus)}
            >
              <option value="pending">Pendente</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluida</option>
              <option value="blocked">Bloqueada</option>
              <option value="not_applicable">Nao aplicavel</option>
            </select>
          </label>
          <label className="field">
            Responsavel
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
            >
              <option value="">Nao definido</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Prazo
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Observacao
            <textarea
              rows={3}
              maxLength={3000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function StoreImplementationPage() {
  const { store } = useStoreWorkspace();
  const { can } = useSession();
  const [implementation, setImplementation] = useState<StoreImplementation | null>(null);
  const [items, setItems] = useState<ImplementationItem[]>([]);
  const [versions, setVersions] = useState<ChecklistVersion[]>([]);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [baseDate, setBaseDate] = useState(store.plannedOpeningDate || today());
  const [coordinatorId, setCoordinatorId] = useState(store.responsibleUserId || '');
  const [editing, setEditing] = useState<ImplementationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStoreImplementation(store.id);
      setImplementation(result?.implementation || null);
      setItems(result?.items || []);
      if (!result && can('implementation.edit')) {
        const [availableVersions, availableUsers] = await Promise.all([
          listPublishedChecklistVersions(),
          listResponsibleUsers(),
        ]);
        setVersions(availableVersions);
        setUsers(availableUsers);
        setSelectedVersionId(availableVersions[0]?.id || '');
      } else if (can('implementation.edit')) {
        setUsers(await listResponsibleUsers());
      }
    } catch {
      setError('Nao foi possivel carregar a implantacao desta loja.');
    } finally {
      setLoading(false);
    }
  }, [can, store.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => calculateProgress(items), [items]);
  const groups = useMemo(() => {
    const grouped = new Map<string, ImplementationItem[]>();
    items.forEach((item) =>
      grouped.set(item.category, [...(grouped.get(item.category) || []), item]),
    );
    return [...grouped.entries()];
  }, [items]);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVersionId) return;
    setStarting(true);
    setError(null);
    try {
      await startStoreImplementation(store.id, selectedVersionId, baseDate, coordinatorId);
      await load();
    } catch {
      setError('Nao foi possivel iniciar a implantacao. Confirme se existe uma versao publicada.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <InlineLoading label="Carregando implantacao" />;
  if (error && implementation) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!implementation) {
    return (
      <section className="workspace-section">
        <header className="section-heading">
          <div>
            <h3>Implantacao</h3>
            <p>Inicie o checklist operacional desta unidade.</p>
          </div>
        </header>
        {can('implementation.edit') ? (
          versions.length ? (
            <form className="form-panel compact-form" onSubmit={start}>
              <div className="form-grid">
                <label className="field form-grid__wide">
                  Versao publicada
                  <select
                    value={selectedVersionId}
                    onChange={(event) => setSelectedVersionId(event.target.value)}
                    required
                  >
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        v{version.versionNumber} - {version.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Data-base
                  <input
                    type="date"
                    value={baseDate}
                    onChange={(event) => setBaseDate(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Coordenador
                  <select
                    value={coordinatorId}
                    onChange={(event) => setCoordinatorId(event.target.value)}
                  >
                    <option value="">Nao definido</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {error && <div className="form-error">{error}</div>}
              <button className="button button--primary" disabled={starting}>
                <Play size={18} />
                {starting ? 'Iniciando...' : 'Iniciar implantacao'}
              </button>
            </form>
          ) : (
            <EmptyState
              title="Nenhuma versao publicada"
              detail="Publique uma versao no Checklist Mestre antes de iniciar."
            />
          )
        ) : (
          <EmptyState
            title="Implantacao ainda nao iniciada"
            detail="Um usuario autorizado precisa iniciar o checklist desta loja."
          />
        )}
      </section>
    );
  }

  return (
    <section className="workspace-section">
      <header className="section-heading">
        <div>
          <h3>Implantacao</h3>
          <p>{implementation.checklistVersionName}</p>
        </div>
        <StatusBadge status={implementation.status} />
      </header>
      <div className="progress-panel">
        <div className="progress-copy">
          <strong>{progress.percentage}%</strong>
          <span>concluido</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress.percentage}%` }} />
        </div>
        <div className="metric-strip">
          <span>
            <strong>{progress.total}</strong>Total
          </span>
          <span>
            <strong>{progress.completed}</strong>Concluidas
          </span>
          <span>
            <strong>{progress.inProgress}</strong>Em andamento
          </span>
          <span>
            <strong>{progress.pending}</strong>Pendentes
          </span>
          <span>
            <strong>{progress.blocked}</strong>Bloqueadas
          </span>
          <span className={progress.overdue ? 'metric--danger' : ''}>
            <strong>{progress.overdue}</strong>Atrasadas
          </span>
        </div>
      </div>
      {groups.map(([category, categoryItems]) => (
        <section className="activity-group" key={category}>
          <header>
            <h4>{category}</h4>
            <span>{categoryItems.length} atividades</span>
          </header>
          <div className="activity-list">
            {categoryItems.map((item) => (
              <article className="activity-row" key={item.id}>
                <span className="activity-row__state">
                  {item.status === 'completed' ? (
                    <CheckCircle2 size={20} />
                  ) : item.status === 'blocked' ? (
                    <CircleAlert size={20} />
                  ) : (
                    <CalendarClock size={20} />
                  )}
                </span>
                <div className="activity-row__main">
                  <strong>{item.title}</strong>
                  <span>{item.description || item.guidance || 'Sem descricao adicional.'}</span>
                </div>
                <div className="activity-row__meta">
                  <UserRound size={15} />
                  <span>{item.responsibleName || 'Nao definido'}</span>
                </div>
                <div className="activity-row__meta">
                  <CalendarClock size={15} />
                  <span>{formatDate(item.dueDate)}</span>
                </div>
                <StatusBadge status={item.status} />
                {can('implementation.edit') && (
                  <button
                    className="icon-button"
                    aria-label={`Editar ${item.title}`}
                    title="Atualizar atividade"
                    onClick={() => setEditing(item)}
                  >
                    <Edit3 size={17} />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      <ItemModal item={editing} users={users} onClose={() => setEditing(null)} onSave={load} />
    </section>
  );
}
