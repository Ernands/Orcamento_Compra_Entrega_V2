alter table public.supply_purchase_destinations enable row level security;
alter table public.supply_purchase_destination_stores enable row level security;
alter table public.supply_purchase_orders enable row level security;
alter table public.supply_purchase_order_items enable row level security;

drop policy if exists supply_purchase_destinations_read on public.supply_purchase_destinations;
create policy supply_purchase_destinations_read
on public.supply_purchase_destinations
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_items item
    where item.id = purchase_item_id
      and app.can_read_supply_purchase(item.purchase_id)
  )
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_destinations destination
    join public.supply_purchase_items item on item.id = destination.purchase_item_id
    where destination.id = purchase_destination_id
      and app.can_read_supply_purchase(item.purchase_id)
      and app.can_store('purchases', 'view', public.supply_purchase_destination_stores.store_id)
  )
);

drop policy if exists supply_purchase_orders_read on public.supply_purchase_orders;
create policy supply_purchase_orders_read
on public.supply_purchase_orders
for select
to authenticated
using (app.can_read_supply_purchase(purchase_id));

drop policy if exists supply_purchase_order_items_read on public.supply_purchase_order_items;
create policy supply_purchase_order_items_read
on public.supply_purchase_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = order_id
      and app.can_read_supply_purchase(purchase_order.purchase_id)
  )
);

revoke all on public.supply_purchase_destinations from anon;
revoke all on public.supply_purchase_destination_stores from anon;
revoke all on public.supply_purchase_orders from anon;
revoke all on public.supply_purchase_order_items from anon;

revoke all on public.supply_purchase_destinations from authenticated;
revoke all on public.supply_purchase_destination_stores from authenticated;
revoke all on public.supply_purchase_orders from authenticated;
revoke all on public.supply_purchase_order_items from authenticated;

grant select on public.supply_purchase_destinations to authenticated;
grant select on public.supply_purchase_destination_stores to authenticated;
grant select on public.supply_purchase_orders to authenticated;
grant select on public.supply_purchase_order_items to authenticated;

revoke all on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) from public;
revoke all on function public.cancel_supply_purchase_order(uuid, text) from public;
revoke all on function public.save_supply_purchase_destination_distribution(uuid, jsonb) from public;
revoke all on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) from public;

grant execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) to authenticated;
grant execute on function public.cancel_supply_purchase_order(uuid, text) to authenticated;
grant execute on function public.save_supply_purchase_destination_distribution(uuid, jsonb) to authenticated;
grant execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) to authenticated;