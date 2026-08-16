import { isValidCpf, normalizeCpf } from '../_shared/cpf.ts';
import { isAllowedOrigin, json, preflight, readJson } from '../_shared/http.ts';
import { executeCpfLogin, type LoginContext } from '../_shared/login-flow.ts';
import { adminClient, hasValidPublishableKey, passwordAuthClient } from '../_shared/runtime.ts';
import { hmacHex, lookupSecret, requestIp } from '../_shared/security.ts';

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== 'POST') return json(request, { code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!isAllowedOrigin(request) || !hasValidPublishableKey(request)) {
    return json(request, { code: 'UNAUTHORIZED' }, 401);
  }

  const body = await readJson(request);
  const cpf = typeof body?.cpf === 'string' ? normalizeCpf(body.cpf) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!isValidCpf(cpf) || !password || password.length > 128) {
    return json(request, { code: 'INVALID_CREDENTIALS', message: 'CPF ou senha invalidos.' }, 401);
  }

  try {
    const secret = lookupSecret();
    const [cpfLookup, ipHash] = await Promise.all([
      hmacHex(secret, `cpf:${cpf}`),
      hmacHex(secret, `ip:${requestIp(request)}`),
    ]);
    const service = adminClient();
    const result = await executeCpfLogin(
      { cpfLookup, ipHash, password },
      {
        beginLogin: async (lookup, requestIpHash) => {
          const { data, error } = await service.rpc('auth_begin_login_attempt', {
            p_cpf_lookup: lookup,
            p_ip_hash: requestIpHash,
          });
          if (error) throw error;
          const context = (data?.[0] || null) as LoginContext | null;
          if (!context) throw new Error('Login context unavailable.');
          return context;
        },
        authenticate: async (technicalEmail, suppliedPassword) => {
          const { data, error } = await passwordAuthClient().auth.signInWithPassword({
            email: technicalEmail,
            password: suppliedPassword,
          });
          if (error || !data.session || !data.user) return null;
          return {
            userId: data.user.id,
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          };
        },
        finishLogin: async (lookup, requestIpHash, success, authUserId) => {
          const { error } = await service.rpc('auth_finish_login_attempt', {
            p_cpf_lookup: lookup,
            p_ip_hash: requestIpHash,
            p_success: success,
            p_auth_user_id: authUserId,
          });
          if (error) throw error;
        },
      },
    );

    return json(request, result.body, result.status);
  } catch {
    return json(
      request,
      { code: 'AUTH_UNAVAILABLE', message: 'Autenticacao temporariamente indisponivel.' },
      503,
    );
  }
});
