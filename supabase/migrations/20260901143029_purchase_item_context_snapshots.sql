alter table public.supply_purchase_items
  add column if not exists item_description_snapshot text,
  add column if not exists item_category_snapshot text,
  add column if not exists item_area_snapshot text,
  add column if not exists brand_reference_snapshot text,
  add column if not exists technical_specification_snapshot text,
  add column if not exists offered_brand_model_snapshot text,
  add column if not exists product_url_snapshot text,
  add column if not exists quoted_delivery_days integer,
  add column if not exists item_context_snapshot_source text
    check (item_context_snapshot_source is null or item_context_snapshot_source in ('approval', 'backfill_current_source'));

alter table public.supply_purchase_items
  drop constraint if exists supply_purchase_items_quoted_delivery_days_check,
  add constraint supply_purchase_items_quoted_delivery_days_check
    check (quoted_delivery_days is null or quoted_delivery_days >= 0);

update public.supply_purchase_items purchase_item
set item_description_snapshot = supply_item.description,
    item_category_snapshot = supply_item.category,
    item_area_snapshot = supply_item.area_name,
    brand_reference_snapshot = supply_item.brand_reference,
    technical_specification_snapshot = supply_item.technical_specification,
    offered_brand_model_snapshot = (
      select quote_item.offered_brand_model
      from public.supply_quote_items quote_item
      where quote_item.id = purchase_item.source_quote_item_id
    ),
    product_url_snapshot = (
      select quote_item.product_url
      from public.supply_quote_items quote_item
      where quote_item.id = purchase_item.source_quote_item_id
    ),
    quoted_delivery_days = (
      select quote_item.delivery_days
      from public.supply_quote_items quote_item
      where quote_item.id = purchase_item.source_quote_item_id
    ),
    item_context_snapshot_source = 'backfill_current_source'
from public.supply_items supply_item
where supply_item.id = purchase_item.supply_item_id
  and purchase_item.item_context_snapshot_source is null;

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
  end if;

  if new.item_context_snapshot_source is null then
    new.item_context_snapshot_source := 'approval';
  end if;

  return new;
end;
$$;

drop trigger if exists supply_purchase_items_context_snapshot on public.supply_purchase_items;
create trigger supply_purchase_items_context_snapshot
before insert on public.supply_purchase_items
for each row execute function private.set_supply_purchase_item_context_snapshot();