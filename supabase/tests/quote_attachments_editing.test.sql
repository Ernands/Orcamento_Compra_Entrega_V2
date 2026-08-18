begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-quotes-v2@auth.implanta27.invalid', extensions.crypt('Synthetic-Admin-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'consulta-quotes-v2@auth.implanta27.invalid', extensions.crypt('Synthetic-Consulta-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sem-loja-quotes-v2@auth.implanta27.invalid', extensions.crypt('Synthetic-Sem-Loja-27', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.usuarios (
  id, codigo_negocio, auth_user_id, perfil_id, nome, cpf_last4,
  status, must_change_password, all_stores
) values
  ('26000000-0000-4000-8000-000000000001', 'USR-9961', '16000000-0000-4000-8000-000000000001', (select id from public.perfis where chave = 'administrator'), 'Admin Cotacoes V2', '0061', 'active', false, true),
  ('26000000-0000-4000-8000-000000000002', 'USR-9962', '16000000-0000-4000-8000-000000000002', (select id from public.perfis where chave = 'consultation'), 'Consulta Cotacoes V2', '0062', 'active', false, false),
  ('26000000-0000-4000-8000-000000000003', 'USR-9963', '16000000-0000-4000-8000-000000000003', (select id from public.perfis where chave = 'consultation'), 'Sem Loja Cotacoes V2', '0063', 'active', false, false);

insert into public.usuario_lojas (usuario_id, loja_id)
values (
  '26000000-0000-4000-8000-000000000002',
  (select id from public.lojas where codigo_negocio = 'LOJ-901')
);

create temporary table quote_v2_ids (label text primary key, id uuid not null);
create temporary table quote_v2_attachment_ids (label text primary key, id uuid not null);
grant select, insert on table quote_v2_ids to authenticated;
grant select, insert on table quote_v2_attachment_ids to authenticated;

create or replace function pg_temp.quote_attachment_bucket_is_private()
returns boolean
language plpgsql
as $$
declare
  v_valid boolean;
begin
  if to_regclass('storage.buckets') is null then
    return true;
  end if;
  execute $query$
    select exists(
      select 1 from storage.buckets
      where id = 'quote-attachments'
        and public = false
        and file_size_limit = 104857600
    )
  $query$ into v_valid;
  return v_valid;
end;
$$;

create or replace function pg_temp.save_quote_v2(
  p_quote_id uuid,
  p_status public.supply_quote_status,
  p_note text,
  p_price numeric
)
returns uuid
language sql
as $$
  select public.save_supply_quote(
    p_quote_id,
    (select id from public.suppliers where trade_name = 'Fornecedor Cotacoes V2'),
    (select id from public.supplier_channels where label = 'Canal Cotacoes V2'),
    current_date,
    current_date + 30,
    'Contato atualizado',
    'store',
    p_status,
    p_note,
    array[(select id from public.lojas where codigo_negocio = 'LOJ-901')],
    jsonb_build_array(jsonb_build_object(
      'supply_item_id', (select id from public.supply_items where name = 'Item Cotacoes V2'),
      'store_id', (select id from public.lojas where codigo_negocio = 'LOJ-901'),
      'quantity', 2,
      'unit', 'un',
      'unit_price', p_price,
      'shipping_type', 'free',
      'delivery_days', 7,
      'product_url', 'https://fornecedor.example/item'
    ))
  );
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.supply_items (name, category, item_type, default_unit)
values ('Item Cotacoes V2', 'Equipamentos', 'product', 'un');

select public.save_supplier(
  null, 'Fornecedor Cotacoes V2', null, 'legal', null,
  'Contato V2', null, 'quotes-v2@example.invalid', null,
  'Campinas', 'SP', null, null, true,
  null, 'local_city', 'Canal Cotacoes V2', 'Campinas', 'SP', false, true
);

insert into quote_v2_ids (label, id) values
  ('draft', pg_temp.save_quote_v2(null, 'draft', 'Original Draft', 10)),
  ('received', pg_temp.save_quote_v2(null, 'draft', 'Original Received', 20)),
  ('expired', pg_temp.save_quote_v2(null, 'draft', 'Original Expired', 30)),
  ('cancelled', pg_temp.save_quote_v2(null, 'draft', 'Original Cancelled', 40)),
  ('delete', pg_temp.save_quote_v2(null, 'draft', 'Excluir Draft', 50));

select public.set_supply_quote_status((select id from quote_v2_ids where label = 'received'), 'received');
select public.set_supply_quote_status((select id from quote_v2_ids where label = 'expired'), 'received');
select public.set_supply_quote_status((select id from quote_v2_ids where label = 'expired'), 'expired');
select public.set_supply_quote_status((select id from quote_v2_ids where label = 'cancelled'), 'cancelled');

select has_table('public', 'supply_quote_attachments', 'Tabela de anexos de cotacao existe');
select has_function('public', 'register_supply_quote_attachment', array['uuid', 'text', 'text', 'text', 'bigint', 'text'], 'RPC de registro de anexo existe');

select lives_ok(
  $$select pg_temp.save_quote_v2((select id from quote_v2_ids where label = 'draft'), 'draft', 'Editado Draft', 11)$$,
  'Cotacao em Rascunho pode ser editada'
);
select is((select status from public.supply_quotes where id = (select id from quote_v2_ids where label = 'draft')), 'draft'::public.supply_quote_status, 'Edicao preserva status Rascunho');
select lives_ok(
  $$select pg_temp.save_quote_v2((select id from quote_v2_ids where label = 'received'), 'received', 'Editado Received', 21)$$,
  'Cotacao Recebida pode ser editada'
);
select is((select status from public.supply_quotes where id = (select id from quote_v2_ids where label = 'received')), 'received'::public.supply_quote_status, 'Edicao preserva status Recebida');
select lives_ok(
  $$select pg_temp.save_quote_v2((select id from quote_v2_ids where label = 'expired'), 'expired', 'Editado Expired', 31)$$,
  'Cotacao Expirada pode ser editada'
);
select is((select status from public.supply_quotes where id = (select id from quote_v2_ids where label = 'expired')), 'expired'::public.supply_quote_status, 'Edicao preserva status Expirada');
select lives_ok(
  $$select pg_temp.save_quote_v2((select id from quote_v2_ids where label = 'cancelled'), 'cancelled', 'Editado Cancelled', 41)$$,
  'Cotacao Cancelada pode ser editada'
);
select is((select status from public.supply_quotes where id = (select id from quote_v2_ids where label = 'cancelled')), 'cancelled'::public.supply_quote_status, 'Edicao preserva status Cancelada');
select throws_ok(
  $$select pg_temp.save_quote_v2((select id from quote_v2_ids where label = 'received'), 'cancelled', 'Status indevido', 99)$$,
  'P0001', 'use set_supply_quote_status to change quote status',
  'Edicao normal nao contorna o fluxo de status'
);
select ok(
  exists(
    select 1 from public.audit_logs log
    join public.supply_quotes quote on quote.id = log.entity_id
    where log.entity_id = (select id from quote_v2_ids where label = 'received')
      and log.action = 'quote.updated'
      and log.actor_usuario_id = '26000000-0000-4000-8000-000000000001'
      and log.before_json ->> 'codigo_negocio' = quote.codigo_negocio
      and log.before_json ->> 'status' = 'received'
      and log.after_json ->> 'status' = 'received'
      and jsonb_array_length(log.before_json -> 'items') = 1
      and jsonb_array_length(log.after_json -> 'items') = 1
      and log.occurred_at is not null
      and log.origin = 'database'
  ),
  'quote.updated registra ator, codigo, status, snapshots completos, horario e origem'
);
select ok(
  exists(
    select 1 from public.audit_logs
    where entity_id = (select id from quote_v2_ids where label = 'received')
      and action = 'quote.updated'
      and before_json ->> 'notes' = 'Original Received'
      and after_json ->> 'notes' = 'Editado Received'
  ),
  'Auditoria preserva before e after da alteracao'
);

insert into quote_v2_attachment_ids (label, id)
select 'active', attachment.id
from public.register_supply_quote_attachment(
  (select id from quote_v2_ids where label = 'draft'),
  'proposta.pdf',
  'cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf',
  'application/pdf',
  4096,
  'Proposta comercial'
) attachment;

select ok(exists(select 1 from public.supply_quote_attachments where id = (select id from quote_v2_attachment_ids where label = 'active')), 'Anexo ativo fica visivel para editor autorizado');
select ok(app.can_read_supply_quote_attachment_object('cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf'), 'Objeto com metadata ativa pode gerar acesso temporario');
select ok(exists(select 1 from public.audit_logs where entity_id = (select id from quote_v2_attachment_ids where label = 'active') and action = 'quote.attachment.created'), 'Criacao do anexo e auditada');
select throws_ok(
  $$select public.register_supply_quote_attachment(
    (select id from quote_v2_ids where label = 'draft'), 'invalido.pdf',
    'cotacoes/00000000-0000-4000-8000-000000000000/30000000-0000-4000-8000-000000000002/invalido.pdf',
    'application/pdf', 100, null
  )$$,
  'P0001', 'invalid storage path',
  'RPC rejeita path que nao pertence a cotacao'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.supply_quotes where id = (select id from quote_v2_ids where label = 'draft')), 1::bigint, 'Consulta autorizada visualiza a cotacao da loja');
select is((select count(*) from public.supply_quote_attachments where id = (select id from quote_v2_attachment_ids where label = 'active')), 1::bigint, 'Consulta autorizada visualiza metadata ativa');
select ok(app.can_read_supply_quote_attachment_object('cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf'), 'Consulta autorizada pode ler o objeto ativo');
select throws_ok(
  $$select public.register_supply_quote_attachment(
    (select id from quote_v2_ids where label = 'draft'), 'sem-edicao.pdf',
    'cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000003/sem-edicao.pdf',
    'application/pdf', 100, null
  )$$,
  'P0001', 'permission denied',
  'Usuario somente leitura nao adiciona anexo'
);
select throws_ok(
  $$select public.delete_supply_quote_attachment((select id from quote_v2_attachment_ids where label = 'active'))$$,
  'P0001', 'permission denied',
  'Usuario somente leitura nao remove anexo'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.supply_quotes where id = (select id from quote_v2_ids where label = 'draft')), 0::bigint, 'Usuario sem loja nao visualiza a cotacao');
select is((select count(*) from public.supply_quote_attachments where id = (select id from quote_v2_attachment_ids where label = 'active')), 0::bigint, 'Usuario sem loja nao visualiza metadata do anexo');
select ok(not app.can_read_supply_quote_attachment_object('cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf'), 'Usuario sem loja nao le objeto do anexo');

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.delete_supply_quote_attachment((select id from quote_v2_attachment_ids where label = 'active')),
  'cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf',
  'Remocao autorizada devolve o path para limpeza fisica'
);
select ok(not app.can_read_supply_quote_attachment_object('cotacoes/' || (select id from quote_v2_ids where label = 'draft') || '/30000000-0000-4000-8000-000000000001/proposta.pdf'), 'Metadata removida bloqueia imediatamente a leitura do objeto');
select ok(exists(select 1 from public.audit_logs where entity_id = (select id from quote_v2_attachment_ids where label = 'active') and action = 'quote.attachment.deleted'), 'Remocao do anexo e auditada');
select ok(
  pg_temp.quote_attachment_bucket_is_private(),
  'Bucket e privado, limitado a 100 MB quando o Storage local esta disponivel'
);

insert into quote_v2_attachment_ids (label, id)
select 'blocks_delete', attachment.id
from public.register_supply_quote_attachment(
  (select id from quote_v2_ids where label = 'delete'),
  'bloqueio.pdf',
  'cotacoes/' || (select id from quote_v2_ids where label = 'delete') || '/30000000-0000-4000-8000-000000000004/bloqueio.pdf',
  'application/pdf', 100, null
) attachment;
select throws_ok(
  $$select public.delete_supply_quote((select id from quote_v2_ids where label = 'delete'))$$,
  'P0001', 'remove quote attachments before deleting quote',
  'Exclusao de rascunho exige remover anexos ativos primeiro'
);
select public.delete_supply_quote_attachment((select id from quote_v2_attachment_ids where label = 'blocks_delete'));
select lives_ok(
  $$select public.delete_supply_quote((select id from quote_v2_ids where label = 'delete'))$$,
  'Rascunho sem anexos ativos pode ser excluido'
);
select ok(not exists(select 1 from public.supply_quotes where id = (select id from quote_v2_ids where label = 'delete')), 'Cotacao em Rascunho foi removida');
select ok(exists(select 1 from public.audit_logs where entity_id = (select id from quote_v2_ids where label = 'delete') and action = 'quote.deleted' and before_json ->> 'status' = 'draft'), 'Exclusao de Rascunho preserva auditoria');
select throws_ok(
  $$select public.delete_supply_quote((select id from quote_v2_ids where label = 'received'))$$,
  'P0001', 'only draft quotes can be deleted',
  'Cotacao fora de Rascunho nao pode ser excluida'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.supply_quote_attachments$$,
  '42501', null,
  'Anonimo nao acessa metadata de anexos'
);
select throws_ok(
  $$select public.register_supply_quote_attachment(
    '00000000-0000-4000-8000-000000000001', 'anonimo.pdf',
    'cotacoes/00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000005/anonimo.pdf',
    'application/pdf', 100, null
  )$$,
  '42501', null,
  'Anonimo nao executa RPC de anexos'
);

select * from finish();
rollback;
