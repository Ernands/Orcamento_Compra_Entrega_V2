-- Keep quote destination store reads inside the REST statement timeout even
-- when a consolidated quote expands to thousands of store snapshots.
--
-- The quote id is denormalized here so the RLS policy can use two cached arrays
-- instead of evaluating permission functions and joins once per snapshot row.

alter table public.supply_quote_item_destination_stores
  add column if not exists quote_id uuid references public.supply_quotes(id) on delete cascade;

update public.supply_quote_item_destination_stores snapshot
set quote_id = item.quote_id
from public.supply_quote_item_destinations destination
join public.supply_quote_items item on item.id = destination.quote_item_id
where destination.id = snapshot.quote_destination_id
  and snapshot.quote_id is null;

alter table public.supply_quote_item_destination_stores
  alter column quote_id set not null;

create index if not exists supply_quote_item_destination_stores_quote_store_idx
  on public.supply_quote_item_destination_stores (quote_id, store_id);

create or replace function private.set_supply_quote_destination_store_quote_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
begin
  select item.quote_id
  into v_quote_id
  from public.supply_quote_item_destinations destination
  join public.supply_quote_items item on item.id = destination.quote_item_id
  where destination.id = new.quote_destination_id;

  if v_quote_id is null then
    raise exception 'quote destination does not exist';
  end if;
  if new.quote_id is not null and new.quote_id <> v_quote_id then
    raise exception 'quote destination store is outside quote';
  end if;

  new.quote_id := v_quote_id;
  return new;
end;
$$;

revoke all on function private.set_supply_quote_destination_store_quote_id()
  from public, anon, authenticated, service_role;

drop trigger if exists supply_quote_destination_stores_set_quote_id
  on public.supply_quote_item_destination_stores;
create trigger supply_quote_destination_stores_set_quote_id
before insert or update of quote_destination_id, quote_id
on public.supply_quote_item_destination_stores
for each row execute function private.set_supply_quote_destination_store_quote_id();

create or replace function app.readable_supply_quote_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with store_access as materialized (
    select
      store.id as store_id,
      app.can_store('quotes', 'view', store.id) as can_view
    from public.lojas store
    where (select auth.uid()) is not null
  ),
  readable_quotes as (
    select quote_store.quote_id
    from public.supply_quote_stores quote_store
    join store_access access on access.store_id = quote_store.store_id
    group by quote_store.quote_id
    having bool_and(access.can_view)
  )
  select coalesce(array_agg(readable.quote_id), array[]::uuid[])
  from readable_quotes readable;
$$;

revoke all on function app.readable_supply_quote_ids()
  from public, anon, authenticated, service_role;
grant execute on function app.readable_supply_quote_ids()
  to authenticated, service_role;

create or replace function app.readable_store_ids(
  p_module_key text,
  p_action_key text
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(store.id order by store.id), array[]::uuid[])
  from public.lojas store
  where (select auth.uid()) is not null
    and app.can_store(p_module_key, p_action_key, store.id);
$$;

revoke all on function app.readable_store_ids(text, text)
  from public, anon, authenticated, service_role;
grant execute on function app.readable_store_ids(text, text)
  to authenticated, service_role;

drop policy if exists supply_quote_item_destination_stores_read
  on public.supply_quote_item_destination_stores;
create policy supply_quote_item_destination_stores_read
on public.supply_quote_item_destination_stores
for select
to authenticated
using (
  (select app.can('quotes', 'view'))
  and quote_id = any((select app.readable_supply_quote_ids())::uuid[])
  and store_id = any((select app.readable_store_ids('quotes', 'view'))::uuid[])
);
