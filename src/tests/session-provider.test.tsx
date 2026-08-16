import type { Session } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '../domain/types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  loadViewer: vi.fn(),
  loginWithCpf: vi.fn(),
  logout: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

vi.mock('../data/auth/auth-repository', () => ({
  loadViewer: mocks.loadViewer,
  loginWithCpf: mocks.loginWithCpf,
  logout: mocks.logout,
}));

import { SessionProvider, useSession } from '../app/session-provider';

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
} as Session;

const viewer: Viewer = {
  id: 'user-1',
  authUserId: 'auth-user-1',
  name: 'Maria Consulta',
  status: 'active',
  mustChangePassword: false,
  allStores: false,
  profile: { id: 'profile-1', key: 'consultation', name: 'Consulta' },
  capabilities: ['stores.view'],
};

function Probe() {
  const { viewer: currentViewer, loading, error, signOut } = useSession();
  if (loading) return <span>Carregando sessao</span>;
  return (
    <div>
      <span>{currentViewer?.name || 'Anonimo'}</span>
      {error && <span>{error}</span>}
      <button type="button" onClick={() => void signOut()}>
        Sair
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    });
  });

  it('resolve a inicializacao anonima sem exibir conteudo privado', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    renderProvider();

    expect(screen.getByText('Carregando sessao')).toBeInTheDocument();
    expect(await screen.findByText('Anonimo')).toBeInTheDocument();
    expect(mocks.loadViewer).not.toHaveBeenCalled();
  });

  it('restaura a sessao persistida e carrega o perfil autorizado', async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadViewer.mockResolvedValue(viewer);

    renderProvider();

    expect(await screen.findByText('Maria Consulta')).toBeInTheDocument();
    expect(mocks.loadViewer).toHaveBeenCalledOnce();
  });

  it('remove sessao e perfil ao executar logout', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadViewer.mockResolvedValue(viewer);
    mocks.logout.mockResolvedValue(undefined);
    renderProvider();
    await screen.findByText('Maria Consulta');

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Anonimo')).toBeInTheDocument();
  });

  it('nega o perfil quando a sessao nao pode carregar autorizacoes', async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadViewer.mockRejectedValue(new Error('RLS denied'));

    renderProvider();

    expect(
      await screen.findByText('Nao foi possivel carregar suas permissoes. Entre novamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Anonimo')).toBeInTheDocument();
  });
});
