import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

import { RequireSession } from '../app/guards';
import { SessionProvider, useSession } from '../app/session-provider';

const initialSession = {
  user: { id: 'auth-user-1' },
  access_token: 'original-token',
  refresh_token: 'refresh-token',
} as Session;

const renewedSession = { ...initialSession, access_token: 'renewed-token' } as Session;

const activeViewer: Viewer = {
  id: 'user-1',
  authUserId: 'auth-user-1',
  name: 'Operadora',
  status: 'active',
  mustChangePassword: false,
  allStores: false,
  profile: { id: 'profile-1', key: 'manager', name: 'Gestora' },
  capabilities: ['stores.view'],
};

let sendAuthEvent: ((event: AuthChangeEvent, session: Session | null) => void) | null;

function ProtectedContent() {
  const { session, viewer, refreshViewer } = useSession();
  return (
    <div>
      <span>Area protegida: {viewer?.name}</span>
      <span>Token: {session?.access_token}</span>
      <button type="button" onClick={() => void refreshViewer()}>Revalidar perfil</button>
    </div>
  );
}

function mountProtected() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/protegida']}>
        <Routes>
          <Route
            path="/protegida"
            element={<RequireSession><ProtectedContent /></RequireSession>}
          />
          <Route path="/login" element={<span>Tela de login</span>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

async function event(eventType: AuthChangeEvent, session: Session | null) {
  await act(async () => {
    sendAuthEvent?.(eventType, session);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
  });
}

describe('estabilidade da sessao e permissoes', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    sendAuthEvent = null;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      sendAuthEvent = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    mocks.getSession.mockResolvedValue({ data: { session: initialSession }, error: null });
    mocks.loadViewer.mockResolvedValue(activeViewer);
  });

  it('mantem acesso e permissoes sem refazer consultas na renovacao de token', async () => {
    mountProtected();
    expect(await screen.findByText('Area protegida: Operadora')).toBeInTheDocument();
    expect(mocks.loadViewer).toHaveBeenCalledTimes(1);

    await event('TOKEN_REFRESHED', renewedSession);
    expect(screen.getByText('Token: renewed-token')).toBeInTheDocument();
    expect(screen.getByText('Area protegida: Operadora')).toBeInTheDocument();
    expect(mocks.loadViewer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tela de login')).toBeNull();
  });

  it('ignora login repetido da mesma identidade com perfil verificado', async () => {
    mountProtected();
    await screen.findByText('Area protegida: Operadora');
    await event('SIGNED_IN', renewedSession);
    expect(mocks.loadViewer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Area protegida: Operadora')).toBeInTheDocument();
  });

  it('refaz consulta que sofreu falha temporaria sem derrubar a sessao', async () => {
    mocks.loadViewer
      .mockResolvedValueOnce(activeViewer)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(activeViewer);

    mountProtected();
    await screen.findByText('Area protegida: Operadora');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Revalidar perfil' }));

    await waitFor(() => expect(mocks.loadViewer).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Area protegida: Operadora')).toBeInTheDocument();
    expect(screen.queryByText('Tela de login')).toBeNull();
  });

  it('restringe o acesso e permite nova tentativa quando a consulta falha de verdade', async () => {
    mocks.loadViewer.mockRejectedValueOnce({ status: 403, message: 'RLS denied' });
    mountProtected();

    expect(await screen.findByText('Nao foi possivel validar suas permissoes. Tente novamente.'))
      .toBeInTheDocument();
    expect(screen.queryByText('Area protegida: Operadora')).toBeNull();
    expect(screen.queryByText('Tela de login')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Area protegida: Operadora')).toBeInTheDocument();
  });

  it('substitui o perfil quando uma nova identidade entra', async () => {
    const secondViewer = { ...activeViewer, authUserId: 'auth-user-2', name: 'Outra pessoa' };
    mountProtected();
    await screen.findByText('Area protegida: Operadora');

    mocks.loadViewer.mockResolvedValueOnce(secondViewer);
    await event('SIGNED_IN', {
      ...initialSession,
      user: { id: 'auth-user-2' },
      access_token: 'second-token',
    } as Session);

    expect(await screen.findByText('Area protegida: Outra pessoa')).toBeInTheDocument();
    expect(screen.queryByText('Area protegida: Operadora')).toBeNull();
  });

  it('faz logout real e nao restaura autorizacoes por resposta atrasada', async () => {
    let finishViewer!: (value: Viewer) => void;
    mocks.loadViewer.mockImplementationOnce(
      () => new Promise<Viewer>((resolve) => { finishViewer = resolve; }),
    );
    mountProtected();
    await waitFor(() => expect(mocks.loadViewer).toHaveBeenCalledTimes(1));

    await event('SIGNED_OUT', null);
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();

    await act(async () => { finishViewer(activeViewer); });
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Area protegida: Operadora')).toBeNull();
  });

  it('nao restaura uma sessao antiga quando a inicializacao termina apos SIGNED_OUT', async () => {
    let finishSession!: (value: { data: { session: Session }; error: null }) => void;
    mocks.getSession.mockImplementationOnce(
      () => new Promise((resolve) => { finishSession = resolve; }),
    );
    mountProtected();
    await event('SIGNED_OUT', null);
    await screen.findByText('Tela de login');

    await act(async () => {
      finishSession({ data: { session: initialSession }, error: null });
    });
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
    expect(mocks.loadViewer).not.toHaveBeenCalled();
  });
});
