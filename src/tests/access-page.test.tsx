import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { loadAccessAdminData } from '../data/access/access-repository';
import { AccessPage } from '../pages/access-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/access/access-repository', () => ({
  loadAccessAdminData: vi.fn(),
  createAccessUser: vi.fn(),
  updateAccessUser: vi.fn(),
  resetAccessUserPassword: vi.fn(),
}));

const data = {
  profiles: [
    { id: 'profile-admin', key: 'administrator', name: 'Administrador' },
    { id: 'profile-consult', key: 'consultation', name: 'Consulta' },
  ],
  stores: [{ id: 'store-1', code: 'LOJ-901', name: 'Loja Aurora' }],
  users: [
    {
      id: 'user-2',
      code: 'USR-0002',
      name: 'Joana Consulta',
      cpfLast4: '4725',
      status: 'active' as const,
      mustChangePassword: false,
      allStores: false,
      profile: { id: 'profile-consult', key: 'consultation', name: 'Consulta' },
      stores: [{ id: 'store-1', code: 'LOJ-901', name: 'Loja Aurora' }],
      lastLoginAt: null,
    },
  ],
};

function sessionWith(capabilities: string[]) {
  vi.mocked(useSession).mockReturnValue({
    session: {} as never,
    viewer: {
      id: 'user-1',
      authUserId: 'auth-1',
      name: 'Admin',
      status: 'active',
      mustChangePassword: false,
      allStores: true,
      profile: data.profiles[0],
      capabilities: capabilities as never,
    },
    loading: false,
    error: null,
    login: vi.fn(),
    signOut: vi.fn(),
    refreshViewer: vi.fn(),
    can: (capability) => capabilities.includes(capability),
  });
}

describe('AccessPage', () => {
  beforeEach(() => {
    vi.mocked(loadAccessAdminData).mockResolvedValue(data);
  });

  it('lista usuario com CPF mascarado, perfil, loja e status', async () => {
    sessionWith(['access.view']);
    render(<AccessPage />);
    expect(await screen.findByText('Joana Consulta')).toBeInTheDocument();
    expect(screen.getByText(/\*\*\*\.\*\*\*\.\*47-25/)).toBeInTheDocument();
    expect(screen.getByText('LOJ-901')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('nao mostra acoes de escrita sem capacidades', async () => {
    sessionWith(['access.view']);
    render(<AccessPage />);
    await screen.findByText('Joana Consulta');
    expect(screen.queryByRole('button', { name: 'Novo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Editar Joana/)).not.toBeInTheDocument();
  });

  it('abre formulario real de criacao para administrador', async () => {
    const user = userEvent.setup();
    sessionWith(['access.view', 'access.create']);
    render(<AccessPage />);
    await screen.findByText('Joana Consulta');
    await user.click(screen.getByRole('button', { name: 'Novo usuario' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Senha inicial/)).toBeInTheDocument();
  });

  it('usa estrutura responsiva baseada em lista e nao tabela larga', async () => {
    sessionWith(['access.view']);
    const { container } = render(<AccessPage />);
    await screen.findByText('Joana Consulta');
    expect(container.querySelector('.access-row')).toBeInTheDocument();
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });
});
