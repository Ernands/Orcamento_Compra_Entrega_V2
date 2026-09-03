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
    select count(*)
    into v_store_count
    from public.supply_purchase_stores
    where purchase_id = v_purchase_id;

    if v_store_count <> 1 then
      update public.supply_purchase_order_items
      set store_distribution_status = 'pending'
      where id = p_order_line_id;
      return;
    end if;

    select purchase_store.store_id
    into v_store_id
    from public.supply_purchase_stores purchase_store
    where purchase_store.purchase_id = v_purchase_id
    limit 1;
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