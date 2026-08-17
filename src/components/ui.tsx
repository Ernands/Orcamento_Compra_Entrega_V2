import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Inbox, LoaderCircle, X } from 'lucide-react';

export function LoadingScreen({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}

export function InlineLoading({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="inline-state" role="status">
      <LoaderCircle className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Inbox size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button className="button button--secondary button--small" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    blocked: 'Bloqueado',
    planning: 'Planejamento',
    draft: 'Draft',
    published: 'Publicada',
    archived: 'Arquivada',
    not_started: 'Nao iniciada',
    in_progress: 'Em andamento',
    completed: 'Concluida',
    cancelled: 'Cancelada',
    pending: 'Pendente',
    not_applicable: 'Nao aplicavel',
    identified: 'Identificada',
    under_review: 'Em analise',
    resolved: 'Resolvida',
  };
  return <span className={`status-badge status-badge--${status}`}>{labels[status] || status}</span>;
}

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, description, onClose, children, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        {...props}
      >
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
