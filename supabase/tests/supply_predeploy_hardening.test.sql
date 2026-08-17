begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('13000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-supply-hardening@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'prospector-supply-hardening@auth.implanta27.invalid', extensions.crypt('Synthetic-Prospector-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'consultation-supply-hardening@auth.implanta27.invalid', extensions.crypt('Synthetic-Consultation-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('23000000-0000-4000-8000-000000000001', 'USR-9931', '13000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Hardening', '0031', 'active', false, true),
  ('23000000-0000-4000-8000-000000000002', 'USR-9932', '13000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'prospector'), 'Prospector Hardening', '0032', 'active', false, false),
  ('23000000-0000-4000-8000-000000000003', 'USR-9933', '13000000-0000-4000-8000-000000000003', (select id from public.perfis where chave = 'consultation'), 'Consulta Hardening', '0033', 'active', false, false);

insert into public.usuario_lojas (usuario_id, loja_id) values
  ('23000000-0000-4000-8000-000000000002', (select id from public.lojas where codigo_negocio = 'LOJ-901')),
  ('23000000-0000-4000-8000-000000000003', (select id from public.lojas where codigo_negocio = 'LOJ-901'));

create temporary table supply_hardening_quote_ids (
  label text primary key,
  id uuid not null
);
grant select, insert on table supply_hardening_quote_ids to authenticated;

create or replace function pg_temp.create_supply_hardening_quote(
  p_note text,
  p_price numeric,
  p_context public.supply_quote_context,
  p_store_ids uuid[],
  p_status public.supply_quote_status default 'draft',
  p_quote_id uuid default null
)
returns uuid
language sql
as $$
  select public.save_supply_quote(
    p_quote_id,
    (select id from public.suppliers where trade_name = 'Fornecedor Privado'),
    (select id from public.supplier_channels where label = 'Canal Privado'),
    current_date,
    current_date + 30,
    null,
    p_context,
    p_status,
    p_note,
    p_store_ids,
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Item Hardening'),
      'store_id', case when p_context = 'store' then p_store_ids[1] else null end,
      'quantity', 1,
      'unit', 'un',
      'unit_price', p_price,
      'shipping_type', 'free',
      'delivery_days', 5
    ))
  );
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(app.can('quotes', 'edit'), 'Administrador possui edicao de cotacoes');

insert into public.supply_items (name, category, item_type, default_unit)
values ('Item Hardening', 'Equipamentos', 'product', 'un');

select public.save_supplier(
  null, 'Fornecedor Privado', null, 'individual', '52998224725',
  'Contato Privado', '11999990000', 'private@example.invalid', null,
  'Campinas', 'SP', null, null, true,
  null, 'local_city', 'Canal Privado', 'Campinas', 'SP', false, true
);

select is(
  (select document from public.list_suppliers_for_management() where trade_name = 'Fornecedor Privado'),
  '52998224725',
  'Gestor consulta documento completo pela RPC restrita'
);
select throws_ok(
  $$select document from public.suppliers where trade_name = 'Fornecedor Privado'$$,
  '42501', null,
  'Documento nao fica disponivel por SELECT direto, inclusive para gestor'
);

insert into supply_hardening_quote_ids (label, id) values
  ('draft_received', pg_temp.create_supply_hardening_quote(
    'Status Draft Received', 10, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')]
  )),
  ('draft_cancelled', pg_temp.create_supply_hardening_quote(
    'Status Draft Cancelled', 11, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')]
  )),
  ('received_cancelled', pg_temp.create_supply_hardening_quote(
    'Status Received Cancelled', 12, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')]
  )),
  ('received_expired', pg_temp.create_supply_hardening_quote(
    'Status Received Expired', 13, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')]
  )),
  ('prospector', pg_temp.create_supply_hardening_quote(
    'Status Prospector', 14, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')]
  )),
  ('multistore', pg_temp.create_supply_hardening_quote(
    'Status Multiloja', 15, 'consolidated',
    array[
      (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      (select id from public.lojas where codigo_negocio = 'LOJ-902')
    ]
  ));

select throws_ok(
  $$select pg_temp.create_supply_hardening_quote(
    'Nova Recebida Indevida', 9, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    'received'
  )$$,
  'P0001', 'new quotes must start as draft',
  'Nova cotacao deve iniciar em draft'
);
select throws_ok(
  $$select pg_temp.create_supply_hardening_quote(
    'Status Prospector', 99, 'store',
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    'received',
    (select id from supply_hardening_quote_ids where label = 'prospector')
  )$$,
  'P0001', 'use set_supply_quote_status to change quote status',
  'RPC de conteudo nao substitui a transicao dedicada'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'draft_received'), 'received'
  )$$,
  'Transicao draft para received funciona'
);
select is(
  (select status from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'draft_received')),
  'received'::public.supply_quote_status,
  'Status recebido e persistido'
);
select is(
  (select unit_price from public.supply_quote_items where quote_id = (select id from supply_hardening_quote_ids where label = 'draft_received')),
  10.00::numeric,
  'Mudanca de status preserva o preco historico'
);
select is(
  (select count(*) from public.supply_quote_items where quote_id = (select id from supply_hardening_quote_ids where label = 'draft_received')),
  1::bigint,
  'Mudanca de status preserva os itens historicos'
);
select ok(
  exists(
    select 1 from public.audit_logs
    where entity_id = (select id from supply_hardening_quote_ids where label = 'draft_received')
      and action = 'quote.status_changed'
      and before_json = '{"status":"draft"}'::jsonb
      and after_json = '{"status":"received"}'::jsonb
  ),
  'Mudanca de status e auditada apenas com before e after do status'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'draft_cancelled'), 'cancelled'
  )$$,
  'Transicao draft para cancelled funciona'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'received_cancelled'), 'received'
  )$$,
  'Cotacao e recebida antes do cancelamento'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'received_cancelled'), 'cancelled'
  )$$,
  'Transicao received para cancelled funciona'
);
select is(
  (select unit_price from public.supply_quote_items where quote_id = (select id from supply_hardening_quote_ids where label = 'received_cancelled')),
  12.00::numeric,
  'Cancelamento preserva o preco recebido'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'received_expired'), 'received'
  )$$,
  'Cotacao e recebida antes da expiracao'
);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'received_expired'), 'expired'
  )$$,
  'Transicao received para expired funciona'
);
select throws_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'draft_cancelled'), 'received'
  )$$,
  'P0001', 'invalid quote status transition',
  'Cotacao cancelada nao reabre'
);
select throws_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'received_expired'), 'received'
  )$$,
  'P0001', 'invalid quote status transition',
  'Cotacao expirada nao reabre'
);
select is(
  (select status from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'draft_cancelled')),
  'cancelled'::public.supply_quote_status,
  'Status cancelado permanece terminal'
);
select is(
  (select status from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'received_expired')),
  'expired'::public.supply_quote_status,
  'Status expirado permanece terminal'
);
select ok(
  not exists(
    select 1 from public.audit_logs
    where coalesce(before_json::text, '') like '%52998224725%'
       or coalesce(after_json::text, '') like '%52998224725%'
  ),
  'Documento do fornecedor nao e armazenado na auditoria'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select trade_name from public.suppliers where trade_name = 'Fornecedor Privado'),
  'Fornecedor Privado',
  'Consulta acessa dados operacionais do fornecedor'
);
select throws_ok(
  $$select document from public.suppliers where trade_name = 'Fornecedor Privado'$$,
  '42501', null,
  'Consulta nao acessa documento do fornecedor'
);
select throws_ok(
  $$select * from public.list_suppliers_for_management()$$,
  'P0001', 'permission denied',
  'Consulta nao executa leitura administrativa de fornecedores'
);
select throws_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'prospector'), 'cancelled'
  )$$,
  'P0001', 'permission denied',
  'Consulta nao altera status de cotacao'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'prospector'), 'received'
  )$$,
  'Prospector altera cotacao integralmente dentro da loja autorizada'
);
select is(
  (select status from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'prospector')),
  'received'::public.supply_quote_status,
  'Cotacao da loja autorizada recebe o novo status'
);
select throws_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'multistore'), 'cancelled'
  )$$,
  'P0001', 'permission denied',
  'Usuario parcial nao altera cotacao multiloja'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select status from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'multistore')),
  'draft'::public.supply_quote_status,
  'Falha de escopo preserva status da cotacao multiloja'
);
select is(
  (select unit_price from public.supply_quote_items where quote_id = (select id from supply_hardening_quote_ids where label = 'prospector')),
  14.00::numeric,
  'Transicao do Prospector nao altera o preco historico'
);
select is(
  (select updated_by from public.supply_quotes where id = (select id from supply_hardening_quote_ids where label = 'prospector')),
  '23000000-0000-4000-8000-000000000002'::uuid,
  'Transicao registra o Prospector como autor'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select trade_name from public.suppliers$$,
  '42501', null,
  'Anonimo nao acessa dados operacionais de fornecedor'
);
select throws_ok(
  $$select * from public.list_suppliers_for_management()$$,
  '42501', null,
  'Anonimo nao executa leitura administrativa de fornecedores'
);
select throws_ok(
  $$select public.set_supply_quote_status(
    (select id from supply_hardening_quote_ids where label = 'prospector'), 'cancelled'
  )$$,
  '42501', null,
  'Anonimo nao executa mudanca de status'
);

select * from finish();
rollback;
