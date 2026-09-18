create or replace function public.get_purchase_item_catalog_metadata()
returns table (
  id uuid,
  subcategory text,
  group_name text,
  financial_group text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct
    catalog.id,
    catalog.subcategory,
    catalog.group_name,
    catalog.financial_group
  from public.supply_items catalog
  join public.supply_purchase_items purchase_item
    on purchase_item.supply_item_id = catalog.id
  where (select auth.uid()) is not null
    and app.can_read_supply_purchase(purchase_item.purchase_id);
$function$;

revoke all on function public.get_purchase_item_catalog_metadata() from public;
revoke all on function public.get_purchase_item_catalog_metadata() from anon;
grant execute on function public.get_purchase_item_catalog_metadata() to authenticated;
