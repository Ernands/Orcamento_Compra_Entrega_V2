import { Download, File, FilePlus2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, InlineLoading, Modal } from '../components/ui';
import {
  createAttachmentSignedUrl,
  deleteStoreAttachment,
  listStoreAttachments,
  uploadStoreAttachment,
} from '../data/attachments/attachments-repository';
import type { AttachmentCategory, StoreAttachment } from '../domain/types';
import { useStoreWorkspace } from './store-workspace-page';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  project: 'Projeto',
  construction: 'Obra',
  document: 'Documento',
  photo: 'Foto',
  contract: 'Contrato',
  quote: 'Orcamento',
  receipt: 'Nota / Comprovante',
  other: 'Outros',
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StoreAttachmentsPage() {
  const { store } = useStoreWorkspace();
  const { can } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<StoreAttachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<AttachmentCategory>('document');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoreAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttachments(await listStoreAttachments(store.id));
    } catch {
      setError('Nao foi possivel carregar os anexos.');
    } finally {
      setLoading(false);
    }
  }, [store.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Selecione um arquivo.');
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE) {
      setError('Use PDF, imagem, DOCX ou XLSX com ate 15 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadStoreAttachment(store.id, file, category, description);
      setFile(null);
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch {
      setError('Nao foi possivel enviar o anexo.');
    } finally {
      setUploading(false);
    }
  };
  const openAttachment = async (attachment: StoreAttachment) => {
    setOpeningId(attachment.id);
    setError(null);
    try {
      window.open(
        await createAttachmentSignedUrl(attachment.storagePath),
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      setError('Nao foi possivel gerar o acesso temporario ao arquivo.');
    } finally {
      setOpeningId(null);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteStoreAttachment(deleting.id);
      setDeleting(null);
      await load();
    } catch {
      setError('O registro foi removido, mas o objeto pode exigir limpeza pelo administrador.');
      setDeleting(null);
    }
  };

  return (
    <section className="workspace-section">
      <header className="section-heading">
        <div>
          <h3>Anexos</h3>
          <p>Documentos privados da loja, acessados por URL temporaria.</p>
        </div>
      </header>
      {can('attachments.create') && (
        <form className="attachment-upload" onSubmit={upload}>
          <label className="file-drop">
            <FilePlus2 size={22} />
            <span>
              <strong>{file?.name || 'Selecionar arquivo'}</strong>
              <small>PDF, imagens, DOCX ou XLSX · maximo 15 MB</small>
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="field">
            Categoria
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as AttachmentCategory)}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field attachment-upload__description">
            Descricao
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </label>
          <button className="button button--primary" disabled={uploading}>
            {uploading ? 'Enviando...' : 'Enviar anexo'}
          </button>
        </form>
      )}
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <InlineLoading label="Carregando anexos" />
      ) : !attachments.length ? (
        <EmptyState
          title="Nenhum anexo"
          detail="Os documentos vinculados a esta loja aparecerao aqui."
        />
      ) : (
        <div className="attachment-list">
          {attachments.map((attachment) => (
            <article className="attachment-row" key={attachment.id}>
              <span className="attachment-row__icon">
                <File size={20} />
              </span>
              <div>
                <small>{CATEGORY_LABELS[attachment.category]}</small>
                <strong>{attachment.originalName}</strong>
                <span>{attachment.description || 'Sem descricao.'}</span>
              </div>
              <span>{formatSize(attachment.sizeBytes)}</span>
              <span>{new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span>
              <button
                className="icon-button"
                aria-label={`Abrir ${attachment.originalName}`}
                title="Abrir por 60 segundos"
                disabled={openingId === attachment.id}
                onClick={() => void openAttachment(attachment)}
              >
                <Download size={18} />
              </button>
              {can('attachments.delete') && (
                <button
                  className="icon-button icon-button--danger"
                  aria-label={`Remover ${attachment.originalName}`}
                  onClick={() => setDeleting(attachment)}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <Modal
        open={Boolean(deleting)}
        title="Remover anexo"
        description="O documento deixara de ficar disponivel para a loja."
        onClose={() => setDeleting(null)}
      >
        <div className="stack-form">
          <p className="modal-copy">{deleting?.originalName}</p>
          <div className="form-actions">
            <button className="button button--secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button className="button button--danger" onClick={() => void remove()}>
              Remover
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
