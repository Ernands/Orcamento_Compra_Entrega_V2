-- Set-based permission matrix for purchase RLS.
-- This avoids invoking app.can_store once for every store x permission pair.
-- It preserves: active user, global grant/profile permission, global deny,
-- store assignment, store-level grant, and store-level deny semantics.

create or replace function private.readable_supply_purchase_ids_for(p_permission_keys text[])
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
  global_permissions as materialized (
    select permission.id as permission_id
    from public.permissoes permission
    cross join current_actor actor
    where permission.ativo
      and permission.chave = any(coalesce(p_permission_keys, array[]::text[]))
      and not exists (
        select 1
        from public.usuario_permissoes override
        where override.usuario_id = actor.id
          and override.permissao_id = permission.id
          and override.loja_id is null
          and override.efeito = 'deny'
          and (override.expires_at is null or override.expires_at > now())
      )
      and (
        exists (
          select 1
          from public.perfil_permissoes profile_permission
          where profile_permission.perfil_id = actor.perfil_id
            and profile_permission.permissao_id = permission.id
        )
        or exists (
          select 1
          from public.usuario_permissoes override
          where override.usuario_id = actor.id
            and override.permissao_id = permission.id
            and override.loja_id is null
            and override.efeito = 'grant'
            and (override.expires_at is null or override.expires_at > now())
        )
      )
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
    select accessible.store_id, permission.permission_id
    from accessible_stores accessible
    cross join global_permissions permission
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
  ),
  readable_purchase_permissions as (
    select purchase_store.purchase_id, permission.permission_id
    from public.supply_purchase_stores purchase_store
    cross join global_permissions permission
    left join store_permission_access access
      on access.store_id = purchase_store.store_id
     and access.permission_id = permission.permission_id
    group by purchase_store.purchase_id, permission.permission_id
    having count(*) = count(access.store_id)
  )
  select coalesce(
    array_agg(distinct readable.purchase_id order by readable.purchase_id),
    array[]::uuid[]
  )
  from readable_purchase_permissions readable;
$function$;

revoke all on function private.readable_supply_purchase_ids_for(text[])
  from public, anon, authenticated, service_role;

create or replace function app.readable_supply_purchase_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select private.readable_supply_purchase_ids_for(array[
    'purchases.view',
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.payments_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  ]::text[]);
$function$;

revoke all on function app.readable_supply_purchase_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_purchase_ids()
  to authenticated, service_role;

create or replace function app.readable_supply_purchase_attachment_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select private.readable_supply_purchase_ids_for(array[
    'purchases.view',
    'finance.store_detail_documents_view',
    'finance.payments_consolidated_view'
  ]::text[]);
$function$;

revoke all on function app.readable_supply_purchase_attachment_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_purchase_attachment_ids()
  to authenticated, service_role;

create or replace function app.readable_supply_purchase_audit_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when app.can('finance', 'view')
      then private.readable_supply_purchase_ids_for(array[
        'finance.document_audit_view'
      ]::text[])
    else array[]::uuid[]
  end;
$function$;

revoke all on function app.readable_supply_purchase_audit_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_purchase_audit_ids()
  to authenticated, service_role;

-- Audit policies keep their additional finance.view gate but reuse the same
-- complete purchase scope for every row in the statement.

drop policy if exists audit_supply_purchases_select on public.supply_purchases;
create policy audit_supply_purchases_select on public.supply_purchases
for select to authenticated
using (
  id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);

drop policy if exists audit_supply_purchase_items_select on public.supply_purchase_items;
create policy audit_supply_purchase_items_select on public.supply_purchase_items
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);

drop policy if exists audit_purchase_destinations_select on public.supply_purchase_destinations;
create policy audit_purchase_destinations_select on public.supply_purchase_destinations
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_items item
    where item.id = supply_purchase_destinations.purchase_item_id
      and item.purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
  )
);

drop policy if exists audit_supply_purchase_orders_select on public.supply_purchase_orders;
create policy audit_supply_purchase_orders_select on public.supply_purchase_orders
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);

drop policy if exists audit_purchase_order_items_select on public.supply_purchase_order_items;
create policy audit_purchase_order_items_select on public.supply_purchase_order_items
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = supply_purchase_order_items.order_id
      and purchase_order.purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
  )
);

drop policy if exists audit_supply_purchase_payments_select on public.supply_purchase_payments;
create policy audit_supply_purchase_payments_select on public.supply_purchase_payments
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);

drop policy if exists audit_supply_purchase_attachments_select on public.supply_purchase_attachments;
create policy audit_supply_purchase_attachments_select on public.supply_purchase_attachments
for select to authenticated
using (
  deleted_at is null
  and purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);

-- These three policies are store-scoped rather than purchase-scoped. Preserve
-- that exact behavior while evaluating the global finance.view gate once.

drop policy if exists audit_supply_purchase_stores_select on public.supply_purchase_stores;
create policy audit_supply_purchase_stores_select on public.supply_purchase_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and app.can_store_any(array['finance.document_audit_view']::text[], store_id)
);

drop policy if exists audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores;
create policy audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and app.can_store_any(array['finance.document_audit_view']::text[], store_id)
);

drop policy if exists audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores;
create policy audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and app.can_store_any(array['finance.document_audit_view']::text[], store_id)
);

drop policy if exists purchase_partial_adjustments_read on public.supply_purchase_partial_adjustments;
create policy purchase_partial_adjustments_read on public.supply_purchase_partial_adjustments
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  or purchase_id = any((select app.readable_supply_purchase_audit_ids())::uuid[])
);
