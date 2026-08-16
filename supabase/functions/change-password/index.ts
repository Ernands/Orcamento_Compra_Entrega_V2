import { isAllowedOrigin, json, preflight, readJson } from '../_shared/http.ts';
import {
  adminClient,
  authenticatedUser,
  hasValidPublishableKey,
  passwordAuthClient,
} from '../_shared/runtime.ts';
import { isStrongPassword } from '../_shared/security.ts';

interface AuthContext {
  usuario_id: string;
  mapped_auth_user_id: string;
  technical_email: string;
  account_status: 'active' | 'inactive' | 'blocked';
  must_change_password: boolean;
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== 'POST') return json(request, { code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!isAllowedOrigin(request) || !hasValidPublishableKey(request)) {
    return json(request, { code: 'UNAUTHORIZED' }, 401);
  }

  const user = await authenticatedUser(request);
  if (!user) return json(request, { code: 'UNAUTHORIZED' }, 401);
  const body = await readJson(request);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = body?.newPassword;
  if (!currentPassword || !isStrongPassword(newPassword) || currentPassword === newPassword) {
    return json(
      request,
      { code: 'INVALID_INPUT', message: 'Senha atual ou nova senha invalida.' },
      400,
    );
  }

  try {
    const service = adminClient();
    const { data, error } = await service.rpc('get_auth_context_for_service', {
      p_auth_user_id: user.id,
    });
    if (error) throw error;
    const context = (data?.[0] || null) as AuthContext | null;
    if (!context || context.account_status !== 'active') {
      return json(request, { code: 'ACCOUNT_UNAVAILABLE' }, 403);
    }

    const { data: reauthenticated, error: passwordError } =
      await passwordAuthClient().auth.signInWithPassword({
        email: context.technical_email,
        password: currentPassword,
      });
    if (passwordError || reauthenticated.user?.id !== user.id) {
      return json(
        request,
        { code: 'CURRENT_PASSWORD_INVALID', message: 'Senha atual invalida.' },
        401,
      );
    }

    const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError)
      return json(
        request,
        { code: 'PASSWORD_REJECTED', message: 'A nova senha nao foi aceita.' },
        400,
      );

    const { error: recordError } = await service.rpc('record_own_password_change', {
      p_auth_user_id: user.id,
    });
    if (recordError)
      return json(
        request,
        { code: 'CHANGE_INCOMPLETE', message: 'Senha alterada; atualizacao do perfil pendente.' },
        500,
      );

    return json(request, { ok: true });
  } catch {
    return json(
      request,
      { code: 'CHANGE_UNAVAILABLE', message: 'Alteracao de senha indisponivel.' },
      503,
    );
  }
});
