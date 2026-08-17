begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '11800000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin-offsets@auth.implanta27.invalid',
  extensions.crypt('Synthetic-Offsets-27', extensions.gen_salt('bf')),
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
  '21800000-0000-4000-8000-000000000001',
  'USR-9981',
  '11800000-0000-4000-8000-000000000001',
  (select id from public.perfis where chave = 'administrator'),
  'Admin Offsets',
  '0081',
  'active',
  false,
  true
);

insert into public.checklist_master_versions (id, name, notes)
values (
  '31800000-0000-4000-8000-000000000001',
  'Checklist Offsets de Inauguracao',
  'Fixture transacional pgTAP'
);

select is(
  (
    select conname
    from pg_constraint
    where conrelid = 'public.checklist_master_items'::regclass
      and conname = 'checklist_master_items_relative_due_days_check'
  ),
  'checklist_master_items_relative_due_days_check',
  'Constraint de offset da inauguracao existe com o nome esperado'
);

select lives_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset -30', 'Datas', 1, -30)$$,
  'Offset -30 e aceito'
);
select lives_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset 0', 'Datas', 2, 0)$$,
  'Offset zero e aceito'
);
select lives_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset positivo', 'Datas', 3, 30)$$,
  'Offset positivo e aceito'
);
select lives_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset nulo', 'Datas', 4, null)$$,
  'Offset nulo continua aceito'
);
select throws_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset abaixo do limite', 'Datas', 5, -3651)$$,
  '23514',
  null,
  'Offset menor que -3650 e rejeitado'
);
select throws_ok(
  $$insert into public.checklist_master_items (version_id, title, category, position, relative_due_days)
    values ('31800000-0000-4000-8000-000000000001', 'Offset acima do limite', 'Datas', 6, 3651)$$,
  '23514',
  null,
  'Offset maior que 3650 e rejeitado'
);

insert into public.checklist_master_items (
  version_id, title, category, position, relative_due_days
) values
  ('31800000-0000-4000-8000-000000000001', 'Offset -25', 'Datas', 5, -25),
  ('31800000-0000-4000-8000-000000000001', 'Offset -20', 'Datas', 6, -20),
  ('31800000-0000-4000-8000-000000000001', 'Offset -5', 'Datas', 7, -5);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11800000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.publish_checklist_version('31800000-0000-4000-8000-000000000001')$$,
  'Checklist de offsets pode ser publicado no teste transacional'
);
select lives_ok(
  $$select set_config(
    'test.offset_implementation_id',
    public.start_store_implementation(
      (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      '31800000-0000-4000-8000-000000000001',
      '2026-09-25',
      null
    )::text,
    true
  )$$,
  'Implantacao calcula datas a partir da inauguracao prevista'
);

select is(
  (select due_date::text from public.store_implementation_items where implementation_id = current_setting('test.offset_implementation_id')::uuid and title_snapshot = 'Offset -30'),
  '2026-08-26',
  'Offset -30 resulta em 26/08/2026'
);
select is(
  (select due_date::text from public.store_implementation_items where implementation_id = current_setting('test.offset_implementation_id')::uuid and title_snapshot = 'Offset -25'),
  '2026-08-31',
  'Offset -25 resulta em 31/08/2026'
);
select is(
  (select due_date::text from public.store_implementation_items where implementation_id = current_setting('test.offset_implementation_id')::uuid and title_snapshot = 'Offset -20'),
  '2026-09-05',
  'Offset -20 resulta em 05/09/2026'
);
select is(
  (select due_date::text from public.store_implementation_items where implementation_id = current_setting('test.offset_implementation_id')::uuid and title_snapshot = 'Offset -5'),
  '2026-09-20',
  'Offset -5 resulta em 20/09/2026'
);
select is(
  (select due_date::text from public.store_implementation_items where implementation_id = current_setting('test.offset_implementation_id')::uuid and title_snapshot = 'Offset 0'),
  '2026-09-25',
  'Offset zero resulta em 25/09/2026'
);

select * from finish();
rollback;
