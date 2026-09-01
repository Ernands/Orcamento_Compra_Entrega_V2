alter table public.supply_purchase_stores
  add column if not exists store_address_snapshot text;

create or replace function private.set_supply_purchase_store_address_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_address_snapshot is null then
    select store.endereco into new.store_address_snapshot
    from public.lojas store
    where store.id = new.store_id;
  end if;
  return new;
end;
$$;

drop trigger if exists supply_purchase_stores_address_snapshot on public.supply_purchase_stores;
create trigger supply_purchase_stores_address_snapshot
before insert or update of store_id on public.supply_purchase_stores
for each row execute function private.set_supply_purchase_store_address_snapshot();

update public.supply_purchase_stores purchase_store
set store_address_snapshot = store.endereco
from public.lojas store
where store.id = purchase_store.store_id
  and purchase_store.store_address_snapshot is null;