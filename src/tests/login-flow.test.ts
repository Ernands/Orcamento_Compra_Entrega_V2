import { describe, expect, it, vi } from 'vitest';
import { executeCpfLogin, type LoginContext } from '../../supabase/functions/_shared/login-flow';

const input = {
  cpfLookup: 'a'.repeat(64),
  ipHash: 'b'.repeat(64),
  password: 'Senha valida 27',
};

const activeContext: LoginContext = {
  allowed: true,
  technical_email: 'technical@auth.implanta27.invalid',
  auth_user_id: 'auth-user-1',
  account_status: 'active',
};

function dependencies(
  context: LoginContext,
  authentication: {
    userId: string;
    accessToken: string;
    refreshToken: string;
  } | null = null,
) {
  return {
    beginLogin: vi.fn().mockResolvedValue(context),
    authenticate: vi.fn().mockResolvedValue(authentication),
    finishLogin: vi.fn().mockResolvedValue(undefined),
  };
}

describe('fluxo seguro de login por CPF', () => {
  it('responde de forma generica para usuario inexistente', async () => {
    const deps = dependencies({
      allowed: true,
      technical_email: null,
      auth_user_id: null,
      account_status: null,
    });

    const result = await executeCpfLogin(input, deps);

    expect(result).toMatchObject({
      status: 401,
      body: { code: 'INVALID_CREDENTIALS', message: 'CPF ou senha invalidos.' },
    });
    expect(deps.authenticate).toHaveBeenCalledWith(
      `unknown-${input.cpfLookup.slice(0, 20)}@auth.implanta27.invalid`,
      input.password,
    );
    expect(deps.finishLogin).toHaveBeenCalledWith(input.cpfLookup, input.ipHash, false, null);
  });

  it('responde de forma generica quando a senha e invalida', async () => {
    const deps = dependencies(activeContext);

    const result = await executeCpfLogin(input, deps);

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(deps.finishLogin).toHaveBeenCalledWith(input.cpfLookup, input.ipHash, false, null);
  });

  it.each([
    ['inactive', 'ACCOUNT_INACTIVE'],
    ['blocked', 'ACCOUNT_BLOCKED'],
  ] as const)('interrompe conta %s antes de validar a senha', async (status, code) => {
    const deps = dependencies({ ...activeContext, account_status: status });

    const result = await executeCpfLogin(input, deps);

    expect(result).toMatchObject({ status: 403, body: { code } });
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('respeita o bloqueio temporario retornado pelo banco', async () => {
    const deps = dependencies({ ...activeContext, allowed: false });

    const result = await executeCpfLogin(input, deps);

    expect(result).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } });
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('entrega somente os tokens quando Auth confirma a identidade esperada', async () => {
    const deps = dependencies(activeContext, {
      userId: 'auth-user-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const result = await executeCpfLogin(input, deps);

    expect(result).toEqual({
      status: 200,
      body: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      },
    });
    expect(deps.finishLogin).toHaveBeenCalledWith(
      input.cpfLookup,
      input.ipHash,
      true,
      'auth-user-1',
    );
  });

  it('rejeita sessao emitida para identidade diferente do mapeamento CPF', async () => {
    const deps = dependencies(activeContext, {
      userId: 'auth-user-2',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const result = await executeCpfLogin(input, deps);

    expect(result.status).toBe(401);
    expect(deps.finishLogin).toHaveBeenCalledWith(input.cpfLookup, input.ipHash, false, null);
  });
});
