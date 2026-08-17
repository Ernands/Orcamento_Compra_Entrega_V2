import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { listPendingImplementationItems } from '../data/implementation/implementation-repository';
import { PendingItemsPage } from '../pages/pending-items-page';

vi.mock('../data/implementation/implementation-repository', () => ({
  listPendingImplementationItems: vi.fn(),
}));

const base = {
  implementationId: 'implementation-1',
  description: null,
  guidance: null,
  responsibilityType: null,
  evidenceRequired: false,
  priority: 'normal' as const,
  position: 1,
  isRequired: true,
  responsibleUserId: null,
  completedAt: null,
  notes: null,
};

describe('PendingItemsPage', () => {
  it('filtra pendencias por status e atraso', async () => {
    const user = userEvent.setup();
    vi.mocked(listPendingImplementationItems).mockResolvedValue([
      {
        ...base,
        id: '1',
        title: 'Licenca',
        category: 'Documentos',
        status: 'blocked',
        responsibleName: 'Ana',
        dueDate: '2026-01-01',
        storeId: 'store-1',
        storeCode: 'LOJ-001',
        storeName: 'Brasilia',
        overdueDays: 10,
      },
      {
        ...base,
        id: '2',
        title: 'Pintura',
        category: 'Obra',
        status: 'pending',
        responsibleName: null,
        dueDate: null,
        storeId: 'store-2',
        storeCode: 'LOJ-002',
        storeName: 'Goiania',
        overdueDays: 0,
      },
    ]);
    render(
      <MemoryRouter>
        <PendingItemsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Licenca')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'pending');
    expect(screen.queryByText('Licenca')).not.toBeInTheDocument();
    expect(screen.getByText('Pintura')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), '');
    await user.click(screen.getByText('Somente atrasadas'));
    expect(screen.getByText('Licenca')).toBeInTheDocument();
    expect(screen.queryByText('Pintura')).not.toBeInTheDocument();
  });
});
