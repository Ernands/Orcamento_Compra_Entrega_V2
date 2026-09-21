import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  loadAccessAdminData,
  saveAccessUserPermissions,
} from '../data/access/access-repository';
import { AccessPage } from '../pages/access-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/access/access-repository', () => ({
  loadAccessAdminData: vi.fn(),
  createAccessUser: vi.fn(),
  updateAccessUser: vi.fn(),
  resetAccessUserPassword: vi.fn(),
  saveAccessUserPermissions: vi.fn(),
}));

const data = {
  profiles: [
    { id: 'profile-admin', key: 'administrator', name: 'Administrador' },
    { id: 'profile-consult', key: 'consultation', name: 'Consulta' },
  ],
  stores: [{ id: 'store-1', code: 'LOJ-901', name: 'Loja Aurora' }],
  permissions: [
    {
      id: 'perm-finance-menu',
      key: 'finance.view' as const,
      description: 'Visualizar pagamentos, custos e reembolsos das lojas acessiveis',
      moduleKey: 'finance',
      moduleName: 'Financeiro',
      actionKey: 'view',
      actionName: 'Visualizar',
    },
    {
      id: 'perm-overview',
      key: 'finance.overview_view' as const,
      description: 'Visualizar a aba Visao Geral do Financeiro',
      moduleKey: 'finance',
      moduleName: 'Financeiro',
      actionKey: 'overview_view',
      actionName: 'Visualizar Visao Geral',
    },
    {
      id: 'perm-payments',
      key: 'finance.payments_view' as const,
      description: 'Visualizar a aba Pagamentos do Financeiro',
      moduleKey: 'finance',
      moduleName: 'Financeiro',
      actionKey: 'payments_view',
      actionName: 'Visualizar pagamentos',
    },
    {
      id: 'perm-stores',
      key: 'finance.stores_ufs_view' as const,
      description: 'Visualizar a aba Lojas e UFs do Financeiro',
      moduleKey: 'finance',
      moduleName: 'Financeiro',
      actionKey: 'stores_ufs_view',
      actionName: 'Visualizar lojas e UFs',
    },
    {
      id: 'perm-reimbursements',
      key: 'finance.reimbursements_view' as const,
      description: 'Visualizar a aba Reembolsos do Financeiro',
      moduleKey: 'finance',
      moduleName: 'Financeiro',
      actionKey: 'reimbursements_view',
      actionName: 'Visualizar reembolsos',
    },
  ],
  profilePermissions: [
    { profileId: 'profile-consult', permissionId: 'perm-finance-menu' },
    { profileId: 'profile-consult', permissionId: 'perm-overview' },
    { profileId: 'profile-consult', permissionId: 'perm-stores' },
    { profileId: 'profile-consult', permissionId: 'perm-reimbursements' },
  ],
  userPermissionOverrides: [],
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

describe('AccessPage granular permissions', () => {
  beforeEach(() => {
    vi.mocked(loadAccessAdminData).mockResolvedValue(data);
    vi.mocked(saveAccessUserPermissions).mockResolvedValue();
  });

  it('salva bloqueio e concessao especificos sem alterar o perfil', async () => {
    const user = userEvent.setup();
    sessionWith(['access.view', 'access.permissions_manage']);

    render(<AccessPage />);
    await screen.findByText('Joana Consulta');
    await user.click(screen.getByRole('button', { name: 'Editar permissoes de Joana Consulta' }));

    expect(screen.getAllByText('Perfil: permitido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Perfil: bloqueado').length).toBeGreaterThan(0);

    await user.selectOptions(
      screen.getByLabelText('Visualizar a aba Visao Geral do Financeiro para Joana Consulta'),
      'deny',
    );
    await user.selectOptions(
      screen.getByLabelText('Visualizar a aba Pagamentos do Financeiro para Joana Consulta'),
      'grant',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar permissoes' }));

    expect(saveAccessUserPermissions).toHaveBeenCalledWith('user-2', [
      { permissionId: 'perm-overview', effect: 'deny' },
      { permissionId: 'perm-payments', effect: 'grant' },
    ]);
    expect(await screen.findByText('Permissoes do usuario atualizadas.')).toBeInTheDocument();
  });

  it('mantem o menu financeiro e bloqueia somente as outras abas pelo atalho', async () => {
    const user = userEvent.setup();
    sessionWith(['access.view', 'access.permissions_manage']);

    render(<AccessPage />);
    await screen.findByText('Joana Consulta');
    await user.click(screen.getByRole('button', { name: 'Editar permissoes de Joana Consulta' }));

    expect(
      screen.getByLabelText('Exibir o menu Financeiro para Joana Consulta'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apenas Visão Geral' }));

    expect(
      screen.getByLabelText('Exibir o menu Financeiro para Joana Consulta'),
    ).toHaveValue('inherit');
    expect(
      screen.getByLabelText('Visualizar a aba Visao Geral do Financeiro para Joana Consulta'),
    ).toHaveValue('inherit');
    expect(
      screen.getByLabelText('Visualizar a aba Pagamentos do Financeiro para Joana Consulta'),
    ).toHaveValue('deny');
    expect(
      screen.getByLabelText('Visualizar a aba Lojas e UFs do Financeiro para Joana Consulta'),
    ).toHaveValue('deny');
    expect(
      screen.getByLabelText('Visualizar a aba Reembolsos do Financeiro para Joana Consulta'),
    ).toHaveValue('deny');

    await user.click(screen.getByRole('button', { name: 'Salvar permissoes' }));

    expect(saveAccessUserPermissions).toHaveBeenCalledWith('user-2', [
      { permissionId: 'perm-payments', effect: 'deny' },
      { permissionId: 'perm-stores', effect: 'deny' },
      { permissionId: 'perm-reimbursements', effect: 'deny' },
    ]);
  });

  it('nao exibe editor granular sem a permissao administrativa', async () => {
    sessionWith(['access.view']);
    render(<AccessPage />);
    await screen.findByText('Joana Consulta');

    expect(
      screen.queryByRole('button', { name: 'Editar permissoes de Joana Consulta' }),
    ).not.toBeInTheDocument();
  });
});
