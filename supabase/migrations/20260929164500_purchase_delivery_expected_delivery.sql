alter table public.purchase_delivery_items
  add column if not exists expected_delivery_date date null;

create index if not exists purchase_delivery_items_expected_delivery_idx
  on public.purchase_delivery_items (expected_delivery_date)
  where expected_delivery_date is not null;
