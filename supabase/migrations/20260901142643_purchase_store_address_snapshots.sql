alter table public.supply_purchase_stores
  add column if not exists store_address_snapshot_source text
    check (store_address_snapshot_source is null or store_address_snapshot_source in ('approval', 'backfill_current_store'));

update public.supply_purchase_stores purchase_store
set store_address_snapshot = store.endereco,
    store_address_snapshot_source = 'backfill_current_store'
from public.lojas store
where store.id = purchase_store.store_id
  and purchase_store.store_address_snapshot is null;

create or replace function private.set_supply_purchase_store_address_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_address_snapshot is null then
    select store.endereco
    into new.store_address_snapshot
    from public.lojas store
    where store.id = new.store_id;
  end if;

  if new.store_address_snapshot_source is null then
    new.store_address_snapshot_source := 'approval';
  end if;

  return new;
end;
$$;

drop trigger if exists supply_purchase_stores_address_snapshot on public.supply_purchase_stores;
create trigger supply_purchase_stores_address_snapshot
before insert on public.supply_purchase_stores
for each row execute function private.set_supply_purchase_store_address_snapshot();