begin;

create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-package@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'prospector-package@auth.implanta27.invalid', extensions.crypt('Synthetic-Prospector-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'consultation-package@auth.implanta27.invalid', extensions.crypt('Synthetic-Consultation-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'unassigned-package@auth.implanta27.invalid', extensions.crypt('Synthetic-Unassigned-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('21000000-0000-4000-8000-000000000001', 'USR-9911', '11000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Pacote', '0011', 'active', false, true),
  ('21000000-0000-4000-8000-000000000002', 'USR-9912', '11000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'prospector'), 'Prospector Pacote', '0012', 'active', false, false),
  ('21000000-0000-4000-8000-000000000003', 'USR-9913', '11000000-0000-4000-8000-000000000003', (select id from public.perfis where chave = 'consultation'), 'Consulta Pacote', '0013', 'active', false, false),
  ('21000000-0000-4000-8000-000000000004', 'USR-9914', '11000000-0000-4000-8000-000000000004', (select id from public.perfis where chave = 'consultation'), 'Consulta Sem Loja', '0014', 'active', false, false);

insert into public.usuario_lojas (usuario_id, loja_id) values
  ('21000000-0000-4000-8000-000000000002', (select id from public.lojas where codigo_negocio = 'LOJ-901')),
  ('21000000-0000-4000-8000-000000000003', (select id from public.lojas where codigo_negocio = 'LOJ-901'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.create_checklist_version('Checklist Teste v1', 'Snapshot sintetico')$$,
  'Admin cria versao draft'
);
select lives_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ((select id from public.checklist_master_versions where name = 'Checklist Teste v1'), 'Validar projeto original', 'Projeto', 10, 5)$$,
  'Admin adiciona item ao draft'
);
select lives_ok(
  $$select public.publish_checklist_version((select id from public.checklist_master_versions where name = 'Checklist Teste v1'))$$,
  'Admin publica versao'
);
select is(
  (select status::text from public.checklist_master_versions where name = 'Checklist Teste v1'),
  'published',
  'Versao publicada fica disponivel'
);
select lives_ok(
  $$select public.start_store_implementation(
    (select id from public.lojas where codigo_negocio = 'LOJ-901'),
    (select id from public.checklist_master_versions where name = 'Checklist Teste v1'),
    current_date,
    null
  )$$,
  'Admin inicia implantacao com versao publicada'
);
select is(
  (select count(*) from public.store_implementation_items item
   join public.store_implementations implementation on implementation.id = item.implementation_id
   join public.lojas store on store.id = implementation.store_id
   where store.codigo_negocio = 'LOJ-901'),
  1::bigint,
  'Implantacao recebe snapshot dos itens ativos'
);
update public.checklist_master_items set title = 'Alteracao proibida'
where version_id = (select id from public.checklist_master_versions where name = 'Checklist Teste v1');
select is(
  (select title from public.checklist_master_items
   where version_id = (select id from public.checklist_master_versions where name = 'Checklist Teste v1')),
  'Validar projeto original',
  'RLS preserva item publicado imutavel'
);
select lives_ok(
  $$select public.create_checklist_version(
    'Checklist Teste v2',
    'Nova versao',
    (select id from public.checklist_master_versions where name = 'Checklist Teste v1')
  )$$,
  'Admin clona versao para novo draft'
);
select lives_ok(
  $$update public.checklist_master_items set title = 'Validar projeto revisado'
    where version_id = (select id from public.checklist_master_versions where name = 'Checklist Teste v2')$$,
  'Novo draft pode ser alterado'
);
select is(
  (select item.title_snapshot from public.store_implementation_items item
   join public.store_implementations implementation on implementation.id = item.implementation_id
   join public.lojas store on store.id = implementation.store_id
   where store.codigo_negocio = 'LOJ-901'),
  'Validar projeto original',
  'Nova versao nao altera snapshot existente'
);
select lives_ok(
  $$select public.publish_checklist_version((select id from public.checklist_master_versions where name = 'Checklist Teste v2'))$$,
  'Admin publica segunda versao'
);
select is(
  (select status::text from public.checklist_master_versions where name = 'Checklist Teste v1'),
  'archived',
  'Publicacao arquiva a versao publicada anterior'
);
select lives_ok(
  $$select public.start_store_implementation(
    (select id from public.lojas where codigo_negocio = 'LOJ-902'),
    (select id from public.checklist_master_versions where name = 'Checklist Teste v2'),
    current_date,
    null
  )$$,
  'Admin inicia outra loja com a nova versao'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.store_implementations), 1::bigint, 'Prospector ve somente implantacao atribuida');
select is((select count(*) from public.store_implementation_items), 1::bigint, 'Prospector ve somente snapshot atribuido');
select is(
  (select count(*) from public.checklist_master_versions where name = 'Checklist Teste v1'),
  1::bigint,
  'Prospector le versao arquivada vinculada a sua loja'
);
select is(
  (select version.name
   from public.store_implementations implementation
   join public.checklist_master_versions version on version.id = implementation.checklist_version_id
   limit 1),
  'Checklist Teste v1',
  'Prospector carrega implantacao com a versao historica'
);
select lives_ok(
  $$select public.update_store_implementation_item(
    (select item.id from public.store_implementation_items item limit 1),
    'blocked', null, current_date, 'Bloqueio sintetico'
  )$$,
  'Prospector atualiza atividade da loja atribuida'
);
select throws_ok(
  $$insert into public.store_needs (store_id, title, category, quantity)
    values ((select id from public.lojas where codigo_negocio = 'LOJ-902'), 'Necessidade indevida', 'Obra', 1)$$,
  '42501',
  null,
  'Prospector nao cria necessidade fora do escopo'
);
select lives_ok(
  $$insert into public.store_needs (store_id, title, category, quantity)
    values ((select id from public.lojas where codigo_negocio = 'LOJ-901'), 'Balcao', 'Mobiliario', 1)$$,
  'Prospector cria necessidade na loja atribuida'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.store_needs), 1::bigint, 'Consulta le necessidades da loja atribuida');
select is(
  (select count(*) from public.checklist_master_versions where name = 'Checklist Teste v1'),
  1::bigint,
  'Consulta le versao arquivada vinculada a sua loja'
);
select is(
  (select version.name
   from public.store_implementations implementation
   join public.checklist_master_versions version on version.id = implementation.checklist_version_id
   limit 1),
  'Checklist Teste v1',
  'Consulta carrega implantacao com a versao historica'
);
select throws_ok(
  $$insert into public.store_needs (store_id, title, category, quantity)
    values ((select id from public.lojas where codigo_negocio = 'LOJ-901'), 'Escrita negada', 'Teste', 1)$$,
  '42501',
  null,
  'Consulta nao cria necessidade'
);
select throws_ok(
  $$select public.update_store_implementation_item(
    (select item.id from public.store_implementation_items item limit 1),
    'completed', null, current_date, null
  )$$,
  'P0001',
  'permission denied',
  'Consulta nao atualiza implantacao'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(
  (select count(*) from public.checklist_master_versions where name = 'Checklist Teste v1'),
  0::bigint,
  'Usuario sem acesso a loja nao le versao arquivada'
);
select is((select count(*) from public.store_implementations), 0::bigint, 'Usuario sem loja nao le implantacao historica');
select is(
  (select count(*) from public.checklist_master_versions where name = 'Checklist Teste v2'),
  1::bigint,
  'Usuario com implementation.view ainda le a versao publicada'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.register_store_attachment(
    (select id from public.lojas where codigo_negocio = 'LOJ-901'),
    'projeto.pdf',
    'lojas/' || (select id::text from public.lojas where codigo_negocio = 'LOJ-901') || '/loja/31000000-0000-4000-8000-000000000001/projeto.pdf',
    'project', 'Projeto sintetico', 'application/pdf', 1024
  )$$,
  'Admin registra metadados de anexo'
);
select set_config(
  'test.authorized_attachment_path',
  (select storage_path from public.store_attachments where original_name = 'projeto.pdf'),
  true
);
select lives_ok(
  $$select public.register_store_attachment(
    (select id from public.lojas where codigo_negocio = 'LOJ-902'),
    'restrito.pdf',
    'lojas/' || (select id::text from public.lojas where codigo_negocio = 'LOJ-902') || '/loja/31000000-0000-4000-8000-000000000002/restrito.pdf',
    'project', 'Projeto restrito', 'application/pdf', 2048
  )$$,
  'Admin registra anexo de loja nao atribuida'
);
select set_config(
  'test.unauthorized_attachment_path',
  (select storage_path from public.store_attachments where original_name = 'restrito.pdf'),
  true
);
select is((select count(*) from public.store_attachments), 2::bigint, 'Anexos ficam vinculados as lojas');
select ok(exists(select 1 from public.audit_logs where action = 'implementation.started'), 'Inicio da implantacao foi auditado');
select ok(exists(select 1 from public.audit_logs where action = 'attachment.uploaded'), 'Upload do anexo foi auditado');

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.store_attachments), 1::bigint, 'Consulta le anexo da loja atribuida');
select ok(
  app.can_read_store_attachment_object(current_setting('test.authorized_attachment_path')),
  'Metadata ativa autoriza leitura do objeto da loja atribuida'
);
select ok(
  not app.can_read_store_attachment_object(current_setting('test.unauthorized_attachment_path')),
  'Metadata ativa nao autoriza objeto de loja nao atribuida'
);
select throws_ok(
  $$select public.register_store_attachment(
    (select id from public.lojas where codigo_negocio = 'LOJ-901'),
    'indevido.pdf',
    'lojas/' || (select id::text from public.lojas where codigo_negocio = 'LOJ-901') || '/loja/31000000-0000-4000-8000-000000000002/indevido.pdf',
    'document', null, 'application/pdf', 512
  )$$,
  'P0001',
  'permission denied',
  'Consulta nao registra anexo'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.delete_store_attachment(
    (select id from public.store_attachments where original_name = 'projeto.pdf')
  )$$,
  'Admin marca metadata do anexo como removida'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select ok(
  not app.can_read_store_attachment_object(current_setting('test.authorized_attachment_path')),
  'Metadata removida bloqueia a leitura do objeto remanescente'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select app.can_read_store_attachment_object(current_setting('test.authorized_attachment_path'))$$,
  '42501',
  null,
  'Anonimo nao executa a autorizacao de leitura do Storage'
);
select throws_ok($$select * from public.store_needs$$, '42501', null, 'Anonimo nao le necessidades');
select throws_ok($$select * from public.store_implementations$$, '42501', null, 'Anonimo nao le implantacoes');
select throws_ok($$select * from public.store_attachments$$, '42501', null, 'Anonimo nao le metadados de anexos');

select * from finish();
rollback;
