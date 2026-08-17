import { ExternalLink, Eye, File, FilePlus2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, InlineLoading, Modal } from '../components/ui';
import {
  createAttachmentSignedUrl,
  deleteStoreAttachment,
  isAcceptedAttachment,
  listStoreAttachments,
  uploadStoreAttachment,
} from '../data/attachments/attachments-repository';
import type { AttachmentCategory, StoreAttachment } from '../domain/types';
import { useStoreWorkspace } from './store-workspace-page';

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  project: 'Projeto',
  construction: 'Obra',
  document: 'Documento',
  photo: 'Foto / Video',
  contract: 'Contrato',
  quote: 'Orcamento',
  receipt: 'Nota / Comprovante',
  other: 'Outros',
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function previewKind(attachment: StoreAttachment): 'image' | 'pdf' | 'video' | 'other' {
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType === 'application/pdf') return 'pdf';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  return 'other';
}

export function StoreAttachmentsPage() {
  const { store } = useStoreWorkspace();
  const { can } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<StoreAttachment[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<AttachmentCategory>('document');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [previewing, setPreviewing] = useState<StoreAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
    if (!files.length) {
      setError('Selecione um ou mais arquivos.');
      return;
    }

    const invalidFiles = files.filter((file) => !isAcceptedAttachment(file));
    if (invalidFiles.length) {
      setError(
        `Arquivo nao permitido ou acima de 100 MB: ${invalidFiles
          .slice(0, 3)
          .map((file) => file.name)
          .join(', ')}${invalidFiles.length > 3 ? '...' : ''}`,
      );
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setError(null);

    const failed: File[] = [];
    let uploaded = 0;
    for (let index = 0; index < files.length; index += 1) {
      const currentFile = files[index];
      setUploadProgress({ current: index + 1, total: files.length });
      try {
        await uploadStoreAttachment(store.id, currentFile, category, description);
        uploaded += 1;
      } catch {
        failed.push(currentFile);
      }
    }

    setFiles(failed);
    if (inputRef.current) inputRef.current.value = '';
    if (!failed.length) setDescription('');
    await load();

    if (failed.length) {
      setError(
        `${uploaded} arquivo(s) enviado(s). Nao foi possivel enviar: ${failed
          .slice(0, 3)
          .map((file) => file.name)
          .join(', ')}${failed.length > 3 ? '...' : ''}`,
      );
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
  };

  const openAttachment = async (attachment: StoreAttachment) => {
    setPreviewing(attachment);
    setPreviewUrl(null);
    setPreviewLoading(true);
    setError(null);
    try {
      setPreviewUrl(await createAttachmentSignedUrl(attachment.storagePath));
    } catch {
      setPreviewing(null);
      setError('Nao foi possivel gerar o acesso temporario ao arquivo.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewing(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const openPreviewInNewTab = () => {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
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

  const selectedSummary = files.length
    ? `${files.length} arquivo${files.length > 1 ? 's' : ''} selecionado${files.length > 1 ? 's' : ''}`
    : 'Selecionar arquivos';
  const selectedNames = files.length
    ? `${files
        .slice(0, 2)
        .map((selectedFile) => selectedFile.name)
        .join(' · ')}${files.length > 2 ? ` · +${files.length - 2}` : ''}`
    : 'PDF, imagens, videos, DOCX ou XLSX · maximo 100 MB por arquivo';
  const activePreviewKind = previewing ? previewKind(previewing) : 'other';

  return (
    <section className="workspace-section">
      <header className="section-heading">
        <div>
          <h3>Anexos</h3>
          <p>Arquivos privados da loja com visualizacao temporaria no proprio sistema.</p>
        </div>
      </header>

      {can('attachments.create') && (
        <form className="attachment-upload" onSubmit={upload}>
          <label className="file-drop">
            <FilePlus2 size={22} />
            <span>
              <strong>{selectedSummary}</strong>
              <small>{selectedNames}</small>
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
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
              placeholder="Aplicada a todos os arquivos deste envio"
            />
          </label>
          <button className="button button--primary" disabled={uploading || !files.length}>
            {uploading
              ? `Enviando ${uploadProgress.current}/${uploadProgress.total}`
              : files.length > 1
                ? `Enviar ${files.length} anexos`
                : 'Enviar anexo'}
          </button>
        </form>
      )}

      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <InlineLoading label="Carregando anexos" />
      ) : !attachments.length ? (
        <EmptyState
          title="Nenhum anexo"
          detail="Os arquivos vinculados a esta loja aparecerao aqui."
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
                aria-label={`Visualizar ${attachment.originalName}`}
                title="Visualizar"
                onClick={() => void openAttachment(attachment)}
              >
                <Eye size={18} />
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
        open={Boolean(previewing)}
        title={previewing?.originalName || 'Visualizar anexo'}
        description={
          previewing
            ? `${CATEGORY_LABELS[previewing.category]} · ${formatSize(previewing.sizeBytes)}`
            : undefined
        }
        onClose={closePreview}
        style={{ width: 'min(94vw, 1100px)', maxWidth: '1100px' }}
      >
        {previewLoading ? (
          <InlineLoading label="Preparando visualizacao" />
        ) : previewUrl && previewing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activePreviewKind === 'image' && (
              <img
                src={previewUrl}
                alt={previewing.originalName}
                style={{ width: '100%', maxHeight: '72vh', objectFit: 'contain' }}
              />
            )}
            {activePreviewKind === 'pdf' && (
              <iframe
                src={previewUrl}
                title={previewing.originalName}
                style={{ width: '100%', height: '72vh', border: 0 }}
              />
            )}
            {activePreviewKind === 'video' && (
              <video
                src={previewUrl}
                controls
                preload="metadata"
                style={{ width: '100%', maxHeight: '72vh' }}
              >
                Seu navegador nao oferece suporte a reproducao deste video.
              </video>
            )}
            {activePreviewKind === 'other' && (
              <div className="empty-state" style={{ minHeight: 220 }}>
                <File size={28} />
                <strong>Visualizacao interna indisponivel para este formato</strong>
                <span>DOCX e XLSX dependem de um visualizador externo do navegador.</span>
              </div>
            )}
            <div className="form-actions">
              <button className="button button--secondary" onClick={openPreviewInNewTab}>
                <ExternalLink size={17} />
                Abrir em nova aba
              </button>
              <button className="button button--primary" onClick={closePreview}>
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        title="Remover anexo"
        description="O arquivo deixara de ficar disponivel para a loja."
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
