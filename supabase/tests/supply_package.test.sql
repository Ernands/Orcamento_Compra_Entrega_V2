begin;

create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-supply@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'prospector-supply@auth.implanta27.invalid', extensions.crypt('Synthetic-Prospector-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'consultation-supply@auth.implanta27.invalid', extensions.crypt('Synthetic-Consultation-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'outsider-supply@auth.implanta27.invalid', extensions.crypt('Synthetic-Outsider-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('22000000-0000-4000-8000-000000000001', 'USR-9921', '12000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Suprimentos', '0021', 'active', false, true),
  ('22000000-0000-4000-8000-000000000002', 'USR-9922', '12000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'prospector'), 'Prospector Suprimentos', '0022', 'active', false, false),
  ('22000000-0000-4000-8000-000000000003', 'USR-9923', '12000000-0000-4000-8000-000000000003', (select id from public.perfis where chave = 'consultation'), 'Consulta Suprimentos', '0023', 'active', false, false),
  ('22000000-0000-4000-8000-000000000004', 'USR-9924', '12000000-0000-4000-8000-000000000004', (select id from public.perfis where chave = 'consultation'), 'Consulta Loja Dois', '0024', 'active', false, false);

insert into public.usuario_lojas (usuario_id, loja_id) values
  ('22000000-0000-4000-8000-000000000002', (select id from public.lojas where codigo_negocio = 'LOJ-901')),
  ('22000000-0000-4000-8000-000000000003', (select id from public.lojas where codigo_negocio = 'LOJ-901')),
  ('22000000-0000-4000-8000-000000000004', (select id from public.lojas where codigo_negocio = 'LOJ-902'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(app.can('items', 'manage'), 'Administrador possui gestao do catalogo');
select ok(app.can('quotes', 'edit'), 'Administrador possui edicao de cotacoes');
select lives_ok(
  $$insert into public.supply_items (
      name, category, item_type, default_unit, description, technical_specification
    ) values (
      'Cadeira de atendimento', 'Mobiliario', 'product', 'un',
      'Cadeira para atendimento', 'Estrutura reforcada'
    )$$,
  'Administrador cria item do catalogo'
);
select matches(
  (select codigo_negocio from public.supply_items where name = 'Cadeira de atendimento'),
  '^ITM-[0-9]{4,}$',
  'Item recebe codigo humano automatico'
);
select lives_ok(
  $$select public.save_supplier(
    null, 'Fornecedor Sintetico', 'Fornecedor Sintetico Ltda', 'legal', '11222333000144',
    'Contato Teste', '11999990000', 'supply@example.invalid', 'https://example.invalid',
    'Campinas', 'SP', null, 'Fornecedor de teste', true,
    null, 'local_city', 'Unidade Campinas', 'Campinas', 'SP', false, true
  )$$,
  'Administrador cadastra fornecedor e canal atomicamente'
);
select matches(
  (select codigo_negocio from public.suppliers where trade_name = 'Fornecedor Sintetico'),
  '^FOR-[0-9]{4,}$',
  'Fornecedor recebe codigo humano automatico'
);
select lives_ok(
  $$insert into public.store_needs (store_id, title, category, quantity, unit, priority)
    values
      ((select id from public.lojas where codigo_negocio = 'LOJ-901'), 'Cadeiras Loja 1', 'Mobiliario', 3, 'un', 'high'),
      ((select id from public.lojas where codigo_negocio = 'LOJ-902'), 'Cadeiras Loja 2', 'Mobiliario', 4, 'un', 'normal')$$,
  'Necessidades continuam sendo registradas em store_needs'
);
select lives_ok(
  $$select public.link_store_need_item(
    (select id from public.store_needs where title = 'Cadeiras Loja 1'),
    (select id from public.supply_items where name = 'Cadeira de atendimento')
  )$$,
  'Necessidade pode ser vinculada ao item do catalogo'
);
select is(
  (select supply_item_id from public.store_needs where title = 'Cadeiras Loja 1'),
  (select id from public.supply_items where name = 'Cadeira de atendimento'),
  'Vinculo preserva a necessidade original'
);
select lives_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, current_date + 10, 'Contato Teste', 'store', 'draft', 'Quote Loja 1',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_need_id', (select id from public.store_needs where title = 'Cadeiras Loja 1'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 3, 'unit', 'un', 'unit_price', 10,
      'discount_amount', 1, 'shipping_type', 'informed', 'shipping_amount', 5,
      'other_costs', 2, 'delivery_days', 7, 'minimum_quantity', 2,
      'offered_brand_model', 'Modelo A'
    ))
  )$$,
  'Cotacao de uma loja e criada com item e valores historicos'
);
select is(
  (select item.store_need_id
   from public.supply_quote_items item
   join public.supply_quotes quote on quote.id = item.quote_id
   where quote.notes = 'Quote Loja 1'),
  (select id from public.store_needs where title = 'Cadeiras Loja 1'),
  'Item cotado referencia corretamente a necessidade'
);
select is(
  (select round(item.quantity * item.unit_price, 2) + item.shipping_amount + item.other_costs - item.discount_amount
   from public.supply_quote_items item
   join public.supply_quotes quote on quote.id = item.quote_id
   where quote.notes = 'Quote Loja 1'),
  36.00::numeric,
  'Calculo historico considera subtotal, frete, outros custos e desconto'
);
select lives_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, current_date + 10, null, 'store', 'draft', 'Quote Loja 2',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-902')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_need_id', (select id from public.store_needs where title = 'Cadeiras Loja 2'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-902'),
      'quantity', 4, 'unit', 'un', 'unit_price', 11,
      'shipping_type', 'free', 'other_costs', 0, 'delivery_days', 5
    ))
  )$$,
  'Cotacao da segunda loja e criada'
);
select lives_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, current_date + 10, null, 'consolidated', 'draft', 'Quote Multiloja',
    array[
      (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      (select id from public.lojas where codigo_negocio = 'LOJ-902')
    ],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'quantity', 7, 'unit', 'un', 'unit_price', 9.5,
      'shipping_type', 'pending', 'other_costs', 0, 'delivery_days', 10
    ))
  )$$,
  'Cotacao consolidada usa relacao normalizada com multiplas lojas'
);
select throws_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, null, null, 'store', 'draft', 'Quantidade invalida',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 0, 'unit_price', 10, 'shipping_type', 'free'
    ))
  )$$,
  'P0001', 'invalid quote item values',
  'Quantidade zero e rejeitada'
);
select throws_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, null, null, 'store', 'draft', 'Preco invalido',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 1, 'unit_price', -1, 'shipping_type', 'free'
    ))
  )$$,
  'P0001', 'invalid quote item values',
  'Preco negativo e rejeitado'
);
select is((select count(*) from public.supply_quotes), 3::bigint, 'Administrador visualiza todas as cotacoes');

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$update public.supply_items
    set description = 'Catalogo revisado pelo prospector'
    where name = 'Cadeira de atendimento'$$,
  'Prospector autorizado edita item criado por outro usuario'
);
select is(
  (select updated_by from public.supply_items where name = 'Cadeira de atendimento'),
  '22000000-0000-4000-8000-000000000002'::uuid,
  'Atualizacao registra o usuario atual como autor'
);
select is((select count(*) from public.supply_quotes), 1::bigint, 'Prospector ve somente cotacao integralmente dentro do seu escopo');
select is((select count(*) from public.supply_quotes where notes = 'Quote Multiloja'), 0::bigint, 'Cotacao multiloja nao vaza para acesso parcial');
select is((select count(*) from public.supply_quote_items where store_id = (select id from public.lojas where codigo_negocio = 'LOJ-902')), 0::bigint, 'Itens da loja nao autorizada nao ficam visiveis');
select lives_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, current_date + 5, null, 'store', 'draft', 'Draft Prospector Loja 1',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 1, 'unit_price', 12, 'shipping_type', 'free'
    ))
  )$$,
  'Prospector cria cotacao para loja atribuida'
);
select throws_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, null, null, 'store', 'draft', 'Draft Prospector Loja 2',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-902')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-902'),
      'quantity', 1, 'unit_price', 12, 'shipping_type', 'free'
    ))
  )$$,
  'P0001', 'permission denied',
  'Prospector nao cria cotacao fora do escopo'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.supply_quotes), 2::bigint, 'Consulta le somente cotacoes da loja atribuida');
update public.supply_items set name = 'Alteracao indevida' where name = 'Cadeira de atendimento';
select is((select name from public.supply_items limit 1), 'Cadeira de atendimento', 'Consulta nao altera item do catalogo');
select throws_ok(
  $$select public.save_supplier(
    null, 'Fornecedor Indevido', null, 'legal', null, null, null, null, null,
    null, null, null, null, true, null, 'national', null, null, null, true, true
  )$$,
  'P0001', 'permission denied',
  'Consulta nao gerencia fornecedores'
);
select throws_ok(
  $$select public.save_supply_quote(
    null,
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    current_date, null, null, 'store', 'draft', 'Quote Consulta',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Cadeira de atendimento'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 1, 'unit_price', 10, 'shipping_type', 'free'
    ))
  )$$,
  'P0001', 'permission denied',
  'Consulta nao cria cotacoes'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.supply_quotes), 1::bigint, 'Usuario da LOJ-902 ve somente a cotacao exclusiva da loja');
select is((select count(*) from public.supply_quotes where notes = 'Quote Multiloja'), 0::bigint, 'Multiloja tambem fica oculta para usuario apenas da LOJ-902');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.supply_items$$, '42501', null, 'Anonimo nao acessa catalogo');
select throws_ok($$select * from public.suppliers$$, '42501', null, 'Anonimo nao acessa fornecedores');
select throws_ok($$select * from public.supply_quotes$$, '42501', null, 'Anonimo nao acessa cotacoes');
select throws_ok($$select * from public.supply_quote_items$$, '42501', null, 'Anonimo nao acessa itens cotados');

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.save_supplier(
    (select id from public.suppliers where trade_name = 'Fornecedor Sintetico'),
    'Fornecedor Sintetico', 'Fornecedor Sintetico Ltda', 'legal', '11222333000144',
    'Contato Teste', '11999990000', 'supply@example.invalid', 'https://example.invalid',
    'Campinas', 'SP', null, 'Fornecedor inativo', false,
    (select id from public.supplier_channels where label = 'Unidade Campinas'),
    'local_city', 'Unidade Campinas', 'Campinas', 'SP', false, true
  )$$,
  'Fornecedor pode ser inativado sem exclusao'
);
select is((select active from public.suppliers where trade_name = 'Fornecedor Sintetico'), false, 'Fornecedor fica inativo');
select lives_ok(
  $$update public.supply_items set active = false where name = 'Cadeira de atendimento'$$,
  'Item pode ser inativado sem exclusao'
);
select is(
  (select supplier_name_snapshot from public.supply_quotes where notes = 'Quote Loja 1'),
  'Fornecedor Sintetico',
  'Snapshot do fornecedor permanece no historico'
);
select is(
  (select count(*) from public.supply_quote_items item
   join public.supply_quotes quote on quote.id = item.quote_id
   where quote.notes = 'Quote Loja 1'),
  1::bigint,
  'Inativacao do item preserva linha historica da cotacao'
);
select ok(exists(select 1 from public.audit_logs where action = 'item.created'), 'Criacao de item e auditada');
select ok(exists(select 1 from public.audit_logs where action = 'supplier.created'), 'Criacao de fornecedor e auditada');
select ok(exists(select 1 from public.audit_logs where action = 'quote.created'), 'Criacao de cotacao e auditada');
select ok(exists(select 1 from public.audit_logs where action = 'quote.item_added'), 'Inclusao de itens cotados e auditada');
select ok(not exists(select 1 from public.permissoes where chave = 'quotes.approve'), 'Capability de aprovacao nao foi criada');

select * from finish();
rollback;
