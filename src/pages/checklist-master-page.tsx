import { Copy, Edit3, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState, ErrorState, InlineLoading, Modal, StatusBadge } from '../components/ui';
import {
  createChecklistItem,
  createChecklistVersion,
  deleteChecklistItem,
  listChecklistItems,
  listChecklistVersions,
  publishChecklistVersion,
  updateChecklistItem,
  updateChecklistVersion,
} from '../data/checklists/checklists-repository';
import type {
  ChecklistItem,
  ChecklistItemValues,
  ChecklistVersion,
  NeedPriority,
} from '../domain/types';

interface VersionModalProps {
  open: boolean;
  version: ChecklistVersion | null;
  versions: ChecklistVersion[];
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
}

function VersionModal({ open, version, versions, onClose, onSaved }: VersionModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceVersionId, setSourceVersionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(version?.name || '');
      setNotes(version?.notes || '');
      setSourceVersionId('');
      setError(null);
    }
  }, [open, version]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Informe um nome para a versao.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (version) {
        await updateChecklistVersion(version.id, name, notes);
        await onSaved(version.id);
      } else {
        const id = await createChecklistVersion(name, notes, sourceVersionId || undefined);
        await onSaved(id);
      }
      onClose();
    } catch {
      setError('Nao foi possivel salvar a versao.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={version ? 'Editar versao draft' : 'Nova versao'} onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          Observacao
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
          />
        </label>
        {!version && (
          <label className="field">
            Clonar itens de
            <select
              value={sourceVersionId}
              onChange={(event) => setSourceVersionId(event.target.value)}
            >
              <option value="">Iniciar vazia</option>
              {versions.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.versionNumber} - {item.name}
                </option>
              ))}
            </select>
            <small>A copia cria novos itens independentes na versao draft.</small>
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar versao'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const EMPTY_ITEM: ChecklistItemValues = {
  title: '',
  description: '',
  category: '',
  position: 10,
  isRequired: true,
  isActive: true,
  relativeDueDays: null,
  guidance: '',
  responsibilityType: '',
  evidenceRequired: false,
  priority: 'normal',
};

interface ItemModalProps {
  open: boolean;
  versionId: string;
  item: ChecklistItem | null;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function ItemModal({ open, versionId, item, nextPosition, onClose, onSaved }: ItemModalProps) {
  const [values, setValues] = useState<ChecklistItemValues>(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(
      item
        ? {
            title: item.title,
            description: item.description,
            category: item.category,
            position: item.position,
            isRequired: item.isRequired,
            isActive: item.isActive,
            relativeDueDays: item.relativeDueDays,
            guidance: item.guidance,
            responsibilityType: item.responsibilityType,
            evidenceRequired: item.evidenceRequired,
            priority: item.priority,
          }
        : { ...EMPTY_ITEM, position: nextPosition },
    );
    setError(null);
  }, [item, nextPosition, open]);

  const set = <K extends keyof ChecklistItemValues>(key: K, value: ChecklistItemValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.title.trim() || !values.category.trim()) {
      setError('Informe titulo e categoria.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (item) await updateChecklistItem(item.id, values);
      else await createChecklistItem(versionId, values);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel salvar o item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={item ? 'Editar atividade' : 'Nova atividade'} onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field form-grid__wide">
            Titulo
            <input
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="field">
            Categoria
            <input
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            Ordem
            <input
              type="number"
              min="0"
              value={values.position}
              onChange={(event) => set('position', Number(event.target.value))}
              required
            />
          </label>
          <label className="field">
            Offset da inauguração (dias)
            <input
              type="number"
              min="-3650"
              max="3650"
              value={values.relativeDueDays ?? ''}
              onChange={(event) =>
                set('relativeDueDays', event.target.value ? Number(event.target.value) : null)
              }
            />
            <small>Negativo: antes; 0: no dia da inauguração; positivo: depois.</small>
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
            Tipo de responsavel
            <input
              value={values.responsibilityType || ''}
              onChange={(event) => set('responsibilityType', event.target.value)}
              maxLength={80}
            />
          </label>
          <label className="field form-grid__wide">
            Descricao
            <textarea
              rows={2}
              value={values.description || ''}
              onChange={(event) => set('description', event.target.value)}
              maxLength={3000}
            />
          </label>
          <label className="field form-grid__wide">
            Orientacao
            <textarea
              rows={2}
              value={values.guidance || ''}
              onChange={(event) => set('guidance', event.target.value)}
              maxLength={3000}
            />
          </label>
        </div>
        <div className="toggle-grid">
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={values.isRequired}
              onChange={(event) => set('isRequired', event.target.checked)}
            />
            <span>
              <strong>Obrigatoria</strong>
              <small>Conta para o acompanhamento da loja.</small>
            </span>
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={values.evidenceRequired}
              onChange={(event) => set('evidenceRequired', event.target.checked)}
            />
            <span>
              <strong>Exige evidencia</strong>
              <small>Sinaliza a necessidade de comprovacao.</small>
            </span>
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            <span>
              <strong>Ativa</strong>
              <small>Entra no snapshot de novas lojas.</small>
            </span>
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar atividade'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ChecklistMasterPage() {
  const [versions, setVersions] = useState<ChecklistVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ChecklistVersion | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [publishing, setPublishing] = useState(false);

  const loadVersions = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await listChecklistVersions();
      setVersions(loaded);
      setSelectedId((current) => preferredId || current || loaded[0]?.id || '');
    } catch {
      setError('Nao foi possivel carregar o Checklist Mestre.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listChecklistItems(selectedId));
    } catch {
      setError('Nao foi possivel carregar os itens da versao.');
    }
  }, [selectedId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);
  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selected = versions.find((version) => version.id === selectedId) || null;
  const publish = async () => {
    if (!selected) return;
    setPublishing(true);
    setError(null);
    try {
      await publishChecklistVersion(selected.id);
      await loadVersions(selected.id);
    } catch {
      setError('Nao foi possivel publicar. A versao precisa ter ao menos um item ativo.');
    } finally {
      setPublishing(false);
    }
  };
  const removeItem = async (id: string) => {
    try {
      await deleteChecklistItem(id);
      await loadItems();
    } catch {
      setError('Nao foi possivel remover o item.');
    }
  };

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administracao</p>
          <h2>Checklist Mestre</h2>
          <p>Versoes publicadas permanecem imutaveis para preservar cada implantacao.</p>
        </div>
        <button
          className="button button--primary"
          onClick={() => {
            setEditingVersion(null);
            setVersionModalOpen(true);
          }}
        >
          <Plus size={18} />
          Nova versao
        </button>
      </header>
      {loading ? (
        <InlineLoading label="Carregando versoes" />
      ) : error && !versions.length ? (
        <ErrorState message={error} onRetry={() => void loadVersions()} />
      ) : !versions.length ? (
        <EmptyState
          title="Nenhuma versao criada"
          detail="Crie a primeira versao draft do checklist."
        />
      ) : (
        <div className="checklist-layout">
          <aside className="version-list" aria-label="Versoes do checklist">
            {versions.map((version) => (
              <button
                className={version.id === selectedId ? 'active' : ''}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
              >
                <span>
                  <strong>v{version.versionNumber}</strong>
                  <StatusBadge status={version.status} />
                </span>
                <b>{version.name}</b>
                <small>{version.itemCount} itens</small>
              </button>
            ))}
          </aside>
          <section className="checklist-editor">
            {selected && (
              <>
                <header className="section-heading">
                  <div>
                    <h3>
                      v{selected.versionNumber} - {selected.name}
                    </h3>
                    <p>{selected.notes || 'Sem observacoes.'}</p>
                  </div>
                  <div className="row-actions">
                    {selected.status === 'draft' && (
                      <>
                        <button
                          className="button button--secondary button--small"
                          onClick={() => {
                            setEditingVersion(selected);
                            setVersionModalOpen(true);
                          }}
                        >
                          <Edit3 size={16} />
                          Editar versao
                        </button>
                        <button
                          className="button button--primary button--small"
                          disabled={publishing}
                          onClick={() => void publish()}
                        >
                          <Send size={16} />
                          {publishing ? 'Publicando...' : 'Publicar'}
                        </button>
                      </>
                    )}
                  </div>
                </header>
                {error && <div className="form-error">{error}</div>}
                {selected.status === 'draft' && (
                  <div className="editor-toolbar">
                    <button
                      className="button button--secondary button--small"
                      onClick={() => {
                        setEditingItem(null);
                        setItemModalOpen(true);
                      }}
                    >
                      <Plus size={16} />
                      Adicionar atividade
                    </button>
                    <span>
                      <Copy size={15} />
                      Edite ordem e conteudo antes de publicar.
                    </span>
                  </div>
                )}
                {!items.length ? (
                  <EmptyState
                    title="Versao sem atividades"
                    detail={
                      selected.status === 'draft'
                        ? 'Adicione as atividades que formarao o snapshot das lojas.'
                        : 'Esta versao nao possui itens visiveis.'
                    }
                  />
                ) : (
                  <div className="master-item-list">
                    {items.map((item) => (
                      <article className="master-item" key={item.id}>
                        <span className="master-item__position">{item.position}</span>
                        <div>
                          <span>{item.category}</span>
                          <strong>{item.title}</strong>
                          <small>
                            {item.isRequired ? 'Obrigatoria' : 'Opcional'}
                            {item.relativeDueDays !== null ? ` · ${item.relativeDueDays} dias` : ''}
                            {!item.isActive ? ' · Inativa' : ''}
                          </small>
                        </div>
                        {selected.status === 'draft' && (
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`Editar ${item.title}`}
                              onClick={() => {
                                setEditingItem(item);
                                setItemModalOpen(true);
                              }}
                            >
                              <Edit3 size={17} />
                            </button>
                            <button
                              className="icon-button icon-button--danger"
                              aria-label={`Remover ${item.title}`}
                              onClick={() => void removeItem(item.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <VersionModal
        open={versionModalOpen}
        version={editingVersion}
        versions={versions}
        onClose={() => setVersionModalOpen(false)}
        onSaved={loadVersions}
      />
      <ItemModal
        open={itemModalOpen}
        versionId={selectedId}
        item={editingItem}
        nextPosition={(items.at(-1)?.position || 0) + 10}
        onClose={() => setItemModalOpen(false)}
        onSaved={loadItems}
      />
    </section>
  );
}
