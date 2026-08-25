alter table public.supply_quote_items
  add column if not exists position integer;

with ranked as (
  select
    id,
    row_number() over (partition by quote_id order by created_at, id) - 1 as position
  from public.supply_quote_items
)
update public.supply_quote_items item
set position = ranked.position
from ranked
where ranked.id = item.id
  and item.position is null;

create or replace function private.assign_supply_quote_item_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(item.position) + 1, 0)
    into new.position
    from public.supply_quote_items item
    where item.quote_id = new.quote_id;
  end if;
  return new;
end;
$$;

drop trigger if exists supply_quote_items_assign_position on public.supply_quote_items;
create trigger supply_quote_items_assign_position
before insert on public.supply_quote_items
for each row execute function private.assign_supply_quote_item_position();

alter table public.supply_quote_items
  alter column position set not null;

create unique index if not exists supply_quote_items_quote_position_uidx
  on public.supply_quote_items (quote_id, position);

create table if not exists public.supply_freight_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, state)
);

create table if not exists public.supply_freight_profile_stores (
  profile_id uuid not null references public.supply_freight_profiles(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, store_id)
);

create index if not exists supply_freight_profile_stores_store_idx
  on public.supply_freight_profile_stores (store_id);

create table if not exists public.supply_quote_item_destinations (
  id uuid primary key default gen_random_uuid(),
  quote_item_id uuid not null references public.supply_quote_items(id) on delete cascade,
  destination_type text not null check (destination_type in ('profile', 'store')),
  profile_id uuid references public.supply_freight_profiles(id) on delete restrict,
  store_id uuid references public.lojas(id) on delete restrict,
  label_snapshot text not null check (length(trim(label_snapshot)) between 2 and 180),
  state_snapshot text not null check (state_snapshot ~ '^[A-Z]{2}$'),
  destination_count integer not null default 1 check (destination_count > 0),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 30),
  shipping_type public.supply_shipping_type not null default 'pending',
  shipping_amount numeric(14,2),
  delivery_days integer check (delivery_days is null or delivery_days >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (destination_type = 'profile' and profile_id is not null and store_id is null)
    or (destination_type = 'store' and store_id is not null and profile_id is null)
  ),
  check (
    (shipping_type = 'pending' and shipping_amount is null)
    or (shipping_type = 'free' and shipping_amount = 0)
    or (shipping_type = 'informed' and shipping_amount is not null and shipping_amount > 0)
  )
);

create index if not exists supply_quote_item_destinations_item_idx
  on public.supply_quote_item_destinations (quote_item_id, position);
create index if not exists supply_quote_item_destinations_profile_idx
  on public.supply_quote_item_destinations (profile_id)
  where profile_id is not null;
create index if not exists supply_quote_item_destinations_store_idx
  on public.supply_quote_item_destinations (store_id)
  where store_id is not null;
create unique index if not exists supply_quote_item_destinations_profile_uidx
  on public.supply_quote_item_destinations (quote_item_id, profile_id)
  where profile_id is not null;
create unique index if not exists supply_quote_item_destinations_store_uidx
  on public.supply_quote_item_destinations (quote_item_id, store_id)
  where store_id is not null;

create trigger supply_freight_profiles_set_updated_at
before update on public.supply_freight_profiles
for each row execute function app.set_updated_at();

create trigger supply_quote_item_destinations_set_updated_at
before update on public.supply_quote_item_destinations
for each row execute function app.set_updated_at();

alter table public.supply_freight_profiles enable row level security;
alter table public.supply_freight_profile_stores enable row level security;
alter table public.supply_quote_item_destinations enable row level security;

drop policy if exists supply_freight_profiles_read on public.supply_freight_profiles;
create policy supply_freight_profiles_read
on public.supply_freight_profiles
for select
to authenticated
using (app.can('quotes', 'view'));

drop policy if exists supply_freight_profile_stores_read on public.supply_freight_profile_stores;
create policy supply_freight_profile_stores_read
on public.supply_freight_profile_stores
for select
to authenticated
using (
  app.can('quotes', 'view')
  and app.can_store('quotes', 'view', store_id)
);

drop policy if exists supply_quote_item_destinations_read on public.supply_quote_item_destinations;
create policy supply_quote_item_destinations_read
on public.supply_quote_item_destinations
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_quote_items item
    where item.id = quote_item_id
      and app.can_read_supply_quote(item.quote_id)
  )
  and (store_id is null or app.can_store('quotes', 'view', store_id))
);

revoke all on public.supply_freight_profiles from anon;
revoke all on public.supply_freight_profile_stores from anon;
revoke all on public.supply_quote_item_destinations from anon;
grant select on public.supply_freight_profiles to authenticated;
grant select on public.supply_freight_profile_stores to authenticated;
grant select on public.supply_quote_item_destinations to authenticated;

insert into public.supply_freight_profiles (name, state, position)
values
  ('Valter Leandro', 'PE', 10),
  ('Joseney Feitosa', 'PB', 20),
  ('Geruza de Queiroz', 'RN', 30),
  ('Charles Pitter', 'MG', 40),
  ('João Henrique', 'CE', 50)
on conflict (name, state) do update
set position = excluded.position,
    active = true;

insert into public.supply_freight_profile_stores (profile_id, store_id)
select profile.id, store.id
from public.supply_freight_profiles profile
join public.lojas store on store.uf = profile.state
where profile.name in (
  'Valter Leandro',
  'Joseney Feitosa',
  'Geruza de Queiroz',
  'Charles Pitter',
  'João Henrique'
)
  and store.codigo_negocio ~ '^LOJ-[0-9]{3}$'
  and substring(store.codigo_negocio from 5)::integer between 1 and 27
on conflict do nothing;

create or replace function public.save_supply_quote_v3(
  p_quote_id uuid,
  p_supplier_id uuid,
  p_supplier_channel_id uuid,
  p_quote_date date,
  p_valid_until date,
  p_contact text,
  p_context_type public.supply_quote_context,
  p_status public.supply_quote_status,
  p_notes text,
  p_store_ids uuid[],
  p_items jsonb,
  p_payment_method text,
  p_entry_amount numeric,
  p_installment_count integer,
  p_payment_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_actor uuid := app.current_usuario_id();
  v_item jsonb;
  v_item_ordinality bigint;
  v_quote_item_id uuid;
  v_item_quantity numeric(14,3);
  v_item_unit text;
  v_item_store_id uuid;
  v_destinations jsonb;
  v_destination jsonb;
  v_destination_ordinality bigint;
  v_destination_type text;
  v_profile_id uuid;
  v_store_id uuid;
  v_label text;
  v_state text;
  v_destination_count integer;
  v_quantity numeric(14,3);
  v_unit text;
  v_shipping_raw text;
  v_shipping_amount numeric(14,2);
  v_shipping_type public.supply_shipping_type;
  v_delivery_days integer;
  v_destination_rows integer := 0;
  v_destination_quantity numeric(14,3);
  v_expected_store_count integer;
  v_covered_store_count integer;
  v_item_store_is_covered boolean;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'quote items must be an array';
  end if;

  v_quote_id := public.save_supply_quote_v2(
    p_quote_id,
    p_supplier_id,
    p_supplier_channel_id,
    p_quote_date,
    p_valid_until,
    p_contact,
    p_context_type,
    p_status,
    p_notes,
    p_store_ids,
    p_items,
    p_payment_method,
    p_entry_amount,
    p_installment_count,
    p_payment_notes
  );

  for v_item, v_item_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_items) with ordinality
  loop
    select item.id, item.quantity, item.unit, item.store_id
    into v_quote_item_id, v_item_quantity, v_item_unit, v_item_store_id
    from public.supply_quote_items item
    where item.quote_id = v_quote_id
      and item.position = v_item_ordinality - 1;

    if v_quote_item_id is null then
      raise exception 'saved quote item position not found';
    end if;

    v_destinations := coalesce(v_item -> 'destinations', '[]'::jsonb);
    if jsonb_typeof(v_destinations) is distinct from 'array' then
      raise exception 'freight destinations must be an array';
    end if;

    delete from public.supply_quote_item_destinations
    where quote_item_id = v_quote_item_id;

    for v_destination, v_destination_ordinality in
      select value, ordinality
      from jsonb_array_elements(v_destinations) with ordinality
    loop
      v_destination_type := coalesce(nullif(trim(v_destination ->> 'destination_type'), ''), 'profile');
      if v_destination_type not in ('profile', 'store') then
        raise exception 'invalid freight destination type';
      end if;

      v_profile_id := nullif(v_destination ->> 'profile_id', '')::uuid;
      v_store_id := nullif(v_destination ->> 'store_id', '')::uuid;

      if v_destination_type = 'profile' then
        if v_profile_id is null or v_store_id is not null then
          raise exception 'profile freight destination requires a profile only';
        end if;

        select
          profile.name || ' - ' || profile.state,
          profile.state,
          count(profile_store.store_id)::integer
        into v_label, v_state, v_destination_count
        from public.supply_freight_profiles profile
        join public.supply_freight_profile_stores profile_store
          on profile_store.profile_id = profile.id
        join public.supply_quote_stores quote_store
          on quote_store.store_id = profile_store.store_id
         and quote_store.quote_id = v_quote_id
        where profile.id = v_profile_id
          and profile.active
        group by profile.id, profile.name, profile.state;

        if v_label is null or coalesce(v_destination_count, 0) = 0 then
          raise exception 'freight profile is outside quote scope';
        end if;
      else
        if v_store_id is null or v_profile_id is not null then
          raise exception 'store freight destination requires a store only';
        end if;

        select store.codigo_negocio || ' - ' || store.nome, store.uf
        into v_label, v_state
        from public.lojas store
        join public.supply_quote_stores quote_store
          on quote_store.store_id = store.id
         and quote_store.quote_id = v_quote_id
        where store.id = v_store_id;

        if v_label is null then
          raise exception 'freight destination store is outside quote scope';
        end if;
        v_destination_count := 1;
      end if;

      v_quantity := nullif(
        private.normalize_decimal_input(v_destination ->> 'quantity'),
        ''
      )::numeric;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'freight destination quantity must be positive';
      end if;

      v_unit := coalesce(nullif(trim(v_destination ->> 'unit'), ''), v_item_unit);
      v_shipping_raw := nullif(trim(v_destination ->> 'shipping_amount'), '');
      if v_shipping_raw is null then
        v_shipping_type := 'pending';
        v_shipping_amount := null;
      else
        v_shipping_amount := private.normalize_decimal_input(v_shipping_raw)::numeric;
        if v_shipping_amount < 0 then
          raise exception 'freight amount cannot be negative';
        elsif v_shipping_amount = 0 then
          v_shipping_type := 'free';
        else
          v_shipping_type := 'informed';
        end if;
      end if;

      v_delivery_days := nullif(v_destination ->> 'delivery_days', '')::integer;
      if v_delivery_days is not null and v_delivery_days < 0 then
        raise exception 'freight delivery days cannot be negative';
      end if;

      insert into public.supply_quote_item_destinations (
        quote_item_id,
        destination_type,
        profile_id,
        store_id,
        label_snapshot,
        state_snapshot,
        destination_count,
        quantity,
        unit,
        shipping_type,
        shipping_amount,
        delivery_days,
        notes,
        position
      ) values (
        v_quote_item_id,
        v_destination_type,
        v_profile_id,
        v_store_id,
        v_label,
        v_state,
        v_destination_count,
        v_quantity,
        v_unit,
        v_shipping_type,
        v_shipping_amount,
        v_delivery_days,
        nullif(trim(v_destination ->> 'notes'), ''),
        v_destination_ordinality - 1
      );

      v_destination_rows := v_destination_rows + 1;
    end loop;

    if jsonb_array_length(v_destinations) > 0 then
      select coalesce(sum(destination.quantity), 0)
      into v_destination_quantity
      from public.supply_quote_item_destinations destination
      where destination.quote_item_id = v_quote_item_id;

      if abs(v_destination_quantity - v_item_quantity) > 0.001 then
        raise exception 'freight destination quantities must equal quote item quantity';
      end if;

      if exists (
        select 1
        from public.supply_quote_item_destinations profile_destination
        join public.supply_freight_profile_stores profile_store
          on profile_store.profile_id = profile_destination.profile_id
        join public.supply_quote_item_destinations store_destination
          on store_destination.quote_item_id = profile_destination.quote_item_id
         and store_destination.store_id = profile_store.store_id
        where profile_destination.quote_item_id = v_quote_item_id
          and profile_destination.destination_type = 'profile'
          and store_destination.destination_type = 'store'
      ) then
        raise exception 'freight profile and store destinations cannot overlap';
      end if;

      select count(*)::integer
      into v_expected_store_count
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = v_quote_id
        and (v_item_store_id is null or quote_store.store_id = v_item_store_id);

      select
        count(distinct covered.store_id)::integer,
        coalesce(bool_or(covered.store_id = v_item_store_id), false)
      into v_covered_store_count, v_item_store_is_covered
      from (
        select profile_store.store_id
        from public.supply_quote_item_destinations destination
        join public.supply_freight_profile_stores profile_store
          on profile_store.profile_id = destination.profile_id
        join public.supply_quote_stores quote_store
          on quote_store.store_id = profile_store.store_id
         and quote_store.quote_id = v_quote_id
        where destination.quote_item_id = v_quote_item_id
          and destination.destination_type = 'profile'
        union
        select destination.store_id
        from public.supply_quote_item_destinations destination
        where destination.quote_item_id = v_quote_item_id
          and destination.destination_type = 'store'
      ) covered;

      if v_item_store_id is not null then
        if v_covered_store_count <> 1 or not v_item_store_is_covered then
          raise exception 'freight destinations must cover the quote item store exactly';
        end if;
      elsif v_covered_store_count <> v_expected_store_count then
        raise exception 'freight destinations must cover all stores in the quote scope';
      end if;
    end if;
  end loop;

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    after_json,
    origin
  ) values (
    v_actor,
    'quote.freight_destinations.updated',
    'supply_quote',
    v_quote_id,
    jsonb_build_object('destination_rows', v_destination_rows),
    'database'
  );

  return v_quote_id;
end;
$$;

revoke all on function public.save_supply_quote_v3(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb, text, numeric, integer, text
) from public, anon;
grant execute on function public.save_supply_quote_v3(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb, text, numeric, integer, text
) to authenticated;
