import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { listStores } from '../data/stores/stores-repository';
import { StoresPage } from '../pages/stores-page';

vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));

const stores = [
  {
    id: '1',
    code: 'LOJ-901',
    name: 'Loja Aurora',
    city: 'Campinas',
    state: 'SP',
    address: null,
    responsibleName: 'Ana',
    status: 'planning' as const,
    plannedOpeningDate: null,
    notes: null,
  },
  {
    id: '2',
    code: 'LOJ-902',
    name: 'Loja Horizonte',
    city: 'Niteroi',
    state: 'RJ',
    address: null,
    responsibleName: null,
    status: 'active' as const,
    plannedOpeningDate: null,
    notes: null,
  },
];

describe('StoresPage', () => {
  it('renderiza lojas retornadas pela camada de dados', async () => {
    vi.mocked(listStores).mockResolvedValue(stores);
    render(
      <MemoryRouter>
        <StoresPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Loja Aurora')).toBeInTheDocument();
    expect(screen.getByText('Loja Horizonte')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('filtra por cidade no desktop ou mobile', async () => {
    const user = userEvent.setup();
    vi.mocked(listStores).mockResolvedValue(stores);
    render(
      <MemoryRouter>
        <StoresPage />
      </MemoryRouter>,
    );
    await screen.findByText('Loja Aurora');
    await user.type(screen.getByRole('textbox', { name: 'Buscar lojas' }), 'Niteroi');
    expect(screen.queryByText('Loja Aurora')).not.toBeInTheDocument();
    expect(screen.getByText('Loja Horizonte')).toBeInTheDocument();
  });

  it('exibe estado vazio real quando a RLS nao retorna lojas', async () => {
    vi.mocked(listStores).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StoresPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Nenhuma loja liberada')).toBeInTheDocument();
  });

  it('exibe erro recuperavel', async () => {
    vi.mocked(listStores).mockRejectedValue(new Error('network'));
    render(
      <MemoryRouter>
        <StoresPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nao foi possivel carregar as lojas',
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
