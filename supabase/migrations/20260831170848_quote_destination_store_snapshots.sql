create table if not exists public.supply_quote_item_destination_stores (
  id uuid primary key default gen_random_uuid(),
  quote_destination_id uuid not null references public.supply_quote_item_destinations(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null check (store_state_snapshot ~ '^[A-Z]{2}$'),
  snapshot_source text not null default 'save'
    check (snapshot_source in ('save', 'backfill_current_profile')),
  created_at timestamptz not null default now(),
  unique (quote_destination_id, store_id)
);

create index if not exists supply_quote_item_destination_stores_store_idx
  on public.supply_quote_item_destination_stores (store_id);

alter table public.supply_quote_item_destination_stores enable row level security;

drop policy if exists supply_quote_item_destination_stores_read on public.supply_quote_item_destination_stores;
create policy supply_quote_item_destination_stores_read
on public.supply_quote_item_destination_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_quote_item_destinations destination
    join public.supply_quote_items item on item.id = destination.quote_item_id
    where destination.id = quote_destination_id
      and app.can_read_supply_quote(item.quote_id)
      and app.can_store('quotes', 'view', public.supply_quote_item_destination_stores.store_id)
  )
);

revoke all on public.supply_quote_item_destination_stores from public, anon, authenticated;
grant select on public.supply_quote_item_destination_stores to authenticated;

create or replace function private.snapshot_supply_quote_destination_stores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.destination_type = 'store' then
    insert into public.supply_quote_item_destination_stores (
      quote_destination_id,
      store_id,
      store_code_snapshot,
      store_name_snapshot,
      store_city_snapshot,
      store_state_snapshot,
      snapshot_source
    )
    select new.id, store.id, store.codigo_negocio, store.nome, store.cidade, store.uf, 'save'
    from public.lojas store
    where store.id = new.store_id;
  else
    insert into public.supply_quote_item_destination_stores (
      quote_destination_id,
      store_id,
      store_code_snapshot,
      store_name_snapshot,
      store_city_snapshot,
      store_state_snapshot,
      snapshot_source
    )
    select new.id, store.id, store.codigo_negocio, store.nome, store.cidade, store.uf, 'save'
    from public.supply_freight_profile_stores profile_store
    join public.lojas store on store.id = profile_store.store_id
    join public.supply_quote_stores quote_store
      on quote_store.store_id = store.id
    join public.supply_quote_items item
      on item.id = new.quote_item_id
     and quote_store.quote_id = item.quote_id
    where profile_store.profile_id = new.profile_id;
  end if;

  if (select count(*) from public.supply_quote_item_destination_stores snapshot where snapshot.quote_destination_id = new.id)
     <> new.destination_count then
    raise exception 'freight destination store snapshot count does not match destination count';
  end if;

  return new;
end;
$$;

drop trigger if exists supply_quote_item_destinations_snapshot_stores on public.supply_quote_item_destinations;
create trigger supply_quote_item_destinations_snapshot_stores
after insert on public.supply_quote_item_destinations
for each row execute function private.snapshot_supply_quote_destination_stores();

-- Existing destinations did not have member snapshots. Backfill them explicitly
-- as reconstructed historical data so reports can distinguish provenance.
insert into public.supply_quote_item_destination_stores (
  quote_destination_id,
  store_id,
  store_code_snapshot,
  store_name_snapshot,
  store_city_snapshot,
  store_state_snapshot,
  snapshot_source
)
select
  destination.id,
  store.id,
  store.codigo_negocio,
  store.nome,
  store.cidade,
  store.uf,
  'backfill_current_profile'
from public.supply_quote_item_destinations destination
join public.supply_quote_items item on item.id = destination.quote_item_id
join public.supply_quote_stores quote_store on quote_store.quote_id = item.quote_id
join public.lojas store on store.id = quote_store.store_id
where (
  (destination.destination_type = 'store' and store.id = destination.store_id)
  or
  (destination.destination_type = 'profile' and exists (
    select 1
    from public.supply_freight_profile_stores profile_store
    where profile_store.profile_id = destination.profile_id
      and profile_store.store_id = store.id
  ))
)
and not exists (
  select 1
  from public.supply_quote_item_destination_stores snapshot
  where snapshot.quote_destination_id = destination.id
    and snapshot.store_id = store.id
);

create or replace function private.snapshot_supply_purchase_item_destinations(
  p_purchase_item_id uuid,
  p_snapshot_source text default 'approval'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_item public.supply_purchase_items;
begin
  if p_snapshot_source not in ('approval', 'backfill_current_quote') then
    raise exception 'invalid purchase destination snapshot source';
  end if;

  select * into v_purchase_item
  from public.supply_purchase_items
  where id = p_purchase_item_id;

  if v_purchase_item.id is null or v_purchase_item.source_quote_item_id is null then
    return;
  end if;

  insert into public.supply_purchase_destinations (
    purchase_item_id,
    source_quote_destination_id,
    destination_type,
    profile_id,
    store_id,
    label_snapshot,
    state_snapshot,
    destination_count,
    quantity,
    unit,
    quoted_shipping_type,
    quoted_shipping_amount,
    quoted_delivery_days,
    notes_snapshot,
    position,
    distribution_status,
    snapshot_source
  )
  select
    v_purchase_item.id,
    destination.id,
    destination.destination_type,
    destination.profile_id,
    destination.store_id,
    destination.label_snapshot,
    destination.state_snapshot,
    destination.destination_count,
    destination.quantity,
    destination.unit,
    destination.shipping_type,
    destination.shipping_amount,
    destination.delivery_days,
    destination.notes,
    destination.position,
    case when destination.destination_type = 'store' then 'confirmed' else 'pending' end,
    p_snapshot_source
  from public.supply_quote_item_destinations destination
  where destination.quote_item_id = v_purchase_item.source_quote_item_id
    and not exists (
      select 1
      from public.supply_purchase_destinations existing
      where existing.purchase_item_id = v_purchase_item.id
        and existing.position = destination.position
    );

  insert into public.supply_purchase_destination_stores (
    purchase_destination_id,
    store_id,
    store_code_snapshot,
    store_name_snapshot,
    store_city_snapshot,
    store_state_snapshot,
    allocated_quantity,
    allocation_source
  )
  select
    purchase_destination.id,
    quote_store_snapshot.store_id,
    quote_store_snapshot.store_code_snapshot,
    quote_store_snapshot.store_name_snapshot,
    quote_store_snapshot.store_city_snapshot,
    quote_store_snapshot.store_state_snapshot,
    case
      when purchase_destination.destination_type = 'store' then purchase_destination.quantity
      else null
    end,
    case
      when purchase_destination.destination_type = 'store' then 'direct'
      else 'pending'
    end
  from public.supply_purchase_destinations purchase_destination
  join public.supply_quote_item_destination_stores quote_store_snapshot
    on quote_store_snapshot.quote_destination_id = purchase_destination.source_quote_destination_id
  join public.supply_purchase_stores purchase_store
    on purchase_store.purchase_id = v_purchase_item.purchase_id
   and purchase_store.store_id = quote_store_snapshot.store_id
  where purchase_destination.purchase_item_id = v_purchase_item.id
  on conflict (purchase_destination_id, store_id) do nothing;

  if exists (
    select 1
    from public.supply_purchase_destinations destination
    where destination.purchase_item_id = v_purchase_item.id
      and (
        select count(*)
        from public.supply_purchase_destination_stores destination_store
        where destination_store.purchase_destination_id = destination.id
      ) <> destination.destination_count
  ) then
    raise exception 'purchase destination store snapshot is incomplete';
  end if;
end;
$$;