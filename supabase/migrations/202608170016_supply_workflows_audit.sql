create or replace function private.set_supply_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_usuario_id();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, v_actor);
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := v_actor;
  return new;
end;
$$;

create or replace function private.audit_supply_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_before jsonb;
  v_after jsonb;
begin
  v_before := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - array['document'] end;
  v_after := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - array['document'] end;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    app.current_usuario_id(),
    tg_argv[0] || case when tg_op = 'INSERT' then '.created' else '.updated' end,
    tg_argv[0],
    (v_row ->> 'id')::uuid,
    v_before,
    v_after,
    'database'
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger supply_items_set_actor
before insert or update on public.supply_items
for each row execute function private.set_supply_actor();
create trigger suppliers_set_actor
before insert or update on public.suppliers
for each row execute function private.set_supply_actor();
create trigger supplier_channels_set_actor
before insert or update on public.supplier_channels
for each row execute function private.set_supply_actor();

create trigger supply_items_audit_changes
after insert or update on public.supply_items
for each row execute function private.audit_supply_change('item');
create trigger suppliers_audit_changes
after insert or update on public.suppliers
for each row execute function private.audit_supply_change('supplier');
create trigger supplier_channels_audit_changes
after insert or update on public.supplier_channels
for each row execute function private.audit_supply_change('supplier.channel');

revoke all on function private.set_supply_actor() from public, anon, authenticated;
revoke all on function private.audit_supply_change() from public, anon, authenticated;

create or replace function private.validate_supply_quote_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context public.supply_quote_context;
  v_need_store_id uuid;
  v_need_item_id uuid;
begin
  select quote.context_type into v_context
  from public.supply_quotes quote
  where quote.id = new.quote_id;

  if v_context is null then
    raise exception 'quote not found';
  end if;

  if new.store_id is null and v_context <> 'consolidated' then
    raise exception 'store quote items require a store';
  end if;

  if new.store_id is not null and not exists (
    select 1
    from public.supply_quote_stores quote_store
    where quote_store.quote_id = new.quote_id
      and quote_store.store_id = new.store_id
  ) then
    raise exception 'quote item store is outside quote scope';
  end if;

  if new.store_need_id is not null then
    select need.store_id, need.supply_item_id
    into v_need_store_id, v_need_item_id
    from public.store_needs need
    where need.id = new.store_need_id;

    if v_need_store_id is null
      or v_need_store_id is distinct from new.store_id
      or (v_need_item_id is not null and v_need_item_id is distinct from new.supply_item_id) then
      raise exception 'quote item does not match the linked need';
    end if;
  end if;

  return new;
end;
$$;

create trigger supply_quote_items_validate
before insert or update on public.supply_quote_items
for each row execute function private.validate_supply_quote_item();

revoke all on function private.validate_supply_quote_item() from public, anon, authenticated;

create or replace function public.link_store_need_item(p_need_id uuid, p_supply_item_id uuid)
returns public.store_needs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need public.store_needs;
  v_actor uuid := app.current_usuario_id();
begin
  select * into v_need from public.store_needs where id = p_need_id;

  if v_need.id is null or not app.can_store('needs', 'edit', v_need.store_id) then
    raise exception 'permission denied';
  end if;

  if not exists (
    select 1 from public.supply_items where id = p_supply_item_id and active
  ) then
    raise exception 'active supply item not found';
  end if;

  update public.store_needs
  set supply_item_id = p_supply_item_id, updated_by = v_actor
  where id = p_need_id
  returning * into v_need;

  return v_need;
end;
$$;

create or replace function public.save_supplier(
  p_supplier_id uuid,
  p_trade_name text,
  p_legal_name text,
  p_person_type public.supplier_person_type,
  p_document text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_website text,
  p_city text,
  p_state text,
  p_address text,
  p_notes text,
  p_active boolean,
  p_channel_id uuid,
  p_channel_type public.supplier_channel_type,
  p_channel_label text,
  p_channel_city text,
  p_channel_state text,
  p_serves_nationally boolean,
  p_channel_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_id uuid := p_supplier_id;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can('suppliers', 'manage') then
    raise exception 'permission denied';
  end if;

  if length(trim(p_trade_name)) < 2 then
    raise exception 'supplier trade name is required';
  end if;

  if v_supplier_id is null then
    insert into public.suppliers (
      trade_name, legal_name, person_type, document, contact_name, phone, email,
      website, city, state, address, notes, active, created_by, updated_by
    ) values (
      trim(p_trade_name), nullif(trim(p_legal_name), ''), p_person_type,
      nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), ''),
      nullif(trim(p_contact_name), ''), nullif(trim(p_phone), ''), lower(nullif(trim(p_email), '')),
      nullif(trim(p_website), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''),
      nullif(trim(p_address), ''), nullif(trim(p_notes), ''), p_active, v_actor, v_actor
    ) returning id into v_supplier_id;
  else
    update public.suppliers
    set
      trade_name = trim(p_trade_name),
      legal_name = nullif(trim(p_legal_name), ''),
      person_type = p_person_type,
      document = nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), ''),
      contact_name = nullif(trim(p_contact_name), ''),
      phone = nullif(trim(p_phone), ''),
      email = lower(nullif(trim(p_email), '')),
      website = nullif(trim(p_website), ''),
      city = nullif(trim(p_city), ''),
      state = nullif(trim(p_state), ''),
      address = nullif(trim(p_address), ''),
      notes = nullif(trim(p_notes), ''),
      active = p_active,
      updated_by = v_actor
    where id = v_supplier_id;

    if not found then
      raise exception 'supplier not found';
    end if;
  end if;

  if p_channel_id is null then
    insert into public.supplier_channels (
      supplier_id, channel_type, label, city, state, serves_nationally,
      active, created_by, updated_by
    ) values (
      v_supplier_id, p_channel_type, nullif(trim(p_channel_label), ''),
      nullif(trim(p_channel_city), ''), nullif(trim(p_channel_state), ''),
      p_serves_nationally, p_channel_active, v_actor, v_actor
    );
  else
    update public.supplier_channels
    set
      channel_type = p_channel_type,
      label = nullif(trim(p_channel_label), ''),
      city = nullif(trim(p_channel_city), ''),
      state = nullif(trim(p_channel_state), ''),
      serves_nationally = p_serves_nationally,
      active = p_channel_active,
      updated_by = v_actor
    where id = p_channel_id and supplier_id = v_supplier_id;

    if not found then
      raise exception 'supplier channel not found';
    end if;
  end if;

  return v_supplier_id;
end;
$$;

create or replace function public.save_supply_quote(
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
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := p_quote_id;
  v_actor uuid := app.current_usuario_id();
  v_is_new boolean := p_quote_id is null;
  v_existing_status public.supply_quote_status;
  v_store_ids uuid[];
  v_store_id uuid;
  v_supplier_name text;
  v_channel_type public.supplier_channel_type;
  v_origin_city text;
  v_origin_state text;
  v_item jsonb;
  v_supply_item_id uuid;
  v_need_id uuid;
  v_need_store_id uuid;
  v_need_item_id uuid;
  v_quantity numeric(14, 3);
  v_unit text;
  v_default_unit text;
  v_unit_price numeric(14, 2);
  v_discount numeric(14, 2);
  v_shipping_type public.supply_shipping_type;
  v_shipping_amount numeric(14, 2);
  v_other_costs numeric(14, 2);
  v_delivery_days integer;
  v_minimum_quantity numeric(14, 3);
  v_item_count integer := 0;
  v_before jsonb;
  v_after jsonb;
begin
  if p_quote_date is null then
    raise exception 'quote date is required';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'quote validity cannot precede quote date';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'quote requires at least one item';
  end if;

  select array_agg(distinct store_id) into v_store_ids
  from unnest(coalesce(p_store_ids, array[]::uuid[])) store_id;

  if coalesce(cardinality(v_store_ids), 0) = 0 then
    raise exception 'quote requires at least one store';
  end if;

  if p_context_type = 'store' and cardinality(v_store_ids) <> 1 then
    raise exception 'store quote requires exactly one store';
  end if;

  if p_context_type = 'consolidated' and cardinality(v_store_ids) < 2 then
    raise exception 'consolidated quote requires at least two stores';
  end if;

  if not v_is_new then
    select quote.status, to_jsonb(quote) into v_existing_status, v_before
    from public.supply_quotes quote
    where quote.id = v_quote_id;

    if v_existing_status is null then
      raise exception 'quote not found';
    end if;

    if v_existing_status <> 'draft' then
      raise exception 'only draft quotes can be edited';
    end if;

    if exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = v_quote_id
        and not app.can_store('quotes', 'edit', quote_store.store_id)
    ) then
      raise exception 'permission denied';
    end if;
  end if;

  foreach v_store_id in array v_store_ids loop
    if not exists (select 1 from public.lojas where id = v_store_id)
      or not app.can_store('quotes', case when v_is_new then 'create' else 'edit' end, v_store_id) then
      raise exception 'permission denied';
    end if;
  end loop;

  select
    supplier.trade_name,
    channel.channel_type,
    coalesce(channel.city, supplier.city),
    coalesce(channel.state, supplier.state)
  into v_supplier_name, v_channel_type, v_origin_city, v_origin_state
  from public.suppliers supplier
  join public.supplier_channels channel
    on channel.id = p_supplier_channel_id and channel.supplier_id = supplier.id
  where supplier.id = p_supplier_id
    and supplier.active
    and channel.active;

  if v_supplier_name is null then
    raise exception 'active supplier channel not found';
  end if;

  if v_is_new then
    insert into public.supply_quotes (
      supplier_id, supplier_channel_id, supplier_name_snapshot, channel_snapshot,
      origin_city_snapshot, origin_state_snapshot, quote_date, valid_until,
      contact_snapshot, context_type, status, notes, created_by, updated_by
    ) values (
      p_supplier_id, p_supplier_channel_id, v_supplier_name, v_channel_type,
      v_origin_city, v_origin_state, p_quote_date, p_valid_until,
      nullif(trim(p_contact), ''), p_context_type, p_status,
      nullif(trim(p_notes), ''), v_actor, v_actor
    ) returning id into v_quote_id;
  else
    delete from public.supply_quote_items where quote_id = v_quote_id;
    delete from public.supply_quote_stores where quote_id = v_quote_id;

    update public.supply_quotes
    set
      supplier_id = p_supplier_id,
      supplier_channel_id = p_supplier_channel_id,
      supplier_name_snapshot = v_supplier_name,
      channel_snapshot = v_channel_type,
      origin_city_snapshot = v_origin_city,
      origin_state_snapshot = v_origin_state,
      quote_date = p_quote_date,
      valid_until = p_valid_until,
      contact_snapshot = nullif(trim(p_contact), ''),
      context_type = p_context_type,
      status = p_status,
      notes = nullif(trim(p_notes), ''),
      updated_by = v_actor
    where id = v_quote_id;
  end if;

  insert into public.supply_quote_stores (quote_id, store_id)
  select v_quote_id, store_id from unnest(v_store_ids) store_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_supply_item_id := nullif(v_item ->> 'supply_item_id', '')::uuid;
    v_need_id := nullif(v_item ->> 'store_need_id', '')::uuid;
    v_store_id := nullif(v_item ->> 'store_id', '')::uuid;
    v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, -1);
    v_discount := coalesce(nullif(v_item ->> 'discount_amount', '')::numeric, 0);
    v_shipping_type := coalesce(nullif(v_item ->> 'shipping_type', ''), 'pending')::public.supply_shipping_type;
    v_shipping_amount := nullif(v_item ->> 'shipping_amount', '')::numeric;
    v_other_costs := coalesce(nullif(v_item ->> 'other_costs', '')::numeric, 0);
    v_delivery_days := nullif(v_item ->> 'delivery_days', '')::integer;
    v_minimum_quantity := nullif(v_item ->> 'minimum_quantity', '')::numeric;

    select item.default_unit into v_default_unit
    from public.supply_items item
    where item.id = v_supply_item_id and item.active;

    if v_default_unit is null then
      raise exception 'active supply item not found';
    end if;

    v_unit := coalesce(nullif(trim(v_item ->> 'unit'), ''), v_default_unit);

    if v_quantity <= 0 or v_unit_price < 0 or v_discount < 0 or v_other_costs < 0
      or v_discount > round(v_quantity * v_unit_price, 2)
      or (v_delivery_days is not null and v_delivery_days < 0)
      or (v_minimum_quantity is not null and v_minimum_quantity <= 0) then
      raise exception 'invalid quote item values';
    end if;

    if v_shipping_type = 'free' then
      v_shipping_amount := 0;
    elsif v_shipping_type = 'informed' and (v_shipping_amount is null or v_shipping_amount < 0) then
      raise exception 'informed shipping requires a non-negative amount';
    elsif v_shipping_type = 'pending' then
      v_shipping_amount := null;
    end if;

    if v_store_id is null and p_context_type <> 'consolidated' then
      raise exception 'store quote items require a store';
    end if;

    if v_store_id is not null and not (v_store_id = any(v_store_ids)) then
      raise exception 'quote item store is outside quote scope';
    end if;

    if v_need_id is not null then
      select need.store_id, need.supply_item_id
      into v_need_store_id, v_need_item_id
      from public.store_needs need
      where need.id = v_need_id;

      if v_need_store_id is null
        or v_need_store_id is distinct from v_store_id
        or (v_need_item_id is not null and v_need_item_id is distinct from v_supply_item_id) then
        raise exception 'quote item does not match the linked need';
      end if;

      if v_need_item_id is null then
        if not app.can_store('needs', 'edit', v_need_store_id) then
          raise exception 'permission denied';
        end if;

        update public.store_needs
        set supply_item_id = v_supply_item_id, updated_by = v_actor
        where id = v_need_id;
      end if;
    end if;

    insert into public.supply_quote_items (
      quote_id, supply_item_id, store_need_id, store_id, quantity, unit,
      unit_price, discount_amount, shipping_type, shipping_amount, other_costs,
      delivery_days, minimum_quantity, offered_brand_model, notes, product_url, captured_at
    ) values (
      v_quote_id, v_supply_item_id, v_need_id, v_store_id, v_quantity, v_unit,
      v_unit_price, v_discount, v_shipping_type, v_shipping_amount, v_other_costs,
      v_delivery_days, v_minimum_quantity,
      nullif(trim(v_item ->> 'offered_brand_model'), ''),
      nullif(trim(v_item ->> 'notes'), ''),
      nullif(trim(v_item ->> 'product_url'), ''),
      nullif(v_item ->> 'captured_at', '')::timestamptz
    );

    v_item_count := v_item_count + 1;
  end loop;

  select to_jsonb(quote) into v_after from public.supply_quotes quote where quote.id = v_quote_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    case when v_is_new then 'quote.created' else 'quote.updated' end,
    'quote',
    v_quote_id,
    v_before,
    v_after,
    'database'
  );

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    case when v_is_new then 'quote.item_added' else 'quote.item_updated' end,
    'quote',
    v_quote_id,
    jsonb_build_object('item_count', v_item_count),
    'database'
  );

  return v_quote_id;
end;
$$;

revoke all on function public.link_store_need_item(uuid, uuid) from public, anon;
revoke all on function public.save_supplier(
  uuid, text, text, public.supplier_person_type, text, text, text, text, text,
  text, text, text, text, boolean, uuid, public.supplier_channel_type, text,
  text, text, boolean, boolean
) from public, anon;
revoke all on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon;

grant execute on function public.link_store_need_item(uuid, uuid) to authenticated;
grant execute on function public.save_supplier(
  uuid, text, text, public.supplier_person_type, text, text, text, text, text,
  text, text, text, text, boolean, uuid, public.supplier_channel_type, text,
  text, text, boolean, boolean
) to authenticated;
grant execute on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) to authenticated;

grant execute on function public.link_store_need_item(uuid, uuid) to service_role;
grant execute on function public.save_supplier(
  uuid, text, text, public.supplier_person_type, text, text, text, text, text,
  text, text, text, text, boolean, uuid, public.supplier_channel_type, text,
  text, text, boolean, boolean
) to service_role;
grant execute on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) to service_role;
