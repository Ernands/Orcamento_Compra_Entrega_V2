-- Compras V2: diferencia frete pendente, gratis e informado no realizado.

alter table public.supply_purchase_order_items
  drop column if exists line_total;

alter table public.supply_purchase_order_items
  add column if not exists shipping_type public.supply_shipping_type;

alter table public.supply_purchase_order_items
  alter column shipping_amount drop not null,
  alter column shipping_amount drop default;

update public.supply_purchase_order_items
set shipping_type = case
      when coalesce(shipping_amount, 0) > 0 then 'informed'::public.supply_shipping_type
      else 'pending'::public.supply_shipping_type
    end,
    shipping_amount = case
      when coalesce(shipping_amount, 0) > 0 then shipping_amount
      else null
    end
where shipping_type is null;

alter table public.supply_purchase_order_items
  alter column shipping_type set default 'pending'::public.supply_shipping_type,
  alter column shipping_type set not null;

alter table public.supply_purchase_order_items
  drop constraint if exists supply_purchase_order_items_shipping_state_check;

alter table public.supply_purchase_order_items
  add constraint supply_purchase_order_items_shipping_state_check check (
    (shipping_type = 'pending' and shipping_amount is null)
    or (shipping_type = 'free' and shipping_amount = 0)
    or (shipping_type = 'informed' and shipping_amount is not null and shipping_amount > 0)
  );

alter table public.supply_purchase_order_items
  add column line_total numeric(16,2) generated always as (
    greatest(
      round(quantity * unit_price, 2)
      - discount_amount
      + coalesce(shipping_amount, 0)
      + other_costs,
      0
    )
  ) stored;

create or replace function public.create_supply_purchase_order(
  p_purchase_id uuid,
  p_purchased_on date,
  p_supplier_order_ref text,
  p_expected_delivery_date date,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.supply_purchases;
  v_order_id uuid;
  v_actor uuid := app.current_usuario_id();
  v_line jsonb;
  v_item public.supply_purchase_items;
  v_purchase_item_id uuid;
  v_destination_id uuid;
  v_destination public.supply_purchase_destinations;
  v_item_has_destinations boolean;
  v_quantity numeric(14,3);
  v_unit_price numeric(14,2);
  v_discount numeric(14,2);
  v_shipping_type public.supply_shipping_type;
  v_shipping numeric(14,2);
  v_other numeric(14,2);
  v_expected_delivery_date date;
  v_existing_quantity numeric(14,3);
  v_line_count integer := 0;
  v_order_total numeric(16,2);
  v_pending_shipping boolean;
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;

  select * into v_purchase
  from public.supply_purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then raise exception 'purchase not found'; end if;
  if v_purchase.status in ('returned', 'cancelled') then raise exception 'purchase is closed'; end if;
  if p_purchased_on is null then raise exception 'purchase date is required'; end if;
  if p_expected_delivery_date is not null and p_expected_delivery_date < p_purchased_on then
    raise exception 'expected delivery cannot precede purchase date';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase order lines must be a non-empty array';
  end if;

  insert into public.supply_purchase_orders (
    purchase_id, purchased_on, supplier_order_ref, expected_delivery_date,
    status, source, notes, created_by
  ) values (
    p_purchase_id, p_purchased_on, nullif(trim(p_supplier_order_ref), ''),
    p_expected_delivery_date, 'active', 'manual', nullif(trim(p_notes), ''), v_actor
  ) returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_purchase_item_id := nullif(v_line ->> 'purchase_item_id', '')::uuid;
    v_destination_id := nullif(v_line ->> 'purchase_destination_id', '')::uuid;

    select * into v_item
    from public.supply_purchase_items item
    where item.id = v_purchase_item_id
      and item.purchase_id = p_purchase_id
    for update;
    if v_item.id is null then raise exception 'purchase order item is outside purchase'; end if;

    select exists (
      select 1 from public.supply_purchase_destinations destination
      where destination.purchase_item_id = v_item.id
    ) into v_item_has_destinations;

    if v_item_has_destinations and v_destination_id is null then
      raise exception 'purchase destination is required for this item';
    end if;
    if not v_item_has_destinations and v_destination_id is not null then
      raise exception 'purchase destination is not allowed for this item';
    end if;

    if v_destination_id is not null then
      select * into v_destination
      from public.supply_purchase_destinations destination
      where destination.id = v_destination_id
        and destination.purchase_item_id = v_item.id;
      if v_destination.id is null then raise exception 'purchase destination is outside purchase item'; end if;
    else
      v_destination := null;
    end if;

    v_quantity := nullif(private.normalize_decimal_input(v_line ->> 'quantity'), '')::numeric;
    v_unit_price := nullif(private.normalize_decimal_input(v_line ->> 'unit_price'), '')::numeric;
    v_discount := coalesce(nullif(private.normalize_decimal_input(v_line ->> 'discount_amount'), '')::numeric, 0);
    v_other := coalesce(nullif(private.normalize_decimal_input(v_line ->> 'other_costs'), '')::numeric, 0);
    v_expected_delivery_date := coalesce(nullif(v_line ->> 'expected_delivery_date', '')::date, p_expected_delivery_date);

    if nullif(trim(coalesce(v_line ->> 'shipping_type', '')), '') is null then
      if nullif(trim(coalesce(v_line ->> 'shipping_amount', '')), '') is null then
        v_shipping_type := 'pending';
        v_shipping := null;
      else
        v_shipping := private.normalize_decimal_input(v_line ->> 'shipping_amount')::numeric;
        if v_shipping < 0 then raise exception 'shipping amount cannot be negative'; end if;
        if v_shipping = 0 then v_shipping_type := 'free'; else v_shipping_type := 'informed'; end if;
      end if;
    else
      v_shipping_type := (v_line ->> 'shipping_type')::public.supply_shipping_type;
      if v_shipping_type = 'pending' then
        v_shipping := null;
      elsif v_shipping_type = 'free' then
        v_shipping := 0;
      else
        v_shipping := nullif(private.normalize_decimal_input(v_line ->> 'shipping_amount'), '')::numeric;
        if v_shipping is null or v_shipping <= 0 then raise exception 'informed shipping requires a positive amount'; end if;
      end if;
    end if;

    if v_quantity is null or v_quantity <= 0
      or v_unit_price is null or v_unit_price < 0
      or v_discount < 0
      or v_other < 0 then
      raise exception 'invalid purchase order values';
    end if;
    if v_discount > round(v_quantity * v_unit_price, 2) then
      raise exception 'purchase order discount exceeds subtotal';
    end if;
    if v_expected_delivery_date is not null and v_expected_delivery_date < p_purchased_on then
      raise exception 'line expected delivery cannot precede purchase date';
    end if;

    select coalesce(sum(line.quantity), 0)
    into v_existing_quantity
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.purchase_item_id = v_item.id
      and purchase_order.status = 'active';
    if v_existing_quantity + v_quantity > v_item.quantity_approved + 0.001 then
      raise exception 'purchase order quantity exceeds approved quantity';
    end if;

    if v_destination_id is not null then
      select coalesce(sum(line.quantity), 0)
      into v_existing_quantity
      from public.supply_purchase_order_items line
      join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
      where line.purchase_destination_id = v_destination_id
        and purchase_order.status = 'active';
      if v_existing_quantity + v_quantity > v_destination.quantity + 0.001 then
        raise exception 'purchase order quantity exceeds destination quantity';
      end if;
    end if;

    insert into public.supply_purchase_order_items (
      order_id, purchase_item_id, purchase_destination_id,
      item_code_snapshot, item_name_snapshot, destination_label_snapshot,
      destination_state_snapshot, quantity, unit, unit_price, discount_amount,
      shipping_type, shipping_amount, other_costs, expected_delivery_date, notes
    ) values (
      v_order_id, v_item.id, v_destination_id,
      v_item.item_code_snapshot, v_item.item_name_snapshot,
      case when v_destination_id is null then null else v_destination.label_snapshot end,
      case when v_destination_id is null then null else v_destination.state_snapshot end,
      v_quantity, v_item.unit, v_unit_price, v_discount,
      v_shipping_type, v_shipping, v_other, v_expected_delivery_date,
      nullif(trim(v_line ->> 'notes'), '')
    );

    perform private.sync_supply_purchase_item_execution_totals(v_item.id);
    v_line_count := v_line_count + 1;
  end loop;

  perform private.recalculate_supply_purchase_status(p_purchase_id);

  select coalesce(sum(line.line_total), 0), coalesce(bool_or(line.shipping_type = 'pending'), false)
  into v_order_total, v_pending_shipping
  from public.supply_purchase_order_items line
  where line.order_id = v_order_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor, 'purchase.order.created', 'supply_purchase_order', v_order_id,
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'purchased_on', p_purchased_on,
      'supplier_order_ref', nullif(trim(p_supplier_order_ref), ''),
      'line_count', v_line_count,
      'order_total_known', v_order_total,
      'has_pending_shipping', v_pending_shipping
    ),
    'database'
  );

  return v_order_id;
end;
$$;

create or replace function public.save_supply_purchase_item(
  p_purchase_item_id uuid,
  p_purchased_quantity numeric,
  p_actual_unit_price numeric,
  p_actual_discount_amount numeric,
  p_actual_shipping_amount numeric,
  p_actual_other_costs numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.supply_purchase_items;
  v_purchase_status text;
  v_actor uuid := app.current_usuario_id();
  v_legacy_order_id uuid;
  v_legacy_line_id uuid;
  v_before jsonb;
  v_shipping_type public.supply_shipping_type;
  v_shipping_amount numeric(14,2);
begin
  select * into v_item from public.supply_purchase_items where id = p_purchase_item_id for update;
  if v_item.id is null or not app.can_edit_supply_purchase(v_item.purchase_id) then raise exception 'permission denied'; end if;

  select purchase.status into v_purchase_status
  from public.supply_purchases purchase where purchase.id = v_item.purchase_id for update;
  if v_purchase_status in ('returned', 'cancelled') then raise exception 'purchase is closed'; end if;

  if p_purchased_quantity is null or p_actual_unit_price is null
    or p_actual_discount_amount is null or p_actual_shipping_amount is null
    or p_actual_other_costs is null or p_purchased_quantity < 0
    or p_purchased_quantity > v_item.quantity_approved or p_actual_unit_price < 0
    or p_actual_discount_amount < 0 or p_actual_shipping_amount < 0
    or p_actual_other_costs < 0 then raise exception 'invalid purchase values'; end if;
  if p_actual_discount_amount > round(p_purchased_quantity * p_actual_unit_price, 2) then
    raise exception 'purchase discount exceeds subtotal';
  end if;

  if exists (
    select 1 from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.purchase_item_id = p_purchase_item_id
      and purchase_order.status = 'active'
      and purchase_order.source <> 'legacy_backfill'
  ) then raise exception 'purchase item has v2 execution history; reload the application'; end if;

  select purchase_order.id into v_legacy_order_id
  from public.supply_purchase_orders purchase_order
  where purchase_order.purchase_id = v_item.purchase_id
    and purchase_order.source = 'legacy_backfill'
  limit 1;

  if v_legacy_order_id is not null then
    select line.id into v_legacy_line_id
    from public.supply_purchase_order_items line
    where line.order_id = v_legacy_order_id and line.purchase_item_id = p_purchase_item_id
    limit 1;
  end if;

  if v_legacy_line_id is not null and exists (
    select 1 from public.supply_purchase_order_line_stores line_store
    where line_store.order_line_id = v_legacy_line_id and line_store.allocation_source = 'manual'
  ) then raise exception 'purchase item has store distribution; reload the application'; end if;

  v_before := to_jsonb(v_item);
  v_shipping_type := case when p_actual_shipping_amount > 0 then 'informed'::public.supply_shipping_type else 'pending'::public.supply_shipping_type end;
  v_shipping_amount := case when p_actual_shipping_amount > 0 then p_actual_shipping_amount else null end;

  if p_purchased_quantity = 0 then
    if v_legacy_line_id is not null then delete from public.supply_purchase_order_items where id = v_legacy_line_id; end if;
  else
    if v_legacy_order_id is null then
      insert into public.supply_purchase_orders (
        purchase_id, purchased_on, status, source, notes, created_by
      ) values (
        v_item.purchase_id, current_date, 'active', 'legacy_backfill',
        'Registro de compatibilidade criado durante a transicao para Compras V2.', v_actor
      ) returning id into v_legacy_order_id;
    elsif (select status from public.supply_purchase_orders where id = v_legacy_order_id) <> 'active' then
      raise exception 'legacy purchase history is closed; reload the application';
    end if;

    if v_legacy_line_id is null then
      insert into public.supply_purchase_order_items (
        order_id, purchase_item_id, purchase_destination_id,
        item_code_snapshot, item_name_snapshot, destination_label_snapshot,
        destination_state_snapshot, quantity, unit, unit_price, discount_amount,
        shipping_type, shipping_amount, other_costs, expected_delivery_date, notes
      ) values (
        v_legacy_order_id, v_item.id, null, v_item.item_code_snapshot, v_item.item_name_snapshot,
        null, null, p_purchased_quantity, v_item.unit, p_actual_unit_price,
        p_actual_discount_amount, v_shipping_type, v_shipping_amount,
        p_actual_other_costs, null, nullif(trim(p_notes), '')
      ) returning id into v_legacy_line_id;
    else
      update public.supply_purchase_order_items
      set quantity = p_purchased_quantity,
          unit_price = p_actual_unit_price,
          discount_amount = p_actual_discount_amount,
          shipping_type = v_shipping_type,
          shipping_amount = v_shipping_amount,
          other_costs = p_actual_other_costs,
          notes = nullif(trim(p_notes), '')
      where id = v_legacy_line_id;

      update public.supply_purchase_order_line_stores
      set quantity = p_purchased_quantity
      where order_line_id = v_legacy_line_id and allocation_source = 'direct';
    end if;
  end if;

  perform private.sync_supply_purchase_item_execution_totals(v_item.id);
  update public.supply_purchase_items set notes = nullif(trim(p_notes), '') where id = v_item.id;
  perform private.recalculate_supply_purchase_status(v_item.purchase_id);

  if v_legacy_order_id is not null and not exists (
    select 1 from public.supply_purchase_order_items line where line.order_id = v_legacy_order_id
  ) then
    delete from public.supply_purchase_orders where id = v_legacy_order_id and source = 'legacy_backfill';
  end if;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor, 'purchase.item.updated_legacy_compat', 'supply_purchase_item', p_purchase_item_id,
    v_before,
    (select to_jsonb(item) from public.supply_purchase_items item where item.id = p_purchase_item_id),
    'database'
  );
end;
$$;

revoke execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) from public, anon;
grant execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) to authenticated;
revoke execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) to authenticated;