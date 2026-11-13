-- Expose only fixed store-scope helpers to authenticated users.
-- The generic permission-key matrix remains private.

create or replace function app.readable_purchase_store_ids()
returns uuid[] language sql stable security definer set search_path=''
as $function$
 select private.readable_store_ids_for(array[
  'purchases.view','finance.overview_view','finance.store_detail_view',
  'finance.payments_view','finance.payments_consolidated_view',
  'finance.stores_ufs_view','finance.reimbursements_view'
 ]::text[]);
$function$;
revoke all on function app.readable_purchase_store_ids() from public,anon,authenticated,service_role;
grant execute on function app.readable_purchase_store_ids() to authenticated,service_role;

create or replace function app.readable_order_line_store_ids()
returns uuid[] language sql stable security definer set search_path=''
as $function$
 select private.readable_store_ids_for(array[
  'purchases.view','finance.overview_view','finance.store_detail_view',
  'finance.payments_view','finance.stores_ufs_view','finance.reimbursements_view'
 ]::text[]);
$function$;
revoke all on function app.readable_order_line_store_ids() from public,anon,authenticated,service_role;
grant execute on function app.readable_order_line_store_ids() to authenticated,service_role;

create or replace function app.readable_attachment_store_ids()
returns uuid[] language sql stable security definer set search_path=''
as $function$
 select private.readable_store_ids_for(array[
  'purchases.view','finance.store_detail_documents_view'
 ]::text[]);
$function$;
revoke all on function app.readable_attachment_store_ids() from public,anon,authenticated,service_role;
grant execute on function app.readable_attachment_store_ids() to authenticated,service_role;

create or replace function app.readable_audit_store_ids()
returns uuid[] language sql stable security definer set search_path=''
as $function$
 select private.readable_store_ids_for(array['finance.document_audit_view']::text[]);
$function$;
revoke all on function app.readable_audit_store_ids() from public,anon,authenticated,service_role;
grant execute on function app.readable_audit_store_ids() to authenticated,service_role;

drop policy if exists supply_purchase_stores_read_scoped on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped on public.supply_purchase_stores
for select to authenticated
using (
 purchase_id=any((select app.readable_supply_purchase_ids())::uuid[])
 and store_id=any((select app.readable_purchase_store_ids())::uuid[])
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read on public.supply_purchase_destination_stores
for select to authenticated
using (
 purchase_id=any((select app.readable_supply_purchase_ids())::uuid[])
 and store_id=any((select app.readable_purchase_store_ids())::uuid[])
);

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores
for select to authenticated
using (
 exists (
  select 1 from public.supply_purchase_order_items line
  join public.supply_purchase_orders purchase_order on purchase_order.id=line.order_id
  where line.id=supply_purchase_order_line_stores.order_line_id
    and purchase_order.purchase_id=any((select app.readable_supply_purchase_ids())::uuid[])
 )
 and store_id=any((select app.readable_order_line_store_ids())::uuid[])
);

drop policy if exists supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores;
create policy supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores
for select to authenticated
using (
 exists (
  select 1 from public.supply_purchase_attachments attachment
  where attachment.id=supply_purchase_attachment_stores.attachment_id
    and attachment.purchase_id=any((select app.readable_supply_purchase_attachment_ids())::uuid[])
 )
 and store_id=any((select app.readable_attachment_store_ids())::uuid[])
);

drop policy if exists audit_supply_purchase_stores_select on public.supply_purchase_stores;
create policy audit_supply_purchase_stores_select on public.supply_purchase_stores
for select to authenticated
using (
 (select app.can('finance','view'))
 and store_id=any((select app.readable_audit_store_ids())::uuid[])
);

drop policy if exists audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores;
create policy audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores
for select to authenticated
using (
 (select app.can('finance','view'))
 and store_id=any((select app.readable_audit_store_ids())::uuid[])
);

drop policy if exists audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores;
create policy audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores
for select to authenticated
using (
 (select app.can('finance','view'))
 and store_id=any((select app.readable_audit_store_ids())::uuid[])
);

drop function if exists app.readable_store_ids_for(text[]);
