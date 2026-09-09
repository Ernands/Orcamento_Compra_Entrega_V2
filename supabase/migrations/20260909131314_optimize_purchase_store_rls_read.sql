-- Keep purchase destination store reads inside the REST statement timeout even
-- when a consolidated purchase expands to hundreds of store snapshots.
--
-- The purchase id is denormalized here so the RLS policies can use cached
-- permission arrays instead of evaluating permission functions and joins once
-- per snapshot row.

alter table public.supply_purchase_destination_stores
  add column if not exists purchase_id uuid references public.supply_purchases(id) on delete cascade;

update public.supply_purchase_destination_stores snapshot
set purchase_id = item.purchase_id
from public.supply_purchase_destinations destination
join public.supply_purchase_items item on item.id = destination.purchase_item_id
where destination.id = snapshot.purchase_destination_id
  and snapshot.purchase_id is null;

alter table public.supply_purchase_destination_stores
  alter column purchase_id set not null;

create index if not exists supply_purchase_destination_stores_purchase_store_idx
  on public.supply_purchase_destination_stores (purchase_id, store_id);

create or replace function private.set_supply_purchase_destination_store_purchase_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
begin
  select item.purchase_id
  into v_purchase_id
  from public.supply_purchase_destinations destination
  join public.supply_purchase_items item on item.id = destination.purchase_item_id
  where destination.id = new.purchase_destination_id;

  if v_purchase_id is null then
    raise exception 'purchase destination does not exist';
  end if;
  if new.purchase_id is not null and new.purchase_id <> v_purchase_id then
    raise exception 'purchase destination store is outside purchase';
  end if;

  new.purchase_id := v_purchase_id;
  return new;
end;
$$;

revoke all on function private.set_supply_purchase_destination_store_purchase_id()
  from public, anon, authenticated, service_role;

drop trigger if exists supply_purchase_destination_stores_set_purchase_id
  on public.supply_purchase_destination_stores;
create trigger supply_purchase_destination_stores_set_purchase_id
before insert or update of purchase_destination_id, purchase_id
on public.supply_purchase_destination_stores
for each row execute function private.set_supply_purchase_destination_store_purchase_id();

create or replace function app.readable_supply_purchase_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with store_access as materialized (
    select
      store.id as store_id,
      app.can_store('purchases', 'view', store.id) as can_view
    from public.lojas store
    where (select auth.uid()) is not null
  ),
  readable_purchases as (
    select purchase_store.purchase_id
    from public.supply_purchase_stores purchase_store
    join store_access access on access.store_id = purchase_store.store_id
    group by purchase_store.purchase_id
    having bool_and(access.can_view)
  )
  select coalesce(array_agg(readable.purchase_id), array[]::uuid[])
  from readable_purchases readable;
$$;

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
  (select app.can('purchases', 'view'))
  and purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and store_id = any((select app.readable_store_ids('purchases', 'view'))::uuid[])
);

drop policy if exists supply_purchase_destination_stores_read
  on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select
to authenticated
using (
  (select app.can('purchases', 'view'))
  and purchase_id = any((select app.readable_supply_purchase_ids())::uuid[])
  and store_id = any((select app.readable_store_ids('purchases', 'view'))::uuid[])
);
