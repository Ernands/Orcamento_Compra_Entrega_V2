import type { AccessFormValues, AccessUser, Profile, Store } from '../../domain/types';
import { invokeEdgeFunction } from '../../lib/edge-function';
import { supabase } from '../supabase/client';

export interface AccessAdminData {
  users: AccessUser[];
  profiles: Profile[];
  stores: Pick<Store, 'id' | 'code' | 'name'>[];
}

export async function loadAccessAdminData(): Promise<AccessAdminData> {
  const [usersResult, profilesResult, storesResult, linksResult] = await Promise.all([
    supabase
      .from('usuarios')
      .select(
        'id, codigo_negocio, nome, cpf_last4, status, must_change_password, all_stores, perfil_id, last_login_at',
      )
      .order('nome'),
    supabase.from('perfis').select('id, chave, nome').eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, codigo_negocio, nome').order('nome'),
    supabase.from('usuario_lojas').select('usuario_id, loja_id'),
  ]);

  const error =
    usersResult.error || profilesResult.error || storesResult.error || linksResult.error;
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

  return { users, profiles, stores };
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
