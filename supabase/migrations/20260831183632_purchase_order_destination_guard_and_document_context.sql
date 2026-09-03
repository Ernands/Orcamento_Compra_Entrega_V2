alter table public.supply_purchase_attachments
  add column if not exists purchase_order_id uuid references public.supply_purchase_orders(id) on delete set null,
  add column if not exists document_number text,
  add column if not exists document_date date,
  add column if not exists document_amount numeric(14,2);

create index if not exists supply_purchase_attachments_order_idx
  on public.supply_purchase_attachments (purchase_order_id)
  where purchase_order_id is not null;

alter table public.supply_purchase_attachments
  drop constraint if exists supply_purchase_attachments_document_number_len,
  add constraint supply_purchase_attachments_document_number_len
    check (document_number is null or length(trim(document_number)) between 1 and 120),
  drop constraint if exists supply_purchase_attachments_document_amount_nonnegative,
  add constraint supply_purchase_attachments_document_amount_nonnegative
    check (document_amount is null or document_amount >= 0);

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

    select exists (
      select 1
      from public.supply_purchase_destinations destination
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

revoke execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) from public, anon;
grant execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) to authenticated;