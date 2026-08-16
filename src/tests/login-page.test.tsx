import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../pages/login-page';
import { useSession } from '../app/session-provider';
import { EdgeFunctionError } from '../lib/edge-function';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));

const login = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    vi.mocked(useSession).mockReturnValue({
      session: null,
      viewer: null,
      loading: false,
      error: null,
      login,
      signOut: vi.fn(),
      refreshViewer: vi.fn(),
      can: vi.fn(() => false),
    });
  });

  it('mostra somente CPF e senha, sem cadastro publico ou Google', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('textbox', { name: 'CPF' })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Criar minha conta/i)).not.toBeInTheDocument();
  });

  it('aplica mascara ao CPF digitado', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    expect(screen.getByRole('textbox', { name: 'CPF' })).toHaveValue('529.982.247-25');
  });

  it('nao envia CPF invalido ao endpoint', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'CPF' }), '11111111111');
    await user.type(screen.getByLabelText('Senha'), 'senha-invalida');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('CPF ou senha invalidos');
  });

  it('envia CPF e senha validos ao repositorio', async () => {
    const user = userEvent.setup();
    login.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    await user.type(screen.getByLabelText('Senha'), 'Senha temporaria 27');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(login).toHaveBeenCalledWith('529.982.247-25', 'Senha temporaria 27');
  });

  it('usa mensagem generica quando a autenticacao falha', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(new Error('user not found'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    await user.type(screen.getByLabelText('Senha'), 'Senha incorreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF ou senha invalidos');
  });

  it.each([
    ['ACCOUNT_INACTIVE', 'Este acesso esta inativo'],
    ['ACCOUNT_BLOCKED', 'Este acesso esta bloqueado'],
    ['RATE_LIMITED', 'Muitas tentativas'],
  ])('informa o estado seguro %s devolvido pelo endpoint', async (code, message) => {
    const user = userEvent.setup();
    login.mockRejectedValue(new EdgeFunctionError('Falha segura', code));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    await user.type(screen.getByLabelText('Senha'), 'Senha valida 27');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});
