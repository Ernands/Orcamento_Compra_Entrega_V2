begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'usuarios', 'Tabela de usuarios existe');
select has_table('public', 'perfis', 'Tabela de perfis existe');
select has_table('public', 'permissoes', 'Tabela de permissoes existe');
select has_table('public', 'perfil_permissoes', 'Relacao perfil-permissao existe');
select has_table('public', 'usuario_permissoes', 'Ajustes individuais existem');
select has_table('public', 'lojas', 'Tabela de lojas existe');
select has_table('public', 'usuario_lojas', 'Relacao usuario-loja existe');
select has_table('public', 'audit_logs', 'Auditoria existe');
select has_table('public', 'checklist_master_versions', 'Versoes do checklist existem');
select has_table('public', 'checklist_master_items', 'Itens do checklist existem');
select has_table('public', 'store_implementations', 'Implantacoes por loja existem');
select has_table('public', 'store_implementation_items', 'Snapshots por loja existem');
select has_table('public', 'store_needs', 'Necessidades por loja existem');
select has_table('public', 'store_attachments', 'Metadados de anexos existem');

select col_is_pk('public', 'usuarios', 'id', 'Usuario usa UUID como PK');
select col_type_is('public', 'usuarios', 'id', 'uuid', 'PK de usuario e UUID');
select col_type_is('public', 'usuarios', 'auth_user_id', 'uuid', 'Identidade Auth e UUID');
select col_is_fk('public', 'usuarios', 'auth_user_id', 'Usuario referencia auth.users');
select col_is_fk('public', 'usuarios', 'perfil_id', 'Usuario referencia perfil');
select col_is_fk('public', 'usuario_lojas', 'usuario_id', 'Escopo referencia usuario');
select col_is_fk('public', 'usuario_lojas', 'loja_id', 'Escopo referencia loja');
select col_is_fk('public', 'usuario_permissoes', 'permissao_id', 'Ajuste referencia permissao');
select col_is_fk('public', 'checklist_master_items', 'version_id', 'Item referencia versao');
select col_is_fk('public', 'store_implementations', 'store_id', 'Implantacao referencia loja');
select col_is_fk('public', 'store_implementation_items', 'implementation_id', 'Snapshot referencia implantacao');
select col_is_fk('public', 'store_needs', 'source_implementation_item_id', 'Necessidade aceita origem da implantacao');

select is((select count(*) from public.perfis), 3::bigint, 'Tres perfis iniciais foram criados');
select is((select count(*) from public.permissoes), 26::bigint, 'Vinte e seis capacidades foram criadas');
select is((select count(*) from public.perfil_permissoes pp join public.perfis p on p.id = pp.perfil_id where p.chave = 'consultation'), 7::bigint, 'Consulta recebe somente capacidades de leitura');
select is((select count(*) from public.perfil_permissoes pp join public.perfis p on p.id = pp.perfil_id where p.chave = 'administrator'), 26::bigint, 'Administrador recebe todas as capacidades');

select throws_ok(
  $$insert into public.lojas (codigo_negocio, nome, cidade, uf) values ('LOJ-980', 'UF invalida', 'Teste', 'XX1')$$,
  '23514',
  null,
  'UF invalida e rejeitada'
);
select throws_ok(
  $$insert into public.lojas (codigo_negocio, nome, cidade, uf) values ('INVALIDA', 'Codigo invalido', 'Teste', 'SP')$$,
  '23514',
  null,
  'Codigo de loja invalido e rejeitado'
);
select throws_ok(
  $$insert into public.usuario_lojas (usuario_id, loja_id) values (gen_random_uuid(), gen_random_uuid())$$,
  '23503',
  null,
  'Relacionamento sem FK e rejeitado'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios' and column_name ilike '%password%'
      and column_name <> 'must_change_password' and column_name <> 'password_changed_at'
  ),
  'Tabela de negocio nao armazena senha'
);

select * from finish();
rollback;
