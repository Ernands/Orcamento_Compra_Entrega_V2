import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireCapability, RequirePasswordChanged, RequireSession } from '../app/guards';
import { useSession } from '../app/session-provider';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));

const viewer = {
  id: 'user-1',
  authUserId: 'auth-1',
  name: 'Usuario Teste',
  status: 'active' as const,
  mustChangePassword: false,
  allStores: false,
  profile: { id: 'profile-1', key: 'consultation', name: 'Consulta' },
  capabilities: ['stores.view' as const],
};

function sessionValue(overrides = {}) {
  return {
    session: { access_token: 'token' } as never,
    viewer,
    loading: false,
    error: null,
    login: vi.fn(),
    signOut: vi.fn(),
    refreshViewer: vi.fn(),
    can: (capability: string) => capability === 'stores.view',
    ...overrides,
  };
}

describe('route guards', () => {
  it('redireciona anonimo para login sem renderizar conteudo privado', () => {
    vi.mocked(useSession).mockReturnValue(sessionValue({ session: null, viewer: null }));
    render(
      <MemoryRouter initialEntries={['/lojas']}>
        <Routes>
          <Route path="/login" element={<span>Login seguro</span>} />
          <Route
            path="/lojas"
            element={
              <RequireSession>
                <span>Privado</span>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login seguro')).toBeInTheDocument();
    expect(screen.queryByText('Privado')).not.toBeInTheDocument();
  });

  it('permite rota quando a capacidade existe', () => {
    vi.mocked(useSession).mockReturnValue(sessionValue());
    render(
      <MemoryRouter>
        <RequireCapability capability="stores.view">
          <span>Lojas permitidas</span>
        </RequireCapability>
      </MemoryRouter>,
    );
    expect(screen.getByText('Lojas permitidas')).toBeInTheDocument();
  });

  it('bloqueia /acessos mesmo quando a URL e digitada diretamente', () => {
    vi.mocked(useSession).mockReturnValue(sessionValue());
    render(
      <MemoryRouter initialEntries={['/acessos']}>
        <Routes>
          <Route path="/lojas" element={<span>Lojas</span>} />
          <Route
            path="/acessos"
            element={
              <RequireCapability capability="access.view">
                <span>Acessos privados</span>
              </RequireCapability>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Lojas')).toBeInTheDocument();
    expect(screen.queryByText('Acessos privados')).not.toBeInTheDocument();
  });

  it('forca troca da senha temporaria', () => {
    vi.mocked(useSession).mockReturnValue(
      sessionValue({ viewer: { ...viewer, mustChangePassword: true } }),
    );
    render(
      <MemoryRouter initialEntries={['/lojas']}>
        <Routes>
          <Route path="/alterar-senha" element={<span>Troca obrigatoria</span>} />
          <Route
            path="/lojas"
            element={
              <RequirePasswordChanged>
                <span>Lojas</span>
              </RequirePasswordChanged>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Troca obrigatoria')).toBeInTheDocument();
  });
});
