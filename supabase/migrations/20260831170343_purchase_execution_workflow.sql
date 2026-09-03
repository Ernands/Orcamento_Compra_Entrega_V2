create or replace function private.sync_supply_purchase_item_execution_totals(p_purchase_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantity numeric(14,3);
  v_product_total numeric(18,4);
  v_discount numeric(14,2);
  v_shipping numeric(14,2);
  v_other numeric(14,2);
  v_total numeric(16,2);
begin
  select
    coalesce(sum(line.quantity), 0),
    coalesce(sum(round(line.quantity * line.unit_price, 2)), 0),
    coalesce(sum(line.discount_amount), 0),
    coalesce(sum(line.shipping_amount), 0),
    coalesce(sum(line.other_costs), 0),
    coalesce(sum(line.line_total), 0)
  into v_quantity, v_product_total, v_discount, v_shipping, v_other, v_total
  from public.supply_purchase_order_items line
  join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
  where line.purchase_item_id = p_purchase_item_id
    and purchase_order.status = 'active';

  update public.supply_purchase_items item
  set purchased_quantity = v_quantity,
      actual_unit_price = case
        when v_quantity > 0 then round(v_product_total / v_quantity, 2)
        else item.quoted_unit_price
      end,
      actual_discount_amount = v_discount,
      actual_shipping_amount = v_shipping,
      actual_other_costs = v_other,
      actual_total = v_total
  where item.id = p_purchase_item_id;
end;
$$;

create or replace function private.recalculate_supply_purchase_status(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_total integer;
  v_started integer;
  v_completed integer;
begin
  select status into v_status
  from public.supply_purchases
  where id = p_purchase_id
  for update;

  if v_status in ('returned', 'cancelled') then
    return;
  end if;

  select
    count(*),
    count(*) filter (where purchased_quantity > 0),
    count(*) filter (where purchased_quantity >= quantity_approved)
  into v_total, v_started, v_completed
  from public.supply_purchase_items
  where purchase_id = p_purchase_id;

  update public.supply_purchases
  set status = case
    when v_total > 0 and v_completed = v_total then 'purchased'
    when v_started > 0 then 'partially_purchased'
    else 'approved'
  end
  where id = p_purchase_id;
end;
$$;

insert into public.supply_purchase_orders (
  purchase_id,
  purchased_on,
  status,
  source,
  notes,
  created_by
)
select
  purchase.id,
  coalesce(purchase.approved_at::date, current_date),
  'active',
  'legacy_backfill',
  'Registro criado automaticamente a partir do realizado acumulado do modelo anterior.',
  purchase.approved_by
from public.supply_purchases purchase
where exists (
  select 1
  from public.supply_purchase_items item
  where item.purchase_id = purchase.id
    and item.purchased_quantity > 0
)
on conflict do nothing;

insert into public.supply_purchase_order_items (
  order_id,
  purchase_item_id,
  purchase_destination_id,
  item_code_snapshot,
  item_name_snapshot,
  destination_label_snapshot,
  destination_state_snapshot,
  quantity,
  unit,
  unit_price,
  discount_amount,
  shipping_amount,
  other_costs,
  notes
)
select
  purchase_order.id,
  item.id,
  null,
  item.item_code_snapshot,
  item.item_name_snapshot,
  null,
  null,
  item.purchased_quantity,
  item.unit,
  coalesce(item.actual_unit_price, item.quoted_unit_price),
  item.actual_discount_amount,
  item.actual_shipping_amount,
  item.actual_other_costs,
  'Importado do realizado acumulado anterior.'
from public.supply_purchase_orders purchase_order
join public.supply_purchase_items item
  on item.purchase_id = purchase_order.purchase_id
where purchase_order.source = 'legacy_backfill'
  and item.purchased_quantity > 0
  and not exists (
    select 1
    from public.supply_purchase_order_items line
    where line.order_id = purchase_order.id
      and line.purchase_item_id = item.id
  );

do $$
declare
  v_item_id uuid;
  v_purchase_id uuid;
begin
  for v_item_id in
    select distinct line.purchase_item_id
    from public.supply_purchase_order_items line
    where line.purchase_item_id is not null
  loop
    perform private.sync_supply_purchase_item_execution_totals(v_item_id);
  end loop;

  for v_purchase_id in
    select purchase.id
    from public.supply_purchases purchase
    where purchase.status not in ('returned', 'cancelled')
  loop
    perform private.recalculate_supply_purchase_status(v_purchase_id);
  end loop;
end;
$$;

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
  v_quantity numeric(14,3);
  v_unit_price numeric(14,2);
  v_discount numeric(14,2);
  v_shipping numeric(14,2);
  v_other numeric(14,2);
  v_expected_delivery_date date;
  v_existing_quantity numeric(14,3);
  v_line_count integer := 0;
  v_order_total numeric(16,2);
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;

  select * into v_purchase
  from public.supply_purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  if v_purchase.status in ('returned', 'cancelled') then
    raise exception 'purchase is closed';
  end if;
  if p_purchased_on is null then
    raise exception 'purchase date is required';
  end if;
  if p_expected_delivery_date is not null and p_expected_delivery_date < p_purchased_on then
    raise exception 'expected delivery cannot precede purchase date';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase order lines must be a non-empty array';
  end if;

  insert into public.supply_purchase_orders (
    purchase_id,
    purchased_on,
    supplier_order_ref,
    expected_delivery_date,
    status,
    source,
    notes,
    created_by
  ) values (
    p_purchase_id,
    p_purchased_on,
    nullif(trim(p_supplier_order_ref), ''),
    p_expected_delivery_date,
    'active',
    'manual',
    nullif(trim(p_notes), ''),
    v_actor
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

    if v_item.id is null then
      raise exception 'purchase order item is outside purchase';
    end if;

    if v_destination_id is not null then
      select * into v_destination
      from public.supply_purchase_destinations destination
      where destination.id = v_destination_id
        and destination.purchase_item_id = v_item.id;

      if v_destination.id is null then
        raise exception 'purchase destination is outside purchase item';
      end if;
    else
      v_destination := null;
    end if;

    v_quantity := nullif(private.normalize_decimal_input(v_line ->> 'quantity'), '')::numeric;
    v_unit_price := nullif(private.normalize_decimal_input(v_line ->> 'unit_price'), '')::numeric;
    v_discount := coalesce(nullif(private.normalize_decimal_input(v_line ->> 'discount_amount'), '')::numeric, 0);
    v_shipping := coalesce(nullif(private.normalize_decimal_input(v_line ->> 'shipping_amount'), '')::numeric, 0);
    v_other := coalesce(nullif(private.normalize_decimal_input(v_line ->> 'other_costs'), '')::numeric, 0);
    v_expected_delivery_date := coalesce(
      nullif(v_line ->> 'expected_delivery_date', '')::date,
      p_expected_delivery_date
    );

    if v_quantity is null or v_quantity <= 0
      or v_unit_price is null or v_unit_price < 0
      or v_discount < 0
      or v_shipping < 0
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
      order_id,
      purchase_item_id,
      purchase_destination_id,
      item_code_snapshot,
      item_name_snapshot,
      destination_label_snapshot,
      destination_state_snapshot,
      quantity,
      unit,
      unit_price,
      discount_amount,
      shipping_amount,
      other_costs,
      expected_delivery_date,
      notes
    ) values (
      v_order_id,
      v_item.id,
      v_destination_id,
      v_item.item_code_snapshot,
      v_item.item_name_snapshot,
      case when v_destination_id is null then null else v_destination.label_snapshot end,
      case when v_destination_id is null then null else v_destination.state_snapshot end,
      v_quantity,
      v_item.unit,
      v_unit_price,
      v_discount,
      v_shipping,
      v_other,
      v_expected_delivery_date,
      nullif(trim(v_line ->> 'notes'), '')
    );

    perform private.sync_supply_purchase_item_execution_totals(v_item.id);
    v_line_count := v_line_count + 1;
  end loop;

  perform private.recalculate_supply_purchase_status(p_purchase_id);

  select coalesce(sum(line.line_total), 0)
  into v_order_total
  from public.supply_purchase_order_items line
  where line.order_id = v_order_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.order.created',
    'supply_purchase_order',
    v_order_id,
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'purchased_on', p_purchased_on,
      'supplier_order_ref', nullif(trim(p_supplier_order_ref), ''),
      'line_count', v_line_count,
      'order_total', v_order_total
    ),
    'database'
  );

  return v_order_id;
end;
$$;

create or replace function public.cancel_supply_purchase_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.supply_purchase_orders;
  v_actor uuid := app.current_usuario_id();
  v_item_id uuid;
begin
  select * into v_order
  from public.supply_purchase_orders
  where id = p_order_id
  for update;

  if v_order.id is null or not app.can_edit_supply_purchase(v_order.purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'purchase order is already cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'cancellation reason is required';
  end if;

  update public.supply_purchase_orders
  set status = 'cancelled',
      cancelled_by = v_actor,
      cancelled_at = now(),
      cancellation_reason = trim(p_reason)
  where id = p_order_id;

  for v_item_id in
    select distinct line.purchase_item_id
    from public.supply_purchase_order_items line
    where line.order_id = p_order_id
      and line.purchase_item_id is not null
  loop
    perform private.sync_supply_purchase_item_execution_totals(v_item_id);
  end loop;

  perform private.recalculate_supply_purchase_status(v_order.purchase_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.order.cancelled',
    'supply_purchase_order',
    p_order_id,
    to_jsonb(v_order),
    (select to_jsonb(purchase_order) from public.supply_purchase_orders purchase_order where purchase_order.id = p_order_id),
    'database'
  );
end;
$$;

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
begin
  select * into v_item
  from public.supply_purchase_items
  where id = p_purchase_item_id
  for update;

  if v_item.id is null or not app.can_edit_supply_purchase(v_item.purchase_id) then
    raise exception 'permission denied';
  end if;

  if exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.purchase_item_id = p_purchase_item_id
      and purchase_order.status = 'active'
  ) then
    raise exception 'use purchase orders to change executed quantities';
  end if;

  raise exception 'use purchase orders to register purchase execution';
end;
$$;