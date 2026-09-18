import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { authorizedHomePath, RequireCapability } from '../app/guards';
import { AppShell } from '../app/app-shell';
import { useSession } from '../app/session-provider';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));

const restrictedCapabilities = [
  'works.view',
  'finance.view',
  'finance.overview_view',
  'finance.store_detail_view',
  'finance.store_detail_documents_view',
] as const;

function restrictedSession() {
  const capabilities = [...restrictedCapabilities];
  return {
    session: {} as never,
    viewer: {
      id: 'user-restricted',
      authUserId: 'auth-restricted',
      name: 'Consulta Obras Financeiro',
      status: 'active' as const,
      mustChangePassword: false,
      allStores: true,
      profile: { id: 'profile-consult', key: 'consultation', name: 'Consulta' },
      capabilities: capabilities as never,
    },
    loading: false,
    error: null,
    login: vi.fn(),
    signOut: vi.fn(),
    refreshViewer: vi.fn(),
    can: (capability: string) => capabilities.includes(capability as never),
  };
}

describe('granular route visibility', () => {
  it('escolhe uma rota inicial que o usuario restrito pode acessar', () => {
    expect(authorizedHomePath([...restrictedCapabilities])).toBe('/obras');
  });

  it('redireciona tentativa de rota bloqueada para uma rota autorizada', () => {
    vi.mocked(useSession).mockReturnValue(restrictedSession());
    render(
      <MemoryRouter initialEntries={['/acessos']}>
        <Routes>
          <Route path="/obras" element={<span>Obras permitidas</span>} />
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

    expect(screen.getByText('Obras permitidas')).toBeInTheDocument();
    expect(screen.queryByText('Acessos privados')).not.toBeInTheDocument();
  });

  it('menu exibe somente Obras e Financeiro para o exemplo restrito', () => {
    vi.mocked(useSession).mockReturnValue(restrictedSession());
    render(
      <MemoryRouter initialEntries={['/obras']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/obras" element={<span>Conteudo obras</span>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Obras e Serviços' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Financeiro' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Lojas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acessos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Compras' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cotacoes' })).not.toBeInTheDocument();
  });
});
