-- Separate the legacy Financeiro > Pagamentos tab from the new consolidated payments page.
-- Existing finance.payments_view continues to guard the legacy tab.
-- New finance.payments_consolidated_view guards /financeiro/pagamentos.

insert into public.acoes (chave, nome)
values ('payments_consolidated_view', 'Visualizar Pagamentos consolidado')
on conflict (chave) do update
set nome = excluded.nome,
    updated_at = now();

insert into public.permissoes (modulo_id, acao_id, chave, descricao, ativo)
select
  m.id,
  a.id,
  'finance.payments_consolidated_view',
  'Visualizar a nova tela consolidada Financeiro > Pagamentos',
  true
from public.modulos m
join public.acoes a on a.chave = 'payments_consolidated_view'
where m.chave = 'finance'
on conflict (chave) do update
set descricao = excluded.descricao,
    ativo = true,
    updated_at = now();

-- Preserve current access on rollout, but from this point the permissions are independent.
with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'finance.payments_view'
),
target as (
  select id from public.permissoes where chave = 'finance.payments_consolidated_view'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, target.id
from source_profiles cross join target
on conflict (perfil_id, permissao_id) do nothing;

with source_permission as (
  select id from public.permissoes where chave = 'finance.payments_view'
),
target_permission as (
  select id from public.permissoes where chave = 'finance.payments_consolidated_view'
)
insert into public.usuario_permissoes
  (usuario_id, permissao_id, loja_id, efeito, expires_at, motivo, created_by)
select
  up.usuario_id,
  target_permission.id,
  up.loja_id,
  up.efeito,
  up.expires_at,
  case
    when coalesce(up.motivo, '') = '' then 'Cópia inicial da permissão Pagamentos para separar a nova tela consolidada'
    else up.motivo
  end,
  up.created_by
from public.usuario_permissoes up
join source_permission on source_permission.id = up.permissao_id
cross join target_permission
on conflict (usuario_id, permissao_id, loja_id) do nothing;

create or replace function app.can_read_supply_purchase(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    app.can_read_supply_purchase_for(p_purchase_id, 'purchases', 'view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'overview_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'store_detail_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'payments_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'payments_consolidated_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'stores_ufs_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'reimbursements_view');
$function$;

create or replace function app.can_read_supply_purchase_attachment(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    app.can_read_supply_purchase_for(p_purchase_id, 'purchases', 'view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'store_detail_documents_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'payments_consolidated_view');
$function$;

create or replace function app.can_read_work_document_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.works_service_documents document
    where document.storage_path = p_object_name
      and document.store_id = app.storage_work_store_id(p_object_name)
      and (
        app.can_store('works', 'documents_view', document.store_id)
        or app.can_store('finance', 'store_detail_documents_view', document.store_id)
        or app.can_store('finance', 'payments_consolidated_view', document.store_id)
      )
  );
$function$;

drop policy if exists stores_read_scoped on public.lojas;
create policy stores_read_scoped
on public.lojas
for select
to authenticated
using (
  app.can_store('stores', 'view', id)
  or app.can_store('works', 'view', id)
  or app.can_store('finance', 'overview_view', id)
  or app.can_store('finance', 'store_detail_view', id)
  or app.can_store('finance', 'payments_view', id)
  or app.can_store('finance', 'payments_consolidated_view', id)
  or app.can_store('finance', 'stores_ufs_view', id)
  or app.can_store('finance', 'reimbursements_view', id)
);

drop policy if exists supply_purchase_stores_read_scoped on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped
on public.supply_purchase_stores
for select
to authenticated
using (
  app.can_read_supply_purchase(purchase_id)
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'payments_consolidated_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select
to authenticated
using (
  app.can_read_supply_purchase(purchase_id)
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'payments_consolidated_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read
on public.supply_purchase_order_line_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.id = supply_purchase_order_line_stores.order_line_id
      and app.can_read_supply_purchase(purchase_order.purchase_id)
  )
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'payments_consolidated_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists works_services_read_scoped on public.works_services;
create policy works_services_read_scoped
on public.works_services
for select
to authenticated
using (
  app.can_store('works', 'view', store_id)
  or app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
  or app.can_store('finance', 'payments_consolidated_view', store_id)
);

drop policy if exists works_service_payments_read_scoped on public.works_service_payments;
create policy works_service_payments_read_scoped
on public.works_service_payments
for select
to authenticated
using (
  app.can_store('works', 'view', store_id)
  or app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
  or app.can_store('finance', 'payments_consolidated_view', store_id)
);

drop policy if exists works_service_documents_read_scoped on public.works_service_documents;
create policy works_service_documents_read_scoped
on public.works_service_documents
for select
to authenticated
using (
  app.can_store('works', 'documents_view', store_id)
  or app.can_store('finance', 'store_detail_documents_view', store_id)
  or app.can_store('finance', 'payments_consolidated_view', store_id)
);

drop policy if exists purchase_attachments_objects_read on storage.objects;
create policy purchase_attachments_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'purchase-attachments'
  and app.can_read_supply_purchase_attachment_object(name)
);

drop policy if exists works_documents_objects_read on storage.objects;
create policy works_documents_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'works-documents'
  and app.can_read_work_document_object(name)
);
