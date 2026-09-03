alter table public.supply_purchases
  add column if not exists supplier_channel_id_snapshot uuid,
  add column if not exists channel_type_snapshot public.supplier_channel_type,
  add column if not exists origin_city_snapshot text,
  add column if not exists origin_state_snapshot text,
  add column if not exists contact_snapshot text;

alter table public.supply_purchases
  drop constraint if exists supply_purchases_origin_state_snapshot_check,
  add constraint supply_purchases_origin_state_snapshot_check
    check (origin_state_snapshot is null or origin_state_snapshot ~ '^[A-Z]{2}$');

create or replace function private.set_supply_purchase_quote_context_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.supply_quotes;
begin
  select * into v_quote
  from public.supply_quotes quote
  where quote.id = new.quote_id;

  if v_quote.id is null then
    raise exception 'purchase quote not found';
  end if;

  new.supplier_channel_id_snapshot := v_quote.supplier_channel_id;
  new.channel_type_snapshot := v_quote.channel_snapshot;
  new.origin_city_snapshot := v_quote.origin_city_snapshot;
  new.origin_state_snapshot := v_quote.origin_state_snapshot;
  new.contact_snapshot := v_quote.contact_snapshot;
  return new;
end;
$$;

drop trigger if exists supply_purchases_quote_context_snapshots on public.supply_purchases;
create trigger supply_purchases_quote_context_snapshots
before insert or update of quote_id, approved_at on public.supply_purchases
for each row execute function private.set_supply_purchase_quote_context_snapshots();

update public.supply_purchases purchase
set supplier_channel_id_snapshot = quote.supplier_channel_id,
    channel_type_snapshot = quote.channel_snapshot,
    origin_city_snapshot = quote.origin_city_snapshot,
    origin_state_snapshot = quote.origin_state_snapshot,
    contact_snapshot = quote.contact_snapshot
from public.supply_quotes quote
where quote.id = purchase.quote_id
  and (
    purchase.supplier_channel_id_snapshot is null
    or purchase.channel_type_snapshot is null
    or purchase.origin_city_snapshot is distinct from quote.origin_city_snapshot
    or purchase.origin_state_snapshot is distinct from quote.origin_state_snapshot
    or purchase.contact_snapshot is distinct from quote.contact_snapshot
  );