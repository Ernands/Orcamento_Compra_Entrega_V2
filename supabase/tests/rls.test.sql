begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-test@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'prospector-test@auth.implanta27.invalid', extensions.crypt('Synthetic-Prospector-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'consultation-test@auth.implanta27.invalid', extensions.crypt('Synthetic-Consultation-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('20000000-0000-4000-8000-000000000001', 'USR-9901', '10000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Sintetico', '0001', 'active', false, true),
  ('20000000-0000-4000-8000-000000000002', 'USR-9902', '10000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'prospector'), 'Prospector Sintetico', '0002', 'active', false, false),
  ('20000000-0000-4000-8000-000000000003', 'USR-9903', '10000000-0000-4000-8000-000000000003', (select id from public.perfis where chave = 'consultation'), 'Consulta Sintetica', '0003', 'active', false, false);

insert into public.usuario_lojas (usuario_id, loja_id) values
  ('20000000-0000-4000-8000-000000000002', (select id from public.lojas where codigo_negocio = 'LOJ-901')),
  ('20000000-0000-4000-8000-000000000003', (select id from public.lojas where codigo_negocio = 'LOJ-902'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.lojas), 2::bigint, 'Administrador ve as duas lojas iniciais');
select is((select count(*) from public.usuarios), 3::bigint, 'Administrador ve todos os usuarios');
select is((select count(*) from public.permissoes), 9::bigint, 'Administrador ve permissoes da fundacao');
insert into public.lojas (codigo_negocio, nome, cidade, uf, status, created_by)
values ('LOJ-903', 'Loja RLS Admin', 'Recife', 'PE', 'planning', '20000000-0000-4000-8000-000000000001');
select ok(exists(select 1 from public.lojas where codigo_negocio = 'LOJ-903'), 'Administrador executa escrita autorizada');

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.lojas), 1::bigint, 'Prospector ve somente uma loja atribuida');
select ok(exists(select 1 from public.lojas where codigo_negocio = 'LOJ-901'), 'Prospector ve loja atribuida');
select ok(not exists(select 1 from public.lojas where codigo_negocio = 'LOJ-902'), 'Prospector nao ve loja nao atribuida');
select is((select count(*) from public.usuarios), 1::bigint, 'Prospector nao gerencia outros usuarios');
select is((select count(*) from public.permissoes), 0::bigint, 'Prospector nao le matriz administrativa');
select throws_ok(
  $$insert into public.lojas (codigo_negocio, nome, cidade, uf) values ('LOJ-904', 'Negada', 'Santos', 'SP')$$,
  '42501',
  null,
  'Prospector nao cria loja'
);
update public.lojas set status = 'inactive' where codigo_negocio = 'LOJ-902';

set local role postgres;
select is((select status::text from public.lojas where codigo_negocio = 'LOJ-902'), 'active', 'Prospector nao atualiza loja fora do escopo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.lojas), 1::bigint, 'Consulta ve somente uma loja atribuida');
select ok(exists(select 1 from public.lojas where codigo_negocio = 'LOJ-902'), 'Consulta ve loja atribuida');
select ok(not exists(select 1 from public.lojas where codigo_negocio = 'LOJ-901'), 'Consulta nao ve loja nao atribuida');
select is((select count(*) from public.usuarios), 1::bigint, 'Consulta nao le outros usuarios');
select throws_ok(
  $$insert into public.lojas (codigo_negocio, nome, cidade, uf) values ('LOJ-905', 'Negada', 'Santos', 'SP')$$,
  '42501',
  null,
  'Consulta nao insere loja'
);
update public.lojas set status = 'inactive' where codigo_negocio = 'LOJ-902';
delete from public.lojas where codigo_negocio = 'LOJ-902';

set local role postgres;
select is((select status::text from public.lojas where codigo_negocio = 'LOJ-902'), 'active', 'Consulta nao atualiza loja');
select ok(exists(select 1 from public.lojas where codigo_negocio = 'LOJ-902'), 'Consulta nao exclui loja');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.lojas$$, '42501', null, 'Anonimo nao le lojas');
select throws_ok($$select * from public.usuarios$$, '42501', null, 'Anonimo nao le usuarios');
select throws_ok($$select * from public.permissoes$$, '42501', null, 'Anonimo nao le permissoes');

set local role postgres;
insert into public.usuario_permissoes (usuario_id, permissao_id, efeito, motivo)
values (
  '20000000-0000-4000-8000-000000000002',
  (select id from public.permissoes where chave = 'stores.view'),
  'deny',
  'Teste sintetico de revogacao individual'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.lojas), 0::bigint, 'Deny individual supera permissao do perfil');

select * from finish();
rollback;
