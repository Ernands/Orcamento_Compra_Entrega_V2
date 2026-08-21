import {
  ExternalLink,
  File,
  FilePlus2,
  Image as ImageIcon,
  Paperclip,
  Play,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSupplyQuoteAttachmentSignedUrl,
  deleteSupplyQuoteAttachment,
  listSupplyQuoteAttachments,
  QUOTE_DOCUMENT_LABELS,
  uploadSupplyQuoteAttachment,
  validateQuoteAttachment,
  type QuoteAttachment,
  type QuoteDocumentType,
} from '../data/attachments/quote-attachments-repository';
import type { SupplyQuote } from '../domain/types';
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
  const [attachments, setAttachments] = useState<QuoteAttachment[]>([]);
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<QuoteDocumentType>('quote');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ current: number; total: number; name: string } | null>(null);
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    attachment: QuoteAttachment;
    url: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<QuoteAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    setRetryFiles([]);
    setSuccess(null);
    void load();
  }, [load]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    const validationError = files.map(validateQuoteAttachment).find(Boolean);
    if (validationError) {
      setRetryFiles([]);
      setError(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setError(null);
    setSuccess(null);
    setRetryFiles([]);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setUploading({ current: index + 1, total: files.length, name: file.name });
      try {
        await uploadSupplyQuoteAttachment(quote.id, file, description, documentType);
      } catch (uploadError) {
        setRetryFiles(files.slice(index));
        setError(
          uploadError instanceof Error
            ? `${file.name}: ${uploadError.message}`
            : `${file.name}: falha no envio.`,
        );
        setUploading(null);
        if (inputRef.current) inputRef.current.value = '';
        await load();
        await onChanged?.();
        return;
      }
    }

    setUploading(null);
    setDescription('');
    if (inputRef.current) inputRef.current.value = '';
    await load();
    await onChanged?.();
    setSuccess(`${files.length} arquivo(s) salvo(s) com sucesso.`);
  };

  const openAttachment = async (attachment: QuoteAttachment) => {
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
          <div className="form-grid form-grid--three">
            <label className="field">
              Tipo do documento
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as QuoteDocumentType)}
                disabled={Boolean(uploading)}
              >
                {Object.entries(QUOTE_DOCUMENT_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Descricao dos arquivos
              <input
                value={description}
                maxLength={1000}
                disabled={Boolean(uploading)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="file-drop">
              <FilePlus2 size={21} />
              <span>
                <strong>
                  {uploading
                    ? `Enviando ${uploading.current} de ${uploading.total}`
                    : 'Selecionar e enviar arquivos'}
                </strong>
                <small>
                  {uploading ? uploading.name : 'PDF, imagens, videos, DOCX ou XLSX · ate 100 MB cada'}
                </small>
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                disabled={Boolean(uploading)}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.m4v,.docx,.xlsx"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  void uploadFiles(files);
                }}
              />
            </label>
          </div>
          <p className="form-help">
            O envio inicia automaticamente. O arquivo so esta vinculado quando aparecer abaixo com <strong>Salvo ✓</strong>.
          </p>
          {retryFiles.length > 0 && !uploading && (
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => void uploadFiles(retryFiles)}
            >
              <RefreshCcw size={16} />
              Tentar novamente ({retryFiles.length})
            </button>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
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
                <span>
                  {QUOTE_DOCUMENT_LABELS[attachment.documentType]} · {attachment.description || 'Sem descricao.'} · Salvo ✓
                </span>
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
      description="Arquivos privados com acesso temporario. Se houver envio em andamento, aguarde a confirmacao Salvo antes de fechar."
      onClose={onClose}
    >
      {quote && <QuoteAttachmentsPanel quote={quote} canEdit={canEdit} onChanged={onChanged} />}
    </Modal>
  );
}
