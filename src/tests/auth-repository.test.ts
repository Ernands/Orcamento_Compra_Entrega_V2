import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeFunctionError } from '../lib/edge-function';

const mocks = vi.hoisted(() => ({
  invokeEdgeFunction: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/edge-function', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/edge-function')>()),
  invokeEdgeFunction: mocks.invokeEdgeFunction,
}));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    auth: {
      setSession: mocks.setSession,
      signOut: mocks.signOut,
    },
  },
}));

import { loginWithCpf, logout } from '../data/auth/auth-repository';

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
} as Session;

describe('repositorio de autenticacao', () => {
  beforeEach(() => {
    mocks.invokeEdgeFunction.mockReset();
    mocks.setSession.mockReset();
    mocks.signOut.mockReset();
  });

  it('estabelece no Supabase a sessao devolvida pelo endpoint CPF', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    });
    mocks.setSession.mockResolvedValue({ data: { session }, error: null });

    await expect(loginWithCpf('529.982.247-25', 'Senha valida 27')).resolves.toBe(session);
    expect(mocks.invokeEdgeFunction).toHaveBeenCalledWith('cpf-login', {
      cpf: '529.982.247-25',
      password: 'Senha valida 27',
    });
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
  });

  it('propaga falha generica do endpoint sem tentar criar sessao', async () => {
    const error = new EdgeFunctionError('CPF ou senha invalidos.', 'INVALID_CREDENTIALS', 401);
    mocks.invokeEdgeFunction.mockRejectedValue(error);

    await expect(loginWithCpf('529.982.247-25', 'Senha incorreta')).rejects.toBe(error);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it('rejeita tokens que o cliente Supabase nao consegue estabelecer', async () => {
    mocks.invokeEdgeFunction.mockResolvedValue({
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    });
    mocks.setSession.mockResolvedValue({ data: { session: null }, error: new Error('invalid') });

    await expect(loginWithCpf('529.982.247-25', 'Senha valida 27')).rejects.toThrow(
      'A sessao recebida nao pode ser estabelecida',
    );
  });

  it('encerra a sessao pelo Supabase Auth', async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(logout()).resolves.toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
