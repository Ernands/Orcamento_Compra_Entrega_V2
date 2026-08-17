begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column('public', 'supply_items', 'group_name', 'Catalogo possui grupo');
select has_column('public', 'supply_items', 'area_name', 'Catalogo possui area');
select has_column('public', 'supply_items', 'default_quantity', 'Catalogo possui quantidade padrao');
select has_column('public', 'supply_items', 'product_link', 'Catalogo possui link do produto');
select col_type_is(
  'public', 'supply_items', 'default_quantity', 'numeric(14,3)',
  'Quantidade padrao preserva precisao operacional'
);
select is(
  (
    select count(*)
    from public.perfil_permissoes profile_permission
    join public.permissoes permission on permission.id = profile_permission.permissao_id
    join public.perfis profile on profile.id = profile_permission.perfil_id
    where permission.chave = 'dashboard.view'
      and profile.chave in ('administrator', 'prospector', 'consultation')
  ),
  3::bigint,
  'Dashboard esta disponivel para os tres perfis previstos'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('19000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-items-dashboard@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('19000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'consultation-items-dashboard@auth.implanta27.invalid', extensions.crypt('Synthetic-Consultation-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('29000000-0000-4000-8000-000000000001', 'USR-9971', '19000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Catalogo', '0071', 'active', false, true),
  ('29000000-0000-4000-8000-000000000002', 'USR-9972', '19000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'consultation'), 'Consulta Catalogo', '0072', 'active', false, false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"19000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(app.can('dashboard', 'view'), 'Administrador possui acesso ao dashboard');
select lives_ok(
  $$insert into public.supply_items (
      name, description, category, subcategory, group_name, area_name,
      item_type, default_unit, default_quantity, brand_reference,
      technical_specification, product_link
    ) values (
      'Balcao padrao V2', 'Balcao reutilizavel', 'Mobiliario', 'Balcoes',
      'Atendimento', 'Loja', 'product', 'un', 2.500, 'Modelo V2',
      'Acabamento resistente', 'https://example.invalid/balcao'
    )$$,
  'Administrador cria item com todos os novos campos'
);
select is((select group_name from public.supply_items where name = 'Balcao padrao V2'), 'Atendimento', 'Grupo e persistido');
select is((select area_name from public.supply_items where name = 'Balcao padrao V2'), 'Loja', 'Area e persistida');
select is((select default_quantity from public.supply_items where name = 'Balcao padrao V2'), 2.500::numeric, 'Quantidade padrao e persistida');
select is((select product_link from public.supply_items where name = 'Balcao padrao V2'), 'https://example.invalid/balcao', 'Link e persistido');
select throws_ok(
  $$insert into public.supply_items (name, category, item_type, default_unit, default_quantity)
    values ('Quantidade invalida', 'Teste', 'product', 'un', 0)$$,
  '23514',
  'new row for relation "supply_items" violates check constraint "supply_items_default_quantity_check"',
  'Quantidade padrao zero e rejeitada'
);
select throws_ok(
  $$insert into public.supply_items (name, category, item_type, default_unit, product_link)
    values ('Link invalido', 'Teste', 'product', 'un', 'javascript:alert(1)')$$,
  '23514',
  'new row for relation "supply_items" violates check constraint "supply_items_product_link_check"',
  'Link fora de HTTP ou HTTPS e rejeitado'
);
select throws_ok(
  $$update public.supply_items
    set codigo_negocio = 'ITM-9999'
    where name = 'Balcao padrao V2'$$,
  'P0001',
  'supply item identity is immutable',
  'Codigo interno nao pode ser alterado'
);
select lives_ok(
  $$update public.supply_items set active = false where name = 'Balcao padrao V2'$$,
  'Item pode ser desativado sem exclusao fisica'
);
select is(
  (select count(*) from public.supply_items where name = 'Balcao padrao V2' and not active),
  1::bigint,
  'Item desativado permanece no historico'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"19000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select ok(app.can('dashboard', 'view'), 'Consulta possui acesso ao dashboard');
select is(
  (select count(*) from public.supply_items where name = 'Balcao padrao V2'),
  1::bigint,
  'Consulta visualiza item ativo ou inativo do catalogo'
);
update public.supply_items set name = 'Alteracao indevida' where name = 'Balcao padrao V2';
select is(
  (select name from public.supply_items where codigo_negocio like 'ITM-%' order by created_at desc limit 1),
  'Balcao padrao V2',
  'Consulta nao altera o catalogo'
);

set local role postgres;
set local role anon;
select throws_ok(
  $$select count(*) from public.supply_items$$,
  '42501',
  'permission denied for table supply_items',
  'Anonimo nao acessa o catalogo'
);

select * from finish();
rollback;
