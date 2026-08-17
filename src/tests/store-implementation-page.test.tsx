import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listPublishedChecklistVersions } from '../data/checklists/checklists-repository';
import { getStoreImplementation } from '../data/implementation/implementation-repository';
import { listResponsibleUsers } from '../data/stores/stores-repository';
import type { Store } from '../domain/types';
import { StoreImplementationPage } from '../pages/store-implementation-page';
import { StoreWorkspaceContext } from '../pages/store-workspace-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/checklists/checklists-repository', () => ({
  listPublishedChecklistVersions: vi.fn(),
}));
vi.mock('../data/stores/stores-repository', () => ({
  listResponsibleUsers: vi.fn(),
}));
vi.mock('../data/implementation/implementation-repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../data/implementation/implementation-repository')>();
  return {
    ...actual,
    getStoreImplementation: vi.fn(),
    startStoreImplementation: vi.fn(),
    updateImplementationItem: vi.fn(),
  };
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
  plannedOpeningDate: '2026-09-25',
  notes: null,
};

describe('StoreImplementationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(getStoreImplementation).mockResolvedValue(null);
    vi.mocked(listPublishedChecklistVersions).mockResolvedValue([
      {
        id: 'version-1',
        versionNumber: 1,
        name: 'Checklist de Implantacao',
        status: 'published',
        notes: null,
        publishedAt: '2026-08-17T00:00:00Z',
        createdAt: '2026-08-17T00:00:00Z',
        itemCount: 30,
      },
    ]);
    vi.mocked(listResponsibleUsers).mockResolvedValue([]);
  });

  it('usa a data prevista de inauguracao ao iniciar uma implantacao', async () => {
    render(
      <StoreWorkspaceContext.Provider value={{ store, reloadStore: vi.fn() }}>
        <StoreImplementationPage />
      </StoreWorkspaceContext.Provider>,
    );

    const openingDate = await screen.findByLabelText('Data prevista de inauguração');
    expect(openingDate).toHaveValue('2026-09-25');
    expect(screen.queryByText('Data-base')).not.toBeInTheDocument();
  });
});
