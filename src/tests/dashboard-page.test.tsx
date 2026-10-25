import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadImplementationDashboard,
  loadSupplyDashboard,
} from '../data/dashboard/dashboard-repository';
import type { ImplementationDashboard, SupplyDashboard } from '../domain/types';
import { DashboardPage } from '../pages/dashboard-page';

vi.mock('../app/session-provider', () => ({
  useSession: () => ({
    can: (capability: string) => capability === 'items.view',
  }),
}));

vi.mock('../data/dashboard/dashboard-repository', () => ({
  loadImplementationDashboard: vi.fn(),
  loadSupplyDashboard: vi.fn(),
}));

const implementation: ImplementationDashboard = {
  totalStores: 3,
  notStartedStores: 1,
  inProgressStores: 1,
  readyStores: 1,
  overdueStores: 1,
  pendingActivities: 4,
  criticalActivities: 2,
  stores: [],
  byState: [
    { label: 'SP', storeCount: 2, averageProgress: 70, overdueStores: 1, pendingActivities: 3 },
  ],
  byResponsible: [
    { label: 'Ana', storeCount: 2, averageProgress: 70, overdueStores: 1, pendingActivities: 3 },
  ],
  upcomingOpenings: [],
};

const supply: SupplyDashboard = {
  activeItems: 12,
  openNeeds: 7,
  unlinkedNeeds: 2,
  activeSuppliers: 5,
  totalQuotes: 4,
  receivedQuotes: 3,
  comparableQuotes: 2,
  needsByStatus: [{ label: 'Identificadas', count: 4 }],
  needsByStore: [{ label: 'LOJ-001 - Loja Um', count: 3 }],
  recurringItems: [{ label: 'ITM-0001 - Cadeira', count: 3 }],
  quotesByStore: [{ label: 'LOJ-001 - Loja Um', count: 2 }],
  quotesByItem: [{ label: 'ITM-0001 - Cadeira', count: 2 }],
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadImplementationDashboard).mockResolvedValue(implementation);
    vi.mocked(loadSupplyDashboard).mockResolvedValue(supply);
  });

  it('carrega a visao geral legada sem exibir as abas temporariamente ocultas', async () => {
    render(
      <MemoryRouter>
        <DashboardPage view="overview" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Total de lojas')).toBeInTheDocument();
    expect(screen.getByText('Itens ativos')).toBeInTheDocument();
    // Componentes legados continuam executáveis por rota direta, mas as abas
    // foram ocultadas temporariamente da navegação para o usuário.
    expect(screen.queryByRole('link', { name: /Visao Geral/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Implantacao/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Suprimentos/ })).not.toBeInTheDocument();
    expect(loadImplementationDashboard).toHaveBeenCalledOnce();
    expect(loadSupplyDashboard).toHaveBeenCalledOnce();
  });

  it('exibe os recortes operacionais completos de suprimentos', async () => {
    render(
      <MemoryRouter>
        <DashboardPage view="supply" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Necessidades por status')).toBeInTheDocument();
    expect(screen.getByText('Necessidades por loja')).toBeInTheDocument();
    expect(screen.getByText('Itens mais recorrentes')).toBeInTheDocument();
    expect(screen.getByText('Cotacoes por loja')).toBeInTheDocument();
    expect(screen.getByText('Cotacoes por item')).toBeInTheDocument();
    expect(loadImplementationDashboard).not.toHaveBeenCalled();
  });
});
