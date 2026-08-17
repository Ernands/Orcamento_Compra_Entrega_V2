import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listStoreAttachments } from '../data/attachments/attachments-repository';
import type { Store } from '../domain/types';
import { StoreAttachmentsPage } from '../pages/store-attachments-page';
import { StoreWorkspaceContext } from '../pages/store-workspace-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/attachments/attachments-repository', () => ({
  listStoreAttachments: vi.fn(),
  uploadStoreAttachment: vi.fn(),
  createAttachmentSignedUrl: vi.fn(),
  deleteStoreAttachment: vi.fn(),
}));

const store: Store = {
  id: 'store-1',
  code: 'LOJ-001',
  name: 'Brasilia',
  city: 'Brasilia',
  state: 'DF',
  address: null,
  responsibleUserId: null,
  responsibleName: null,
  status: 'planning',
  plannedOpeningDate: null,
  notes: null,
};

function renderPage() {
  return render(
    <StoreWorkspaceContext.Provider value={{ store, reloadStore: vi.fn() }}>
      <StoreAttachmentsPage />
    </StoreWorkspaceContext.Provider>,
  );
}

describe('StoreAttachmentsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => false } as never);
  });

  it('mantem Consulta em leitura e oculta upload/remocao', async () => {
    vi.mocked(listStoreAttachments).mockResolvedValue([
      {
        id: 'attachment-1',
        storeId: store.id,
        originalName: 'projeto.pdf',
        storagePath: 'lojas/store-1/loja/file/projeto.pdf',
        category: 'project',
        description: null,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdAt: '2026-08-16T00:00:00Z',
      },
    ]);
    renderPage();
    expect(await screen.findByText('projeto.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar anexo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover projeto.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir projeto.pdf' })).toBeInTheDocument();
  });

  it('exibe erro de carregamento sem inventar dados locais', async () => {
    vi.mocked(listStoreAttachments).mockRejectedValue(new Error('network'));
    renderPage();
    expect(await screen.findByText('Nao foi possivel carregar os anexos.')).toBeInTheDocument();
  });
});
