drop function if exists public.get_purchase_item_catalog_metadata();

drop policy if exists supply_items_read_capability on public.supply_items;
create policy supply_items_read_capability
on public.supply_items
for select
to authenticated
using (
  app.can('items', 'view')
  or app.can('finance', 'overview_view')
  or app.can('finance', 'store_detail_view')
);
