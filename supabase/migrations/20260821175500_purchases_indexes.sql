create index if not exists supply_purchases_supplier_idx on public.supply_purchases(supplier_id);
create index if not exists supply_purchases_approved_by_idx on public.supply_purchases(approved_by) where approved_by is not null;
create index if not exists supply_purchases_returned_by_idx on public.supply_purchases(returned_by) where returned_by is not null;
create index if not exists supply_purchase_items_store_idx on public.supply_purchase_items(store_id) where store_id is not null;
create index if not exists supply_purchase_payments_created_by_idx on public.supply_purchase_payments(created_by) where created_by is not null;
create index if not exists supply_purchase_payments_updated_by_idx on public.supply_purchase_payments(updated_by) where updated_by is not null;
create index if not exists supply_purchase_attachments_created_by_idx on public.supply_purchase_attachments(created_by) where created_by is not null;
create index if not exists supply_purchase_attachments_deleted_by_idx on public.supply_purchase_attachments(deleted_by) where deleted_by is not null;