-- Compras V2 foundation: immutable execution history, destination snapshots,
-- physical store distribution and compatibility aggregates.
-- Designed to support future Finance and Delivery modules without changing
-- the current quote source of truth.

alter table public.supply_purchase_items
  add column if not exists actual_total numeric(16,2) not null default 0
  check (actual_total >= 0);

update public.supply_purchase_items item
set actual_total = greatest(
  round(item.purchased_quantity * coalesce(item.actual_unit_price, item.quoted_unit_price), 2)
  - item.actual_discount_amount
  + item.actual_shipping_amount
  + item.actual_other_costs,
  0
)
where item.purchased_quantity > 0
  and item.actual_total = 0;

create table if not exists public.supply_purchase_destinations (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid not null references public.supply_purchase_items(id) on delete cascade,
  source_quote_destination_id uuid references public.supply_quote_item_destinations(id) on delete set null,
  destination_type text not null check (destination_type in ('profile', 'store')),
  profile_id uuid references public.supply_freight_profiles(id) on delete set null,
  store_id uuid references public.lojas(id) on delete set null,
  label_snapshot text not null check (length(trim(label_snapshot)) between 2 and 180),
  state_snapshot text not null check (state_snapshot ~ '^[A-Z]{2}$'),
  destination_count integer not null check (destination_count > 0),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 40),
  quoted_shipping_type public.supply_shipping_type not null,
  quoted_shipping_amount numeric(14,2),
  quoted_delivery_days integer check (quoted_delivery_days is null or quoted_delivery_days >= 0),
  notes_snapshot text check (notes_snapshot is null or length(notes_snapshot) <= 2000),
  position integer not null default 0 check (position >= 0),
  distribution_status text not null default 'pending'
    check (distribution_status in ('pending', 'confirmed')),
  snapshot_source text not null default 'approval'
    check (snapshot_source in ('approval', 'backfill_current_quote')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (quoted_shipping_type = 'pending' and quoted_shipping_amount is null)
    or (quoted_shipping_type = 'free' and quoted_shipping_amount = 0)
    or (quoted_shipping_type = 'informed' and quoted_shipping_amount is not null and quoted_shipping_amount > 0)
  ),
  unique (purchase_item_id, position)
);

create index if not exists supply_purchase_destinations_item_idx
  on public.supply_purchase_destinations (purchase_item_id, position);
create index if not exists supply_purchase_destinations_source_quote_idx
  on public.supply_purchase_destinations (source_quote_destination_id)
  where source_quote_destination_id is not null;
create index if not exists supply_purchase_destinations_profile_idx
  on public.supply_purchase_destinations (profile_id)
  where profile_id is not null;
create index if not exists supply_purchase_destinations_store_idx
  on public.supply_purchase_destinations (store_id)
  where store_id is not null;

create table if not exists public.supply_purchase_destination_stores (
  id uuid primary key default gen_random_uuid(),
  purchase_destination_id uuid not null references public.supply_purchase_destinations(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null check (store_state_snapshot ~ '^[A-Z]{2}$'),
  allocated_quantity numeric(14,3) check (allocated_quantity is null or allocated_quantity >= 0),
  allocation_source text not null default 'pending'
    check (allocation_source in ('pending', 'direct', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_destination_id, store_id)
);

create index if not exists supply_purchase_destination_stores_store_idx
  on public.supply_purchase_destination_stores (store_id);

create table if not exists public.supply_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete cascade,
  purchased_on date not null default current_date,
  supplier_order_ref text check (supplier_order_ref is null or length(trim(supplier_order_ref)) <= 200),
  expected_delivery_date date,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'legacy_backfill')),
  notes text check (notes is null or length(notes) <= 3000),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_by uuid references public.usuarios(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or length(cancellation_reason) <= 1000),
  check (expected_delivery_date is null or expected_delivery_date >= purchased_on),
  check (
    (status = 'active' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create index if not exists supply_purchase_orders_purchase_idx
  on public.supply_purchase_orders (purchase_id, purchased_on desc, created_at desc);
create index if not exists supply_purchase_orders_status_idx
  on public.supply_purchase_orders (purchase_id, status);
create index if not exists supply_purchase_orders_created_by_idx
  on public.supply_purchase_orders (created_by)
  where created_by is not null;
create index if not exists supply_purchase_orders_cancelled_by_idx
  on public.supply_purchase_orders (cancelled_by)
  where cancelled_by is not null;
create index if not exists supply_purchase_orders_expected_delivery_idx
  on public.supply_purchase_orders (expected_delivery_date)
  where status = 'active' and expected_delivery_date is not null;
create unique index if not exists supply_purchase_orders_legacy_uidx
  on public.supply_purchase_orders (purchase_id)
  where source = 'legacy_backfill';

create table if not exists public.supply_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.supply_purchase_orders(id) on delete cascade,
  purchase_item_id uuid references public.supply_purchase_items(id) on delete set null,
  purchase_destination_id uuid references public.supply_purchase_destinations(id) on delete set null,
  item_code_snapshot text not null,
  item_name_snapshot text not null,
  destination_label_snapshot text,
  destination_state_snapshot text check (
    destination_state_snapshot is null or destination_state_snapshot ~ '^[A-Z]{2}$'
  ),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 40),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  shipping_amount numeric(14,2) not null default 0 check (shipping_amount >= 0),
  other_costs numeric(14,2) not null default 0 check (other_costs >= 0),
  line_total numeric(16,2) generated always as (
    greatest(round(quantity * unit_price, 2) - discount_amount + shipping_amount + other_costs, 0)
  ) stored,
  expected_delivery_date date,
  notes text check (notes is null or length(notes) <= 3000),
  created_at timestamptz not null default now(),
  check (discount_amount <= round(quantity * unit_price, 2))
);

create index if not exists supply_purchase_order_items_order_idx
  on public.supply_purchase_order_items (order_id);
create index if not exists supply_purchase_order_items_purchase_item_idx
  on public.supply_purchase_order_items (purchase_item_id)
  where purchase_item_id is not null;
create index if not exists supply_purchase_order_items_destination_idx
  on public.supply_purchase_order_items (purchase_destination_id)
  where purchase_destination_id is not null;
create index if not exists supply_purchase_order_items_expected_delivery_idx
  on public.supply_purchase_order_items (expected_delivery_date)
  where expected_delivery_date is not null;

create trigger supply_purchase_destinations_set_updated_at
before update on public.supply_purchase_destinations
for each row execute function app.set_updated_at();

create trigger supply_purchase_destination_stores_set_updated_at
before update on public.supply_purchase_destination_stores
for each row execute function app.set_updated_at();

create trigger supply_purchase_orders_set_updated_at
before update on public.supply_purchase_orders
for each row execute function app.set_updated_at();

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
    purchase_store.store_id,
    purchase_store.store_code_snapshot,
    purchase_store.store_name_snapshot,
    purchase_store.store_city_snapshot,
    purchase_store.store_state_snapshot,
    case
      when purchase_destination.destination_type = 'store' then purchase_destination.quantity
      else null
    end,
    case
      when purchase_destination.destination_type = 'store' then 'direct'
      else 'pending'
    end
  from public.supply_purchase_destinations purchase_destination
  join public.supply_purchase_stores purchase_store
    on purchase_store.purchase_id = v_purchase_item.purchase_id
  where purchase_destination.purchase_item_id = v_purchase_item.id
    and (
      (purchase_destination.destination_type = 'store'
        and purchase_destination.store_id = purchase_store.store_id)
      or
      (purchase_destination.destination_type = 'profile'
        and exists (
          select 1
          from public.supply_freight_profile_stores profile_store
          where profile_store.profile_id = purchase_destination.profile_id
            and profile_store.store_id = purchase_store.store_id
        ))
    )
  on conflict (purchase_destination_id, store_id) do nothing;

  if p_snapshot_source = 'approval' and exists (
    select 1
    from public.supply_purchase_destinations destination
    where destination.purchase_item_id = v_purchase_item.id
      and (
        select count(*)
        from public.supply_purchase_destination_stores destination_store
        where destination_store.purchase_destination_id = destination.id
      ) <> destination.destination_count
  ) then
    raise exception 'purchase destination membership changed after quote was saved';
  end if;
end;
$$;

create or replace function private.snapshot_supply_purchase_item_destinations_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.snapshot_supply_purchase_item_destinations(new.id, 'approval');
  return new;
end;
$$;

drop trigger if exists supply_purchase_items_snapshot_destinations on public.supply_purchase_items;
create trigger supply_purchase_items_snapshot_destinations
after insert on public.supply_purchase_items
for each row execute function private.snapshot_supply_purchase_item_destinations_trigger();

-- Backfill destination snapshots for purchases that already exist. These rows are
-- explicitly marked because the current quote is the best available historical source.
do $$
declare
  v_item_id uuid;
begin
  for v_item_id in
    select item.id
    from public.supply_purchase_items item
    where item.source_quote_item_id is not null
      and exists (
        select 1
        from public.supply_quote_item_destinations destination
        where destination.quote_item_id = item.source_quote_item_id
      )
      and not exists (
        select 1
        from public.supply_purchase_destinations snapshot
        where snapshot.purchase_item_id = item.id
      )
  loop
    perform private.snapshot_supply_purchase_item_destinations(v_item_id, 'backfill_current_quote');
  end loop;
end;
$$;