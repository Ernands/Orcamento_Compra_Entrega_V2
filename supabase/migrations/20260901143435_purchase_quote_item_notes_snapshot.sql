alter table public.supply_purchase_items
  add column if not exists quote_item_notes_snapshot text;

update public.supply_purchase_items purchase_item
set quote_item_notes_snapshot = (
  select quote_item.notes
  from public.supply_quote_items quote_item
  where quote_item.id = purchase_item.source_quote_item_id
)
where purchase_item.source_quote_item_id is not null
  and purchase_item.quote_item_notes_snapshot is null;

create or replace function private.set_supply_purchase_item_context_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supply_item public.supply_items;
  v_quote_item public.supply_quote_items;
begin
  select * into v_supply_item
  from public.supply_items
  where id = new.supply_item_id;

  if new.source_quote_item_id is not null then
    select * into v_quote_item
    from public.supply_quote_items
    where id = new.source_quote_item_id;
  end if;

  if new.item_description_snapshot is null then
    new.item_description_snapshot := v_supply_item.description;
  end if;
  if new.item_category_snapshot is null then
    new.item_category_snapshot := v_supply_item.category;
  end if;
  if new.item_area_snapshot is null then
    new.item_area_snapshot := v_supply_item.area_name;
  end if;
  if new.brand_reference_snapshot is null then
    new.brand_reference_snapshot := v_supply_item.brand_reference;
  end if;
  if new.technical_specification_snapshot is null then
    new.technical_specification_snapshot := v_supply_item.technical_specification;
  end if;

  if new.source_quote_item_id is not null then
    if new.offered_brand_model_snapshot is null then
      new.offered_brand_model_snapshot := v_quote_item.offered_brand_model;
    end if;
    if new.product_url_snapshot is null then
      new.product_url_snapshot := v_quote_item.product_url;
    end if;
    if new.quoted_delivery_days is null then
      new.quoted_delivery_days := v_quote_item.delivery_days;
    end if;
    if new.quote_item_notes_snapshot is null then
      new.quote_item_notes_snapshot := v_quote_item.notes;
    end if;
  end if;

  if new.item_context_snapshot_source is null then
    new.item_context_snapshot_source := 'approval';
  end if;

  return new;
end;
$$;