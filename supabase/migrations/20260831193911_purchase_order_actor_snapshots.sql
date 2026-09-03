alter table public.supply_purchase_orders
  add column if not exists created_by_name_snapshot text,
  add column if not exists cancelled_by_name_snapshot text;

update public.supply_purchase_orders purchase_order
set created_by_name_snapshot = usuario.nome
from public.usuarios usuario
where purchase_order.created_by = usuario.id
  and purchase_order.created_by_name_snapshot is null;

update public.supply_purchase_orders purchase_order
set cancelled_by_name_snapshot = usuario.nome
from public.usuarios usuario
where purchase_order.cancelled_by = usuario.id
  and purchase_order.cancelled_by_name_snapshot is null;

create or replace function private.set_supply_purchase_order_actor_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null and new.created_by_name_snapshot is null then
    select usuario.nome into new.created_by_name_snapshot
    from public.usuarios usuario
    where usuario.id = new.created_by;
  end if;

  if new.cancelled_by is not null
     and (old.cancelled_by is distinct from new.cancelled_by or new.cancelled_by_name_snapshot is null) then
    select usuario.nome into new.cancelled_by_name_snapshot
    from public.usuarios usuario
    where usuario.id = new.cancelled_by;
  end if;

  return new;
end;
$$;

drop trigger if exists supply_purchase_orders_actor_snapshots on public.supply_purchase_orders;
create trigger supply_purchase_orders_actor_snapshots
before insert or update of created_by, cancelled_by on public.supply_purchase_orders
for each row execute function private.set_supply_purchase_order_actor_snapshots();