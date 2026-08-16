import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isValidCpf, normalizeCpf } from '../supabase/functions/_shared/cpf.ts';
import type { Database } from '../src/data/supabase/database.types.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

const url = required('SUPABASE_URL');
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() || required('SUPABASE_SERVICE_ROLE_KEY');
const lookupSecret = required('CPF_LOOKUP_SECRET');
const name = required('BOOTSTRAP_ADMIN_NAME');
const cpf = normalizeCpf(required('BOOTSTRAP_ADMIN_CPF'));
const password = required('BOOTSTRAP_ADMIN_PASSWORD');

if (!isValidCpf(cpf)) throw new Error('BOOTSTRAP_ADMIN_CPF invalido.');
if (password.length < 10 || password.length > 128) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD deve conter entre 10 e 128 caracteres.');
}
if (lookupSecret.length < 32)
  throw new Error('CPF_LOOKUP_SECRET deve ter pelo menos 32 caracteres.');

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: profile, error: profileError } = await supabase
  .from('perfis')
  .select('id')
  .eq('chave', 'administrator')
  .single();

if (profileError || !profile)
  throw new Error('Perfil Administrador nao encontrado. Aplique as migrations.');

const technicalEmail = `v2-${randomUUID()}@auth.implanta27.invalid`;
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: technicalEmail,
  password,
  email_confirm: true,
});

if (authError || !authData.user)
  throw new Error('Nao foi possivel criar a identidade Auth inicial.');

const cpfLookup = createHmac('sha256', lookupSecret).update(`cpf:${cpf}`).digest('hex');
const { data: userId, error: recordError } = await supabase.rpc('admin_create_user_record', {
  p_actor_auth_user_id: null,
  p_auth_user_id: authData.user.id,
  p_technical_email: technicalEmail,
  p_cpf_lookup: cpfLookup,
  p_cpf_last4: cpf.slice(-4),
  p_name: name,
  p_profile_id: profile.id,
  p_store_ids: [],
  p_all_stores: true,
  p_status: 'active',
  p_origin: 'bootstrap',
});

if (recordError) {
  await supabase.auth.admin.deleteUser(authData.user.id);
  throw new Error('Bootstrap recusado. Ele so pode ser executado antes do primeiro usuario.');
}

process.stdout.write(`Primeiro Administrador criado com sucesso. ID interno: ${String(userId)}\n`);
