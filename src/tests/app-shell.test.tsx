import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../app/app-shell';
import { useSession } from '../app/session-provider';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));

function renderShell(capabilities: string[]) {
  vi.mocked(useSession).mockReturnValue({
    session: {} as never,
    viewer: {
      id: 'user-1',
      authUserId: 'auth-1',
      name: 'Maria Consulta',
      status: 'active',
      mustChangePassword: false,
      allStores: false,
      profile: { id: 'profile-1', key: 'consultation', name: 'Consulta' },
      capabilities: capabilities as never,
    },
    loading: false,
    error: null,
    login: vi.fn(),
    signOut: vi.fn(),
    refreshViewer: vi.fn(),
    can: (capability) => capabilities.includes(capability),
  });
  render(
    <MemoryRouter initialEntries={['/lojas']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/lojas" element={<span>Conteudo lojas</span>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('mostra apenas modulos implementados e permitidos para Consulta', () => {
    renderShell(['stores.view']);
    expect(screen.getAllByRole('link', { name: 'Lojas' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Acessos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Financeiro')).not.toBeInTheDocument();
    expect(screen.getAllByText('Implantacao').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Pendencias' })).not.toBeInTheDocument();
  });

  it('mostra Acessos somente com a capacidade correspondente', () => {
    renderShell(['stores.view', 'access.view']);
    expect(screen.getAllByRole('link', { name: 'Acessos' }).length).toBeGreaterThan(0);
  });

  it('separa operacao e administracao do checklist por capability', () => {
    renderShell(['stores.view', 'implementation.view', 'checklists.view']);
    expect(screen.getAllByRole('link', { name: 'Pendencias' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Checklist Mestre' }).length).toBeGreaterThan(0);
  });

  it('mostra somente as opcoes de Suprimentos liberadas por capability', () => {
    renderShell(['items.view', 'quotes.view']);
    expect(screen.getAllByRole('link', { name: 'Itens e Necessidades' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Cotacoes' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Comparativo' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Fornecedores' })).not.toBeInTheDocument();
  });
});
