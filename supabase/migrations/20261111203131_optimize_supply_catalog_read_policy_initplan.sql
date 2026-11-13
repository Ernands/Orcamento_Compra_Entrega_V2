alter policy supply_items_read_capability on public.supply_items
using (
  (select app.can('items', 'view'))
  or (select app.can('planned_budget', 'view'))
  or (select app.can('planned_budget', 'manage'))
  or (select app.can('finance', 'overview_view'))
  or (select app.can('finance', 'store_detail_view'))
);

alter policy suppliers_read_capability on public.suppliers
using ((select app.can('suppliers', 'view')));
