import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { getStoreImplementation } from '../data/implementation/implementation-repository';
import { createStoreNeed, listStoreNeeds } from '../data/needs/needs-repository';
import type { Store } from '../domain/types';
import { StoreSummaryNeedsPage } from '../pages/store-summary-needs-page';
import { StoreWorkspaceContext } from '../pages/store-workspace-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/needs/needs-repository', () => ({
  listStoreNeeds: vi.fn(),
  createStoreNeed: vi.fn(),
  updateStoreNeed: vi.fn(),
}));
vi.mock('../data/implementation/implementation-repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../data/implementation/implementation-repository')>();
  return { ...actual, getStoreImplementation: vi.fn() };
});

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
const need = {
  id: 'need-1',
  storeId: store.id,
  title: 'Balcao',
  description: null,
  category: 'Mobiliario',
  quantity: 1,
  unit: 'un',
  priority: 'high' as const,
  status: 'identified' as const,
  notes: null,
  origin: 'manual' as const,
  sourceImplementationItemId: null,
  createdAt: '2026-08-16T00:00:00Z',
};

function renderPage() {
  return render(
    <StoreWorkspaceContext.Provider value={{ store, reloadStore: vi.fn() }}>
      <StoreSummaryNeedsPage />
    </StoreWorkspaceContext.Provider>,
  );
}

describe('StoreSummaryNeedsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listStoreNeeds).mockResolvedValue([need]);
    vi.mocked(getStoreImplementation).mockResolvedValue(null);
  });

  it('lista necessidades e mostra os indicadores da loja', async () => {
    renderPage();
    expect(await screen.findByText('Balcao')).toBeInTheDocument();
    expect(screen.getByText('Mobiliario')).toBeInTheDocument();
    expect(screen.getByText('Nao iniciada')).toBeInTheDocument();
  });

  it('cria uma necessidade manual quando a capability permite', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nova necessidade' }));
    await user.type(screen.getByLabelText('Item'), 'Cadeiras');
    await user.type(screen.getByLabelText('Grupo / area'), 'Mobiliario');
    await user.click(screen.getByRole('button', { name: 'Salvar necessidade' }));
    expect(createStoreNeed).toHaveBeenCalledWith(
      store.id,
      expect.objectContaining({ title: 'Cadeiras', category: 'Mobiliario', quantity: 1 }),
    );
  });
});
