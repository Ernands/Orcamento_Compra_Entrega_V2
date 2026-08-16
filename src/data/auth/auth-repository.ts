import type { Session } from '@supabase/supabase-js';
import type { Capability, Viewer } from '../../domain/types';
import { invokeEdgeFunction } from '../../lib/edge-function';
import { supabase } from '../supabase/client';

interface CpfLoginResponse {
  session: {
    access_token: string;
    refresh_token: string;
  };
}

export async function loginWithCpf(cpf: string, password: string): Promise<Session> {
  const result = await invokeEdgeFunction<CpfLoginResponse>('cpf-login', { cpf, password });
  const { data, error } = await supabase.auth.setSession(result.session);

  if (error || !data.session) {
    throw new Error('A sessao recebida nao pode ser estabelecida. Tente novamente.');
  }

  return data.session;
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await invokeEdgeFunction<{ ok: true }>('change-password', {
    currentPassword,
    newPassword,
  });
}

export async function loadViewer(): Promise<Viewer> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw authError || new Error('Sessao invalida.');
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('usuarios')
    .select('id, auth_user_id, nome, status, must_change_password, all_stores, perfil_id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  const [{ data: role, error: roleError }, { data: capabilities, error: capabilityError }] =
    await Promise.all([
      supabase.from('perfis').select('id, chave, nome').eq('id', profileRow.perfil_id).single(),
      supabase.rpc('get_my_capabilities'),
    ]);

  if (roleError || capabilityError || !role) {
    throw roleError || capabilityError || new Error('Perfil de acesso nao encontrado.');
  }

  return {
    id: profileRow.id,
    authUserId: profileRow.auth_user_id,
    name: profileRow.nome,
    status: profileRow.status,
    mustChangePassword: profileRow.must_change_password,
    allStores: profileRow.all_stores,
    profile: {
      id: role.id,
      key: role.chave,
      name: role.nome,
    },
    capabilities: (capabilities || []) as Capability[],
  };
}
