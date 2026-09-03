alter table public.supply_purchases
  add column if not exists quote_context_snapshot_source text
    check (quote_context_snapshot_source is null or quote_context_snapshot_source in ('approval', 'backfill_current_quote'));

update public.supply_purchases
set quote_context_snapshot_source = 'backfill_current_quote'
where quote_context_snapshot_source is null;

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
  new.quote_context_snapshot_source := 'approval';
  return new;
end;
$$;