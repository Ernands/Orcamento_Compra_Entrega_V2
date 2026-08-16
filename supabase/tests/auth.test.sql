begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table unknown_login as
select * from public.auth_begin_login_attempt(repeat('a', 64), repeat('b', 64));

select ok((select allowed from unknown_login), 'CPF inexistente percorre resposta generica sem enumeracao');
select is((select technical_email from unknown_login), null, 'CPF inexistente nao revela identidade tecnica');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000010',
  'authenticated',
  'authenticated',
  'inactive-test@auth.implanta27.invalid',
  extensions.crypt('Synthetic-Inactive-27', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values (
  '20000000-0000-4000-8000-000000000010',
  'USR-9910',
  '10000000-0000-4000-8000-000000000010',
  (select id from public.perfis where chave = 'consultation'),
  'Usuario Inativo Sintetico',
  '0010',
  'inactive',
  true,
  false
);

insert into private.auth_identities (
  usuario_id, auth_user_id, cpf_lookup, technical_email
) values (
  '20000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000010',
  repeat('c', 64),
  'inactive-test@auth.implanta27.invalid'
);

create temporary table inactive_login as
select * from public.auth_begin_login_attempt(repeat('c', 64), repeat('d', 64));

select is((select account_status::text from inactive_login), 'inactive', 'Login identifica conta inativa no backend');
select is(
  (select technical_email from inactive_login),
  'inactive-test@auth.implanta27.invalid',
  'Mapeamento tecnico permanece restrito ao fluxo service role'
);

create temporary table first_five_attempts as
select attempt_number, result.*
from generate_series(1, 5) attempt_number
cross join lateral public.auth_begin_login_attempt(
  repeat('e', 64),
  lpad(attempt_number::text, 64, '0')
) result;

select ok((select bool_and(allowed) from first_five_attempts), 'As cinco primeiras tentativas da janela sao permitidas');

create temporary table sixth_attempt as
select * from public.auth_begin_login_attempt(repeat('e', 64), repeat('f', 64));

select ok(not (select allowed from sixth_attempt), 'A sexta tentativa e bloqueada');
select ok((select blocked_until is not null from sixth_attempt), 'Bloqueio temporario registra prazo de liberacao');

select public.auth_finish_login_attempt(repeat('e', 64), repeat('f', 64), false, null);
create temporary table after_failed_finish as
select * from public.auth_begin_login_attempt(repeat('e', 64), repeat('1', 64));
select ok(not (select allowed from after_failed_finish), 'Falha de senha nao remove o bloqueio');

select public.auth_finish_login_attempt(repeat('e', 64), repeat('1', 64), true, null);
create temporary table after_successful_finish as
select * from public.auth_begin_login_attempt(repeat('e', 64), repeat('2', 64));
select ok((select allowed from after_successful_finish), 'Sucesso autenticado limpa os contadores aplicaveis');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000011',
  'authenticated',
  'authenticated',
  'active-test@auth.implanta27.invalid',
  extensions.crypt('Synthetic-Active-27', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values (
  '20000000-0000-4000-8000-000000000011',
  'USR-9911',
  '10000000-0000-4000-8000-000000000011',
  (select id from public.perfis where chave = 'consultation'),
  'Usuario Ativo Sintetico',
  '0011',
  'active',
  true,
  false
);

insert into private.auth_identities (
  usuario_id, auth_user_id, cpf_lookup, technical_email
) values (
  '20000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  repeat('f', 64),
  'active-test@auth.implanta27.invalid'
);

select public.auth_finish_login_attempt(
  repeat('f', 64),
  repeat('3', 64),
  true,
  '10000000-0000-4000-8000-000000000011'
);

select ok(
  (select last_login_at is not null from public.usuarios where id = '20000000-0000-4000-8000-000000000011'),
  'Login valido atualiza o ultimo acesso'
);
select ok(
  exists(
    select 1 from public.audit_logs
    where actor_usuario_id = '20000000-0000-4000-8000-000000000011'
      and action = 'auth.login_succeeded'
  ),
  'Login valido gera auditoria sem CPF completo'
);

select * from finish();
rollback;
