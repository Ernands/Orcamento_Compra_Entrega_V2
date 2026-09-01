alter table public.supply_purchase_order_items
  add column if not exists store_distribution_status text not null default 'pending'
    check (store_distribution_status in ('pending', 'confirmed', 'not_applicable'));

create table if not exists public.supply_purchase_order_line_stores (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references public.supply_purchase_order_items(id) on delete cascade,
  purchase_destination_store_id uuid references public.supply_purchase_destination_stores(id) on delete restrict,
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null check (store_state_snapshot ~ '^[A-Z]{2}$'),
  quantity numeric(14,3) not null check (quantity > 0),
  allocation_source text not null default 'manual' check (allocation_source in ('manual', 'direct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_line_id, store_id)
);

create index if not exists supply_purchase_order_line_stores_line_idx
  on public.supply_purchase_order_line_stores (order_line_id);
create index if not exists supply_purchase_order_line_stores_store_idx
  on public.supply_purchase_order_line_stores (store_id);
create index if not exists supply_purchase_order_line_stores_destination_store_idx
  on public.supply_purchase_order_line_stores (purchase_destination_store_id)
  where purchase_destination_store_id is not null;

create trigger supply_purchase_order_line_stores_set_updated_at
before update on public.supply_purchase_order_line_stores
for each row execute function app.set_updated_at();

alter table public.supply_purchase_order_line_stores enable row level security;

create policy supply_purchase_order_line_stores_read
on public.supply_purchase_order_line_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.id = order_line_id
      and app.can_read_supply_purchase(purchase_order.purchase_id)
  )
  and app.can_store('purchases', 'view', store_id)
);

revoke all on public.supply_purchase_order_line_stores from anon;
revoke insert, update, delete on public.supply_purchase_order_line_stores from authenticated;
grant select on public.supply_purchase_order_line_stores to authenticated;

create or replace function private.auto_allocate_supply_purchase_order_line_store(
  p_order_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.supply_purchase_order_items;
  v_item public.supply_purchase_items;
  v_destination public.supply_purchase_destinations;
  v_purchase_id uuid;
  v_store_id uuid;
  v_destination_store_id uuid;
  v_store_count integer;
begin
  select line.* into v_line
  from public.supply_purchase_order_items line
  where line.id = p_order_line_id;
  if v_line.id is null then return; end if;

  select item.* into v_item
  from public.supply_purchase_items item
  where item.id = v_line.purchase_item_id;
  if v_item.id is null then return; end if;
  v_purchase_id := v_item.purchase_id;

  if v_line.purchase_destination_id is not null then
    select destination.* into v_destination
    from public.supply_purchase_destinations destination
    where destination.id = v_line.purchase_destination_id;

    if v_destination.destination_type = 'store' then
      select destination_store.id, destination_store.store_id
      into v_destination_store_id, v_store_id
      from public.supply_purchase_destination_stores destination_store
      where destination_store.purchase_destination_id = v_destination.id
      limit 1;
    else
      update public.supply_purchase_order_items
      set store_distribution_status = 'pending'
      where id = p_order_line_id;
      return;
    end if;
  elsif v_item.store_id is not null then
    v_store_id := v_item.store_id;
  else
    select count(*), min(store_id)
    into v_store_count, v_store_id
    from public.supply_purchase_stores
    where purchase_id = v_purchase_id;

    if v_store_count <> 1 then
      update public.supply_purchase_order_items
      set store_distribution_status = 'pending'
      where id = p_order_line_id;
      return;
    end if;
  end if;

  insert into public.supply_purchase_order_line_stores (
    order_line_id,
    purchase_destination_store_id,
    store_id,
    store_code_snapshot,
    store_name_snapshot,
    store_city_snapshot,
    store_state_snapshot,
    quantity,
    allocation_source
  )
  select
    p_order_line_id,
    v_destination_store_id,
    store.id,
    store.codigo_negocio,
    store.nome,
    store.cidade,
    store.uf,
    v_line.quantity,
    'direct'
  from public.lojas store
  where store.id = v_store_id;

  update public.supply_purchase_order_items
  set store_distribution_status = 'confirmed'
  where id = p_order_line_id;
end;
$$;

create or replace function private.auto_allocate_supply_purchase_order_line_store_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.auto_allocate_supply_purchase_order_line_store(new.id);
  return new;
end;
$$;

drop trigger if exists supply_purchase_order_items_auto_store_distribution on public.supply_purchase_order_items;
create trigger supply_purchase_order_items_auto_store_distribution
after insert on public.supply_purchase_order_items
for each row execute function private.auto_allocate_supply_purchase_order_line_store_trigger();

create or replace function public.save_supply_purchase_order_line_distribution(
  p_order_line_id uuid,
  p_allocations jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.supply_purchase_order_items;
  v_order public.supply_purchase_orders;
  v_item public.supply_purchase_items;
  v_destination public.supply_purchase_destinations;
  v_actor uuid := app.current_usuario_id();
  v_allocation jsonb;
  v_store_id uuid;
  v_quantity numeric(14,3);
  v_sum numeric(14,3) := 0;
  v_destination_store public.supply_purchase_destination_stores;
  v_existing_destination_store_quantity numeric(14,3);
  v_status text;
begin
  select line.* into v_line
  from public.supply_purchase_order_items line
  where line.id = p_order_line_id
  for update;
  if v_line.id is null then raise exception 'purchase order line not found'; end if;

  select purchase_order.* into v_order
  from public.supply_purchase_orders purchase_order
  where purchase_order.id = v_line.order_id
  for update;
  if v_order.id is null or not app.can_edit_supply_purchase(v_order.purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_order.status <> 'active' then raise exception 'purchase order is closed'; end if;

  select item.* into v_item
  from public.supply_purchase_items item
  where item.id = v_line.purchase_item_id;
  if v_item.id is null then raise exception 'purchase item not found'; end if;

  if v_line.store_distribution_status = 'confirmed'
     and exists (
       select 1 from public.supply_purchase_order_line_stores line_store
       where line_store.order_line_id = p_order_line_id
         and line_store.allocation_source = 'direct'
     ) then
    raise exception 'direct store distribution cannot be changed';
  end if;

  if jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'purchase order line allocations must be an array';
  end if;
  if exists (
    select 1
    from (
      select nullif(value ->> 'store_id', '')::uuid as store_id, count(*)
      from jsonb_array_elements(p_allocations)
      group by nullif(value ->> 'store_id', '')::uuid
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'purchase order line allocation has duplicate stores';
  end if;

  if v_line.purchase_destination_id is not null then
    select destination.* into v_destination
    from public.supply_purchase_destinations destination
    where destination.id = v_line.purchase_destination_id;
    if v_destination.id is null then raise exception 'purchase destination not found'; end if;
    if v_destination.destination_type = 'profile' and v_destination.distribution_status <> 'confirmed' then
      raise exception 'purchase destination store distribution must be confirmed first';
    end if;
  else
    v_destination := null;
  end if;

  delete from public.supply_purchase_order_line_stores
  where order_line_id = p_order_line_id
    and allocation_source = 'manual';

  for v_allocation in select value from jsonb_array_elements(p_allocations)
  loop
    v_store_id := nullif(v_allocation ->> 'store_id', '')::uuid;
    v_quantity := coalesce(nullif(private.normalize_decimal_input(v_allocation ->> 'quantity'), '')::numeric, 0);
    if v_store_id is null or v_quantity < 0 then
      raise exception 'invalid purchase order line allocation';
    end if;
    if v_quantity = 0 then continue; end if;

    if v_destination.id is not null then
      select destination_store.* into v_destination_store
      from public.supply_purchase_destination_stores destination_store
      where destination_store.purchase_destination_id = v_destination.id
        and destination_store.store_id = v_store_id;
      if v_destination_store.id is null then
        raise exception 'allocation store is outside purchase destination';
      end if;
      if v_destination_store.allocated_quantity is null then
        raise exception 'purchase destination store quantity is not defined';
      end if;

      select coalesce(sum(line_store.quantity), 0)
      into v_existing_destination_store_quantity
      from public.supply_purchase_order_line_stores line_store
      join public.supply_purchase_order_items other_line on other_line.id = line_store.order_line_id
      join public.supply_purchase_orders other_order on other_order.id = other_line.order_id
      where line_store.purchase_destination_store_id = v_destination_store.id
        and other_order.status = 'active'
        and line_store.order_line_id <> p_order_line_id;

      if v_existing_destination_store_quantity + v_quantity > v_destination_store.allocated_quantity + 0.001 then
        raise exception 'store allocation exceeds destination store quantity';
      end if;
    else
      if not exists (
        select 1 from public.supply_purchase_stores purchase_store
        where purchase_store.purchase_id = v_order.purchase_id
          and purchase_store.store_id = v_store_id
      ) then
        raise exception 'allocation store is outside purchase';
      end if;
      v_destination_store := null;
    end if;

    insert into public.supply_purchase_order_line_stores (
      order_line_id,
      purchase_destination_store_id,
      store_id,
      store_code_snapshot,
      store_name_snapshot,
      store_city_snapshot,
      store_state_snapshot,
      quantity,
      allocation_source
    )
    select
      p_order_line_id,
      case when v_destination.id is null then null else v_destination_store.id end,
      store.id,
      store.codigo_negocio,
      store.nome,
      store.cidade,
      store.uf,
      v_quantity,
      'manual'
    from public.lojas store
    where store.id = v_store_id;

    v_sum := v_sum + v_quantity;
  end loop;

  select coalesce(sum(line_store.quantity), 0)
  into v_sum
  from public.supply_purchase_order_line_stores line_store
  where line_store.order_line_id = p_order_line_id;

  v_status := case when abs(v_sum - v_line.quantity) <= 0.001 then 'confirmed' else 'pending' end;
  if v_sum > v_line.quantity + 0.001 then
    raise exception 'store allocation exceeds purchase order line quantity';
  end if;

  update public.supply_purchase_order_items
  set store_distribution_status = v_status
  where id = p_order_line_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.order_line.distribution_saved',
    'supply_purchase_order_item',
    p_order_line_id,
    jsonb_build_object(
      'purchase_id', v_order.purchase_id,
      'distribution_status', v_status,
      'allocated_quantity', v_sum,
      'line_quantity', v_line.quantity
    ),
    'database'
  );

  return v_status;
end;
$$;

revoke execute on function public.save_supply_purchase_order_line_distribution(uuid, jsonb) from public, anon;
grant execute on function public.save_supply_purchase_order_line_distribution(uuid, jsonb) to authenticated;

create or replace function private.validate_supply_purchase_destination_allocation_against_orders(
  p_purchase_destination_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_violation boolean;
begin
  select exists (
    select 1
    from public.supply_purchase_destination_stores destination_store
    where destination_store.purchase_destination_id = p_purchase_destination_id
      and destination_store.allocated_quantity is not null
      and coalesce((
        select sum(line_store.quantity)
        from public.supply_purchase_order_line_stores line_store
        join public.supply_purchase_order_items line on line.id = line_store.order_line_id
        join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
        where line_store.purchase_destination_store_id = destination_store.id
          and purchase_order.status = 'active'
      ), 0) > destination_store.allocated_quantity + 0.001
  ) into v_violation;

  if v_violation then
    raise exception 'destination distribution is below quantities already assigned to purchase orders';
  end if;
end;
$$;

-- Rebuild save RPC with a post-save guard against physical order allocations.
create or replace function public.save_supply_purchase_destination_distribution(
  p_purchase_destination_id uuid,
  p_allocations jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destination public.supply_purchase_destinations;
  v_purchase_id uuid;
  v_purchase_status text;
  v_actor uuid := app.current_usuario_id();
  v_allocation jsonb;
  v_store_id uuid;
  v_quantity numeric(14,3);
  v_non_null_count integer;
  v_member_count integer;
  v_sum numeric(14,3);
  v_status text;
begin
  select destination.*
  into v_destination
  from public.supply_purchase_destinations destination
  where destination.id = p_purchase_destination_id
  for update;

  if v_destination.id is not null then
    select item.purchase_id
    into v_purchase_id
    from public.supply_purchase_items item
    where item.id = v_destination.purchase_item_id;
  end if;

  if v_destination.id is null or not app.can_edit_supply_purchase(v_purchase_id) then
    raise exception 'permission denied';
  end if;

  select purchase.status into v_purchase_status
  from public.supply_purchases purchase
  where purchase.id = v_purchase_id;

  if v_purchase_status in ('returned', 'cancelled') then
    raise exception 'purchase is closed';
  end if;
  if v_destination.destination_type = 'store' then
    raise exception 'direct store destination is already distributed';
  end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'purchase destination allocations must be an array';
  end if;
  if exists (
    select 1
    from (
      select nullif(value ->> 'store_id', '')::uuid as store_id, count(*)
      from jsonb_array_elements(p_allocations)
      group by nullif(value ->> 'store_id', '')::uuid
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'purchase destination allocation has duplicate stores';
  end if;

  for v_allocation in select value from jsonb_array_elements(p_allocations)
  loop
    v_store_id := nullif(v_allocation ->> 'store_id', '')::uuid;
    if v_store_id is null or not exists (
      select 1
      from public.supply_purchase_destination_stores destination_store
      where destination_store.purchase_destination_id = p_purchase_destination_id
        and destination_store.store_id = v_store_id
    ) then
      raise exception 'allocation store is outside purchase destination';
    end if;

    if nullif(trim(v_allocation ->> 'quantity'), '') is null then
      update public.supply_purchase_destination_stores
      set allocated_quantity = null,
          allocation_source = 'pending'
      where purchase_destination_id = p_purchase_destination_id
        and store_id = v_store_id;
    else
      v_quantity := private.normalize_decimal_input(v_allocation ->> 'quantity')::numeric;
      if v_quantity < 0 then
        raise exception 'allocation quantity cannot be negative';
      end if;

      update public.supply_purchase_destination_stores
      set allocated_quantity = v_quantity,
          allocation_source = 'manual'
      where purchase_destination_id = p_purchase_destination_id
        and store_id = v_store_id;
    end if;
  end loop;

  perform private.validate_supply_purchase_destination_allocation_against_orders(p_purchase_destination_id);

  select
    count(*),
    count(*) filter (where allocated_quantity is not null),
    coalesce(sum(allocated_quantity), 0)
  into v_member_count, v_non_null_count, v_sum
  from public.supply_purchase_destination_stores
  where purchase_destination_id = p_purchase_destination_id;

  if v_sum > v_destination.quantity + 0.001 then
    raise exception 'allocated quantity exceeds purchase destination quantity';
  end if;

  v_status := case
    when v_member_count > 0
      and v_non_null_count = v_member_count
      and abs(v_sum - v_destination.quantity) <= 0.001
      then 'confirmed'
    else 'pending'
  end;

  update public.supply_purchase_destinations
  set distribution_status = v_status
  where id = p_purchase_destination_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.destination.distribution_saved',
    'supply_purchase_destination',
    p_purchase_destination_id,
    jsonb_build_object(
      'purchase_id', v_purchase_id,
      'distribution_status', v_status,
      'allocated_quantity', v_sum,
      'destination_quantity', v_destination.quantity
    ),
    'database'
  );

  return v_status;
end;
$$;

revoke execute on function public.save_supply_purchase_destination_distribution(uuid, jsonb) from public, anon;
grant execute on function public.save_supply_purchase_destination_distribution(uuid, jsonb) to authenticated;
