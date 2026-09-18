import type {
  AccessFormValues,
  AccessPermission,
  AccessPermissionOverride,
  AccessUser,
  PermissionOverrideEffect,
  Profile,
  Store,
} from '../../domain/types';
import { invokeEdgeFunction } from '../../lib/edge-function';
import { supabase } from '../supabase/client';

export interface AccessAdminData {
  users: AccessUser[];
  profiles: Profile[];
  stores: Pick<Store, 'id' | 'code' | 'name'>[];
  permissions: AccessPermission[];
  profilePermissions: Array<{ profileId: string; permissionId: string }>;
  userPermissionOverrides: Array<{
    userId: string;
    permissionId: string;
    effect: PermissionOverrideEffect;
  }>;
}

export async function loadAccessAdminData(): Promise<AccessAdminData> {
  const [
    usersResult,
    profilesResult,
    storesResult,
    linksResult,
    permissionsResult,
    modulesResult,
    actionsResult,
    profilePermissionsResult,
    userPermissionsResult,
  ] = await Promise.all([
    supabase
      .from('usuarios')
      .select(
        'id, codigo_negocio, nome, cpf_last4, status, must_change_password, all_stores, perfil_id, last_login_at',
      )
      .order('nome'),
    supabase.from('perfis').select('id, chave, nome').eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, codigo_negocio, nome').order('nome'),
    supabase.from('usuario_lojas').select('usuario_id, loja_id'),
    supabase.from('permissoes').select('id, modulo_id, acao_id, chave, descricao').eq('ativo', true),
    supabase.from('modulos').select('id, chave, nome').eq('ativo', true).order('nome'),
    supabase.from('acoes').select('id, chave, nome').order('nome'),
    supabase.from('perfil_permissoes').select('perfil_id, permissao_id'),
    supabase
      .from('usuario_permissoes')
      .select('usuario_id, permissao_id, efeito')
      .is('loja_id', null)
      .is('expires_at', null),
  ]);

  const error =
    usersResult.error ||
    profilesResult.error ||
    storesResult.error ||
    linksResult.error ||
    permissionsResult.error ||
    modulesResult.error ||
    actionsResult.error ||
    profilePermissionsResult.error ||
    userPermissionsResult.error;
  if (error) {
    throw error;
  }

  const profiles = profilesResult.data.map((profile) => ({
    id: profile.id,
    key: profile.chave,
    name: profile.nome,
  }));
  const stores = storesResult.data.map((store) => ({
    id: store.id,
    code: store.codigo_negocio,
    name: store.nome,
  }));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const storesByUser = new Map<string, Pick<Store, 'id' | 'code' | 'name'>[]>();

  for (const link of linksResult.data) {
    const store = storeById.get(link.loja_id);
    if (!store) continue;
    const current = storesByUser.get(link.usuario_id) || [];
    current.push(store);
    storesByUser.set(link.usuario_id, current);
  }

  const users = usersResult.data.map((user): AccessUser => {
    const profile = profileById.get(user.perfil_id);
    if (!profile) {
      throw new Error(`Perfil ausente para o usuario ${user.codigo_negocio}.`);
    }

    return {
      id: user.id,
      code: user.codigo_negocio,
      name: user.nome,
      cpfLast4: user.cpf_last4,
      status: user.status,
      mustChangePassword: user.must_change_password,
      allStores: user.all_stores,
      profile,
      stores: storesByUser.get(user.id) || [],
      lastLoginAt: user.last_login_at,
    };
  });

  const moduleById = new Map(modulesResult.data.map((module) => [module.id, module]));
  const actionById = new Map(actionsResult.data.map((action) => [action.id, action]));
  const permissions = permissionsResult.data
    .map((permission): AccessPermission | null => {
      const module = moduleById.get(permission.modulo_id);
      const action = actionById.get(permission.acao_id);
      if (!module || !action) return null;
      return {
        id: permission.id,
        key: permission.chave as AccessPermission['key'],
        description: permission.descricao,
        moduleKey: module.chave,
        moduleName: module.nome,
        actionKey: action.chave,
        actionName: action.nome,
      };
    })
    .filter((permission): permission is AccessPermission => permission !== null)
    .sort(
      (a, b) =>
        a.moduleName.localeCompare(b.moduleName, 'pt-BR') ||
        a.actionName.localeCompare(b.actionName, 'pt-BR') ||
        a.description.localeCompare(b.description, 'pt-BR'),
    );

  return {
    users,
    profiles,
    stores,
    permissions,
    profilePermissions: profilePermissionsResult.data.map((row) => ({
      profileId: row.perfil_id,
      permissionId: row.permissao_id,
    })),
    userPermissionOverrides: userPermissionsResult.data.map((row) => ({
      userId: row.usuario_id,
      permissionId: row.permissao_id,
      effect: row.efeito as PermissionOverrideEffect,
    })),
  };
}

export async function createAccessUser(values: AccessFormValues): Promise<void> {
  await invokeEdgeFunction<{ id: string }>('admin-users', {
    action: 'create',
    name: values.name,
    cpf: values.cpf,
    profileId: values.profileId,
    storeIds: values.storeIds,
    allStores: values.allStores,
    status: values.status,
    initialPassword: values.initialPassword,
  });
}

export async function updateAccessUser(userId: string, values: AccessFormValues): Promise<void> {
  await invokeEdgeFunction<{ ok: true }>('admin-users', {
    action: 'update',
    userId,
    name: values.name,
    profileId: values.profileId,
    storeIds: values.storeIds,
    allStores: values.allStores,
    status: values.status,
  });
}

export async function resetAccessUserPassword(
  userId: string,
  temporaryPassword: string,
): Promise<void> {
  await invokeEdgeFunction<{ ok: true }>('admin-users', {
    action: 'reset-password',
    userId,
    temporaryPassword,
  });
}


export async function saveAccessUserPermissions(
  userId: string,
  overrides: AccessPermissionOverride[],
): Promise<void> {
  await invokeEdgeFunction<{ ok: true }>('admin-users', {
    action: 'permissions',
    userId,
    overrides,
  });
}
