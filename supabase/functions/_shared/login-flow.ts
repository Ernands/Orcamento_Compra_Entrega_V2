export interface LoginContext {
  allowed: boolean;
  technical_email: string | null;
  auth_user_id: string | null;
  account_status: 'active' | 'inactive' | 'blocked' | null;
}

interface AuthenticatedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

interface LoginFlowInput {
  cpfLookup: string;
  ipHash: string;
  password: string;
}

interface LoginFlowDependencies {
  beginLogin: (cpfLookup: string, ipHash: string) => Promise<LoginContext>;
  authenticate: (technicalEmail: string, password: string) => Promise<AuthenticatedSession | null>;
  finishLogin: (
    cpfLookup: string,
    ipHash: string,
    success: boolean,
    authUserId: string | null,
  ) => Promise<void>;
}

export interface LoginFlowResult {
  status: number;
  body: Record<string, unknown>;
}

export async function executeCpfLogin(
  input: LoginFlowInput,
  dependencies: LoginFlowDependencies,
): Promise<LoginFlowResult> {
  const context = await dependencies.beginLogin(input.cpfLookup, input.ipHash);

  if (!context.allowed) {
    return {
      status: 429,
      body: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos.' },
    };
  }
  if (context.account_status === 'inactive') {
    return {
      status: 403,
      body: { code: 'ACCOUNT_INACTIVE', message: 'Este acesso esta inativo.' },
    };
  }
  if (context.account_status === 'blocked') {
    return {
      status: 403,
      body: { code: 'ACCOUNT_BLOCKED', message: 'Este acesso esta bloqueado.' },
    };
  }

  const technicalEmail =
    context.technical_email || `unknown-${input.cpfLookup.slice(0, 20)}@auth.implanta27.invalid`;
  const authenticated = await dependencies.authenticate(technicalEmail, input.password);
  const valid = Boolean(authenticated && authenticated.userId === context.auth_user_id);

  await dependencies.finishLogin(
    input.cpfLookup,
    input.ipHash,
    valid,
    valid && authenticated ? authenticated.userId : null,
  );

  if (!valid || !authenticated) {
    return {
      status: 401,
      body: { code: 'INVALID_CREDENTIALS', message: 'CPF ou senha invalidos.' },
    };
  }

  return {
    status: 200,
    body: {
      session: {
        access_token: authenticated.accessToken,
        refresh_token: authenticated.refreshToken,
      },
    },
  };
}
