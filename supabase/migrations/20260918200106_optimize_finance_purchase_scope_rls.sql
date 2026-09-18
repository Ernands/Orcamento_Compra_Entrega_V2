-- Cache the complete purchase scope once per statement. The granular finance
-- policies introduced in 20260918185231 evaluated permission helpers once for
-- every store snapshot, which made the Financeiro loader exceed the REST
-- statement timeout on purchases distributed to many stores.

create or replace function app.readable_supply_purchase_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  with store_access as materialized (
    select
      store.id as store_id,
      app.can_store('purchases', 'view', store.id) as purchases_view,
      app.can_store('finance', 'overview_view', store.id) as finance_overview_view,
      app.can_store('finance', 'store_detail_view', store.id) as finance_store_detail_view,
      app.can_store('finance', 'payments_view', store.id) as finance_payments_view,
      app.can_store('finance', 'stores_ufs_view', store.id) as finance_stores_ufs_view,
      app.can_store('finance', 'reimbursements_view', store.id) as finance_reimbursements_view
    from public.lojas store
    where (select auth.uid()) is not null
  ),
  readable_purchases as (
    select purchase_store.purchase_id
    from public.supply_purchase_stores purchase_store
    join store_access access on access.store_id = purchase_store.store_id
    group by purchase_store.purchase_id
    having
      bool_and(access.purchases_view)
      or bool_and(access.finance_overview_view)
      or bool_and(access.finance_store_detail_view)
      or bool_and(access.finance_payments_view)
      or bool_and(access.finance_stores_ufs_view)
      or bool_and(access.finance_reimbursements_view)
  )
  select coalesce(
    array_agg(readable.purchase_id order by readable.purchase_id),
    array[]::uuid[]
  )
  from readable_purchases readable;
$function$;

revoke all on function app.readable_supply_purchase_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_purchase_ids()
  to authenticated, service_role;

drop policy if exists supply_purchase_stores_read_scoped
  on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped
on public.supply_purchase_stores
for select
to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
);

drop policy if exists supply_purchase_destination_stores_read
  on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select
to authenticated
using (
  purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
);
