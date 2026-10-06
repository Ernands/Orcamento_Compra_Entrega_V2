import type { Session } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react';
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

let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  user: { id: 'auth-user-1' },
} as Session;

const refreshedSession = {
  ...session,
  access_token: 'refreshed-access-token',
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
  const { viewer: currentViewer, error } = useSession();
  return (
    <div>
      <span>{currentViewer?.name || 'Anonimo'}</span>
      {error && <span>{error}</span>}
    </div>
  );
}

describe('SessionProvider refresh resiliency', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    authStateCallback = null;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
  });

  it('mantem o viewer carregado quando o token e renovado', async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadViewer.mockResolvedValue(viewer);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(await screen.findByText('Maria Consulta')).toBeInTheDocument();
    mocks.loadViewer.mockClear();

    await act(async () => {
      authStateCallback?.('TOKEN_REFRESHED', refreshedSession);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getByText('Maria Consulta')).toBeInTheDocument();
    expect(screen.queryByText('Nao foi possivel carregar suas permissoes. Entre novamente.')).toBeNull();
    expect(mocks.loadViewer).not.toHaveBeenCalled();
  });

  it('nao recarrega permissoes em SIGNED_IN repetido do mesmo usuario', async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadViewer.mockResolvedValue(viewer);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(await screen.findByText('Maria Consulta')).toBeInTheDocument();
    mocks.loadViewer.mockClear();

    await act(async () => {
      authStateCallback?.('SIGNED_IN', refreshedSession);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getByText('Maria Consulta')).toBeInTheDocument();
    expect(mocks.loadViewer).not.toHaveBeenCalled();
  });
});
