import { isValidCpf, normalizeCpf } from '../_shared/cpf.ts';
import { isAllowedOrigin, json, preflight, readJson } from '../_shared/http.ts';
import {
  adminClient,
  authenticatedUser,
  hasValidPublishableKey,
  userClient,
} from '../_shared/runtime.ts';
import { hmacHex, isStrongPassword, isUuid, lookupSecret } from '../_shared/security.ts';

const validStatuses = new Set(['active', 'inactive', 'blocked']);

function storeIdsFrom(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((id) => !isUuid(id))) return null;
  return [...new Set(value as string[])];
}

async function hasCapability(request: Request, capability: string): Promise<boolean> {
  const { data, error } = await userClient(request).rpc('get_my_capabilities');
  return !error && Array.isArray(data) && data.includes(capability);
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== 'POST') return json(request, { code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!isAllowedOrigin(request) || !hasValidPublishableKey(request)) {
    return json(request, { code: 'UNAUTHORIZED' }, 401);
  }

  const actor = await authenticatedUser(request);
  if (!actor) return json(request, { code: 'UNAUTHORIZED' }, 401);
  const body = await readJson(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const service = adminClient();

  try {
    if (action === 'create') {
      if (!(await hasCapability(request, 'access.create'))) {
        return json(request, { code: 'FORBIDDEN' }, 403);
      }

      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const cpf = typeof body?.cpf === 'string' ? normalizeCpf(body.cpf) : '';
      const profileId = body?.profileId;
      const storeIds = storeIdsFrom(body?.storeIds);
      const allStores = body?.allStores === true;
      const status = typeof body?.status === 'string' ? body.status : '';
      const initialPassword = body?.initialPassword;
      if (
        name.length < 2 ||
        name.length > 160 ||
        !isValidCpf(cpf) ||
        !isUuid(profileId) ||
        storeIds === null ||
        !validStatuses.has(status) ||
        !isStrongPassword(initialPassword)
      ) {
        return json(request, { code: 'INVALID_INPUT', message: 'Dados de acesso invalidos.' }, 400);
      }

      const cpfLookup = await hmacHex(lookupSecret(), `cpf:${cpf}`);
      const technicalEmail = `v2-${crypto.randomUUID()}@auth.implanta27.invalid`;
      const { data: authData, error: authError } = await service.auth.admin.createUser({
        email: technicalEmail,
        password: initialPassword,
        email_confirm: true,
      });
      if (authError || !authData.user) {
        return json(
          request,
          { code: 'CREATE_FAILED', message: 'Nao foi possivel criar o acesso.' },
          400,
        );
      }

      const { data: userId, error: recordError } = await service.rpc('admin_create_user_record', {
        p_actor_auth_user_id: actor.id,
        p_auth_user_id: authData.user.id,
        p_technical_email: technicalEmail,
        p_cpf_lookup: cpfLookup,
        p_cpf_last4: cpf.slice(-4),
        p_name: name,
        p_profile_id: profileId,
        p_store_ids: allStores ? [] : storeIds,
        p_all_stores: allStores,
        p_status: status,
        p_origin: 'edge',
      });
      if (recordError) {
        await service.auth.admin.deleteUser(authData.user.id);
        return json(
          request,
          { code: 'CREATE_FAILED', message: 'CPF ja utilizado ou dados invalidos.' },
          409,
        );
      }

      return json(request, { id: userId }, 201);
    }

    if (action === 'update') {
      if (!(await hasCapability(request, 'access.edit'))) {
        return json(request, { code: 'FORBIDDEN' }, 403);
      }
      const userId = body?.userId;
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const profileId = body?.profileId;
      const storeIds = storeIdsFrom(body?.storeIds);
      const allStores = body?.allStores === true;
      const status = typeof body?.status === 'string' ? body.status : '';
      if (
        !isUuid(userId) ||
        !isUuid(profileId) ||
        storeIds === null ||
        name.length < 2 ||
        name.length > 160 ||
        !validStatuses.has(status)
      ) {
        return json(request, { code: 'INVALID_INPUT', message: 'Dados de acesso invalidos.' }, 400);
      }
      const { error } = await service.rpc('admin_update_user_record', {
        p_actor_auth_user_id: actor.id,
        p_user_id: userId,
        p_name: name,
        p_profile_id: profileId,
        p_store_ids: allStores ? [] : storeIds,
        p_all_stores: allStores,
        p_status: status,
      });
      if (error)
        return json(
          request,
          { code: 'UPDATE_FAILED', message: 'Nao foi possivel atualizar o acesso.' },
          400,
        );
      return json(request, { ok: true });
    }

    if (action === 'reset-password') {
      if (!(await hasCapability(request, 'access.reset_password'))) {
        return json(request, { code: 'FORBIDDEN' }, 403);
      }
      const userId = body?.userId;
      const temporaryPassword = body?.temporaryPassword;
      if (!isUuid(userId) || !isStrongPassword(temporaryPassword)) {
        return json(
          request,
          { code: 'INVALID_INPUT', message: 'Dados de redefinicao invalidos.' },
          400,
        );
      }
      const { data: target, error: targetError } = await service
        .from('usuarios')
        .select('auth_user_id')
        .eq('id', userId)
        .single();
      if (targetError || !target) return json(request, { code: 'RESET_FAILED' }, 404);

      const { error: authError } = await service.auth.admin.updateUserById(target.auth_user_id, {
        password: temporaryPassword,
      });
      if (authError)
        return json(
          request,
          { code: 'RESET_FAILED', message: 'Nao foi possivel redefinir a senha.' },
          400,
        );

      const { error: recordError } = await service.rpc('admin_mark_password_reset', {
        p_actor_auth_user_id: actor.id,
        p_user_id: userId,
      });
      if (recordError)
        return json(
          request,
          {
            code: 'RESET_INCOMPLETE',
            message: 'Senha alterada; atualizacao administrativa pendente.',
          },
          500,
        );
      return json(request, { ok: true });
    }

    return json(request, { code: 'INVALID_ACTION' }, 400);
  } catch {
    return json(
      request,
      { code: 'ADMIN_UNAVAILABLE', message: 'Operacao administrativa indisponivel.' },
      503,
    );
  }
});
