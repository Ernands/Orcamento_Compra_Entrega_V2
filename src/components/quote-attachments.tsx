import {
  ExternalLink,
  File,
  FilePlus2,
  Image as ImageIcon,
  Paperclip,
  Play,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSupplyQuoteAttachmentSignedUrl,
  deleteSupplyQuoteAttachment,
  listSupplyQuoteAttachments,
  uploadSupplyQuoteAttachment,
  validateQuoteAttachment,
} from '../data/attachments/quote-attachments-repository';
import type { SupplyQuote, SupplyQuoteAttachment } from '../domain/types';
import { EmptyState, InlineLoading, Modal } from './ui';

type QuoteReference = Pick<SupplyQuote, 'id' | 'code'>;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentKind(mimeType: string): 'image' | 'pdf' | 'video' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  const kind = attachmentKind(mimeType);
  if (kind === 'image') return <ImageIcon size={19} />;
  if (kind === 'video') return <Play size={19} />;
  return <File size={19} />;
}

export function QuoteAttachmentsPanel({
  quote,
  canEdit,
  onChanged,
}: {
  quote: QuoteReference;
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<SupplyQuoteAttachment[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    attachment: SupplyQuoteAttachment;
    url: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<SupplyQuoteAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttachments(await listSupplyQuoteAttachments(quote.id));
    } catch {
      setError('Nao foi possivel carregar os anexos da cotacao.');
    } finally {
      setLoading(false);
    }
  }, [quote.id]);

  useEffect(() => {
    setPreview(null);
    setFiles([]);
    void load();
  }, [load]);

  const selectFiles = (selected: File[]) => {
    const validationError = selected.map(validateQuoteAttachment).find(Boolean);
    if (validationError) {
      setFiles([]);
      setError(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFiles(selected);
    setError(null);
  };

  const upload = async () => {
    if (!files.length) {
      setError('Selecione ao menos um arquivo.');
      return;
    }
    setError(null);
    setUploading({ current: 0, total: files.length });
    try {
      for (let index = 0; index < files.length; index += 1) {
        setUploading({ current: index + 1, total: files.length });
        await uploadSupplyQuoteAttachment(quote.id, files[index], description);
      }
      setFiles([]);
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
      await onChanged?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Nao foi possivel enviar todos os anexos.',
      );
    } finally {
      setUploading(null);
    }
  };

  const openAttachment = async (attachment: SupplyQuoteAttachment) => {
    setOpeningId(attachment.id);
    setError(null);
    try {
      const url = await createSupplyQuoteAttachmentSignedUrl(attachment.storagePath);
      if (attachmentKind(attachment.mimeType) === 'document') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setPreview({ attachment, url });
      }
    } catch {
      setError('Nao foi possivel gerar o acesso temporario ao arquivo.');
    } finally {
      setOpeningId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteSupplyQuoteAttachment(deleting.id);
      setDeleting(null);
      if (preview?.attachment.id === deleting.id) setPreview(null);
      await load();
      await onChanged?.();
    } catch {
      setError('O anexo foi ocultado, mas o objeto pode exigir limpeza administrativa.');
      setDeleting(null);
    }
  };

  return (
    <section className="quote-attachments-panel" aria-label={`Anexos da ${quote.code}`}>
      {canEdit && (
        <div className="quote-attachment-upload">
          <label className="file-drop">
            <FilePlus2 size={21} />
            <span>
              <strong>
                {files.length ? `${files.length} arquivo(s) selecionado(s)` : 'Selecionar arquivos'}
              </strong>
              <small>PDF, imagens, videos, DOCX ou XLSX · ate 100 MB cada</small>
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx"
              onChange={(event) => selectFiles(Array.from(event.target.files || []))}
            />
          </label>
          <label className="field">
            Descricao dos arquivos
            <input
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={!files.length || Boolean(uploading)}
            onClick={() => void upload()}
          >
            <Paperclip size={17} />
            {uploading
              ? `Enviando ${uploading.current} de ${uploading.total}`
              : `Enviar${files.length > 1 ? ` ${files.length} arquivos` : ''}`}
          </button>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <InlineLoading label="Carregando anexos" />
      ) : attachments.length ? (
        <div className="quote-attachment-list">
          {attachments.map((attachment) => (
            <article key={attachment.id}>
              <span className="attachment-row__icon">
                <AttachmentIcon mimeType={attachment.mimeType} />
              </span>
              <div>
                <strong>{attachment.originalName}</strong>
                <span>{attachment.description || 'Sem descricao.'}</span>
              </div>
              <span>{formatSize(attachment.sizeBytes)}</span>
              <span>{new Intl.DateTimeFormat('pt-BR').format(new Date(attachment.createdAt))}</span>
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={openingId === attachment.id}
                onClick={() => void openAttachment(attachment)}
              >
                {attachmentKind(attachment.mimeType) === 'document' ? (
                  <ExternalLink size={15} />
                ) : (
                  <Play size={15} />
                )}
                {attachmentKind(attachment.mimeType) === 'document' ? 'Abrir' : 'Visualizar'}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  aria-label={`Remover ${attachment.originalName}`}
                  onClick={() => setDeleting(attachment)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum anexo"
          detail="Os arquivos vinculados a esta cotacao aparecerao aqui."
        />
      )}

      {preview && (
        <div className="quote-attachment-preview">
          <header>
            <strong>{preview.attachment.originalName}</strong>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => setPreview(null)}
            >
              Fechar visualizacao
            </button>
          </header>
          {attachmentKind(preview.attachment.mimeType) === 'image' && (
            <img src={preview.url} alt={preview.attachment.originalName} />
          )}
          {attachmentKind(preview.attachment.mimeType) === 'pdf' && (
            <iframe src={preview.url} title={preview.attachment.originalName} />
          )}
          {attachmentKind(preview.attachment.mimeType) === 'video' && (
            <video src={preview.url} controls>
              <track kind="captions" />
            </video>
          )}
        </div>
      )}

      {deleting && (
        <div className="quote-attachment-confirm" role="alert">
          <span>
            Remover <strong>{deleting.originalName}</strong>?
          </span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setDeleting(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button--danger button--small"
            onClick={() => void remove()}
          >
            Remover
          </button>
        </div>
      )}
    </section>
  );
}

export function QuoteAttachmentsModal({
  quote,
  open,
  canEdit,
  onClose,
  onChanged,
}: {
  quote: QuoteReference | null;
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}) {
  return (
    <Modal
      className="quote-attachments-modal"
      open={open && Boolean(quote)}
      title={quote ? `Anexos da ${quote.code}` : 'Anexos da cotacao'}
      description="Arquivos privados com acesso temporario."
      onClose={onClose}
    >
      {quote && <QuoteAttachmentsPanel quote={quote} canEdit={canEdit} onChanged={onChanged} />}
    </Modal>
  );
}
