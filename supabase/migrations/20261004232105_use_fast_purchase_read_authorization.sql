create or replace function app.can_read_supply_purchase(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_read_supply_purchase_fast(p_purchase_id);
$$;
