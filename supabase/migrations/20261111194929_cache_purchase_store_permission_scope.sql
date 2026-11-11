-- Cache per-store authorization once per SQL statement.
-- This is equivalent to app.can_store_any(): store assignment plus any allowed
-- permission in the requested key set, with global/store denies taking priority.

create or replace function private.readable_store_ids_for(p_permission_keys text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  with current_actor as materialized (
    select actor.id, actor.perfil_id, actor.all_stores
    from public.usuarios actor
    where actor.auth_user_id = (select auth.uid())
      and actor.status = 'active'
  ),
  permission_keys as materialized (
    select permission.id as permission_id
    from public.permissoes permission
    where permission.ativo
      and permission.chave = any(coalesce(p_permission_keys, array[]::text[]))
  ),
  accessible_stores as materialized (
    select store.id as store_id, actor.id as usuario_id, actor.perfil_id
    from public.lojas store
    cross join current_actor actor
    where actor.all_stores
      or exists (
        select 1
        from public.usuario_lojas assignment
        where assignment.usuario_id = actor.id
          and assignment.loja_id = store.id
      )
  ),
  store_permission_access as materialized (
    select distinct accessible.store_id
    from accessible_stores accessible
    cross join permission_keys permission
    where not exists (
      select 1
      from public.usuario_permissoes override
      where override.usuario_id = accessible.usuario_id
        and override.permissao_id = permission.permission_id
        and (override.loja_id is null or override.loja_id = accessible.store_id)
        and override.efeito = 'deny'
        and (override.expires_at is null or override.expires_at > now())
    )
    and (
      exists (
        select 1
        from public.perfil_permissoes profile_permission
        where profile_permission.perfil_id = accessible.perfil_id
          and profile_permission.permissao_id = permission.permission_id
      )
      or exists (
        select 1
        from public.usuario_permissoes override
        where override.usuario_id = accessible.usuario_id
          and override.permissao_id = permission.permission_id
          and (override.loja_id is null or override.loja_id = accessible.store_id)
          and override.efeito = 'grant'
          and (override.expires_at is null or override.expires_at > now())
      )
    )
  )
  select coalesce(
    array_agg(distinct store_permission_access.store_id order by store_permission_access.store_id),
    array[]::uuid[]
  )
  from store_permission_access;
$function$;

revoke all on function private.readable_store_ids_for(text[])
  from public, anon, authenticated, service_role;

create or replace function app.readable_store_ids_for(p_permission_keys text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select private.readable_store_ids_for(p_permission_keys);
$function$;

revoke all on function app.readable_store_ids_for(text[])
  from public, anon, authenticated, service_role;
grant execute on function app.readable_store_ids_for(text[])
  to authenticated, service_role;

-- Purchase and destination store mappings.
drop policy if exists supply_purchase_stores_read_scoped on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped on public.supply_purchase_stores
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and store_id = any((select app.readable_store_ids_for(array[
    'purchases.view',
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.payments_view',
    'finance.payments_consolidated_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  ]::text[]))::uuid[])
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read on public.supply_purchase_destination_stores
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and store_id = any((select app.readable_store_ids_for(array[
    'purchases.view',
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.payments_view',
    'finance.payments_consolidated_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  ]::text[]))::uuid[])
);

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order
      on purchase_order.id = line.order_id
    where line.id = supply_purchase_order_line_stores.order_line_id
      and purchase_order.purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  )
  and store_id = any((select app.readable_store_ids_for(array[
    'purchases.view',
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.payments_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  ]::text[]))::uuid[])
);

drop policy if exists supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores;
create policy supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.id = supply_purchase_attachment_stores.attachment_id
      and attachment.purchase_id = any((select app.readable_supply_purchase_attachment_ids())::uuid[])
  )
  and store_id = any((select app.readable_store_ids_for(array[
    'purchases.view',
    'finance.store_detail_documents_view'
  ]::text[]))::uuid[])
);

-- Audit mapping policies intentionally remain store-scoped, not purchase-scoped.
-- Cache their store set while retaining the independent finance.view gate.
drop policy if exists audit_supply_purchase_stores_select on public.supply_purchase_stores;
create policy audit_supply_purchase_stores_select on public.supply_purchase_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and store_id = any((select app.readable_store_ids_for(array['finance.document_audit_view']::text[]))::uuid[])
);

drop policy if exists audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores;
create policy audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and store_id = any((select app.readable_store_ids_for(array['finance.document_audit_view']::text[]))::uuid[])
);

drop policy if exists audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores;
create policy audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and store_id = any((select app.readable_store_ids_for(array['finance.document_audit_view']::text[]))::uuid[])
);
