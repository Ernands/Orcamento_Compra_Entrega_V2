-- Cache purchase authorization once per SQL statement without widening RLS access.
-- Keep global permission checks (app.can) separate from per-store checks (app.can_store).
-- Attachment visibility has its own permission set and must not grant purchase-row access.

create or replace function app.readable_supply_purchase_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  with permission_keys(module_key, action_key) as (
    values
      ('purchases', 'view'),
      ('finance', 'overview_view'),
      ('finance', 'store_detail_view'),
      ('finance', 'payments_view'),
      ('finance', 'stores_ufs_view'),
      ('finance', 'reimbursements_view')
  ),
  global_permissions as materialized (
    select permission.module_key, permission.action_key
    from permission_keys permission
    where app.can(permission.module_key, permission.action_key)
  ),
  store_access as materialized (
    select
      store.id as store_id,
      permission.module_key,
      permission.action_key,
      app.can_store(permission.module_key, permission.action_key, store.id) as can_read
    from public.lojas store
    cross join global_permissions permission
    where (select auth.uid()) is not null
  ),
  readable_purchase_permissions as (
    select purchase_store.purchase_id
    from public.supply_purchase_stores purchase_store
    join store_access access on access.store_id = purchase_store.store_id
    group by purchase_store.purchase_id, access.module_key, access.action_key
    having bool_and(access.can_read)
  )
  select coalesce(
    array_agg(distinct readable.purchase_id order by readable.purchase_id),
    array[]::uuid[]
  )
  from readable_purchase_permissions readable;
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
  with permission_keys(module_key, action_key) as (
    values
      ('purchases', 'view'),
      ('finance', 'store_detail_documents_view'),
      ('finance', 'payments_consolidated_view')
  ),
  global_permissions as materialized (
    select permission.module_key, permission.action_key
    from permission_keys permission
    where app.can(permission.module_key, permission.action_key)
  ),
  store_access as materialized (
    select
      store.id as store_id,
      permission.module_key,
      permission.action_key,
      app.can_store(permission.module_key, permission.action_key, store.id) as can_read
    from public.lojas store
    cross join global_permissions permission
    where (select auth.uid()) is not null
  ),
  readable_purchase_permissions as (
    select purchase_store.purchase_id
    from public.supply_purchase_stores purchase_store
    join store_access access on access.store_id = purchase_store.store_id
    group by purchase_store.purchase_id, access.module_key, access.action_key
    having bool_and(access.can_read)
  )
  select coalesce(
    array_agg(distinct readable.purchase_id order by readable.purchase_id),
    array[]::uuid[]
  )
  from readable_purchase_permissions readable;
$function$;

revoke all on function app.readable_supply_purchase_attachment_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_purchase_attachment_ids()
  to authenticated, service_role;

drop policy if exists supply_purchases_read_scoped on public.supply_purchases;
create policy supply_purchases_read_scoped
on public.supply_purchases
for select to authenticated
using (
  id = any((select app.readable_supply_purchase_ids())::uuid[])
);

drop policy if exists supply_purchase_stores_read_scoped on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped
on public.supply_purchase_stores
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and app.can_store_any(
    array[
      'purchases.view',
      'finance.overview_view',
      'finance.store_detail_view',
      'finance.payments_view',
      'finance.payments_consolidated_view',
      'finance.stores_ufs_view',
      'finance.reimbursements_view'
    ]::text[],
    store_id
  )
);

drop policy if exists supply_purchase_items_read_scoped on public.supply_purchase_items;
create policy supply_purchase_items_read_scoped
on public.supply_purchase_items
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
);

drop policy if exists supply_purchase_destinations_read on public.supply_purchase_destinations;
create policy supply_purchase_destinations_read
on public.supply_purchase_destinations
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_items item
    where item.id = supply_purchase_destinations.purchase_item_id
      and item.purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  )
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and app.can_store_any(
    array[
      'purchases.view',
      'finance.overview_view',
      'finance.store_detail_view',
      'finance.payments_view',
      'finance.payments_consolidated_view',
      'finance.stores_ufs_view',
      'finance.reimbursements_view'
    ]::text[],
    store_id
  )
);

drop policy if exists supply_purchase_orders_read on public.supply_purchase_orders;
create policy supply_purchase_orders_read
on public.supply_purchase_orders
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
);

drop policy if exists supply_purchase_order_items_read on public.supply_purchase_order_items;
create policy supply_purchase_order_items_read
on public.supply_purchase_order_items
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = supply_purchase_order_items.order_id
      and purchase_order.purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  )
);

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read
on public.supply_purchase_order_line_stores
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
  and app.can_store_any(
    array[
      'purchases.view',
      'finance.overview_view',
      'finance.store_detail_view',
      'finance.payments_view',
      'finance.stores_ufs_view',
      'finance.reimbursements_view'
    ]::text[],
    store_id
  )
);

drop policy if exists supply_purchase_payments_read_scoped on public.supply_purchase_payments;
create policy supply_purchase_payments_read_scoped
on public.supply_purchase_payments
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
);

drop policy if exists supply_purchase_payment_occurrences_read_scoped on public.supply_purchase_payment_occurrences;
create policy supply_purchase_payment_occurrences_read_scoped
on public.supply_purchase_payment_occurrences
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_payments payment
    where payment.id = supply_purchase_payment_occurrences.payment_id
      and payment.purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  )
);

drop policy if exists supply_purchase_attachments_read_scoped on public.supply_purchase_attachments;
create policy supply_purchase_attachments_read_scoped
on public.supply_purchase_attachments
for select to authenticated
using (
  deleted_at is null
  and purchase_id = any((select app.readable_supply_purchase_attachment_ids())::uuid[])
);

drop policy if exists supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores;
create policy supply_purchase_attachment_stores_read
on public.supply_purchase_attachment_stores
for select to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.id = supply_purchase_attachment_stores.attachment_id
      and attachment.purchase_id = any((select app.readable_supply_purchase_attachment_ids())::uuid[])
  )
  and app.can_store_any(
    array[
      'purchases.view',
      'finance.store_detail_documents_view'
    ]::text[],
    store_id
  )
);

drop policy if exists purchase_partial_adjustments_read on public.supply_purchase_partial_adjustments;
create policy purchase_partial_adjustments_read
on public.supply_purchase_partial_adjustments
for select to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  or (
    app.can('finance', 'view')
    and app.can_read_supply_purchase_for(purchase_id, 'finance', 'document_audit_view')
  )
);
