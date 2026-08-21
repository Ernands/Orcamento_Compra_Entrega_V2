create or replace function private.normalize_decimal_input(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := regexp_replace(coalesce(trim(p_value), ''), '\s+', '', 'g');
begin
  if v_value = '' then return '0'; end if;
  if position(',' in v_value) > 0 and position('.' in v_value) > 0 then
    return replace(replace(v_value, '.', ''), ',', '.');
  end if;
  return replace(v_value, ',', '.');
end;
$$;

revoke all on function private.normalize_decimal_input(text) from public, anon, authenticated;

alter function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) rename to save_supply_quote_legacy;

create or replace function public.save_supply_quote(
  p_quote_id uuid,
  p_supplier_id uuid,
  p_supplier_channel_id uuid,
  p_quote_date date,
  p_valid_until date,
  p_contact text,
  p_context_type public.supply_quote_context,
  p_status public.supply_quote_status,
  p_notes text,
  p_store_ids uuid[],
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'quantity', private.normalize_decimal_input(item->>'quantity'),
      'unit_price', private.normalize_decimal_input(item->>'unit_price'),
      'discount_amount', private.normalize_decimal_input(coalesce(nullif(item->>'discount_amount', ''), '0')),
      'shipping_amount', case
        when item->>'shipping_amount' is null or trim(item->>'shipping_amount') = '' then null
        else private.normalize_decimal_input(item->>'shipping_amount')
      end,
      'other_costs', private.normalize_decimal_input(coalesce(nullif(item->>'other_costs', ''), '0')),
      'minimum_quantity', case
        when item->>'minimum_quantity' is null or trim(item->>'minimum_quantity') = '' then null
        else private.normalize_decimal_input(item->>'minimum_quantity')
      end
    ) order by ordinality
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(p_items) with ordinality as source(item, ordinality);

  return public.save_supply_quote_legacy(
    p_quote_id, p_supplier_id, p_supplier_channel_id, p_quote_date, p_valid_until,
    p_contact, p_context_type, p_status, p_notes, p_store_ids, v_items
  );
end;
$$;

revoke all on function public.save_supply_quote_legacy(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon, authenticated;
revoke all on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) to authenticated, service_role;