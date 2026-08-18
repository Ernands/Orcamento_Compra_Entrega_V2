create or replace function private.normalize_quote_decimal_input(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
begin
  if p_value is null then
    return null;
  end if;

  v_value := regexp_replace(trim(p_value), '[[:space:]]+', '', 'g');
  if v_value = '' then
    return null;
  end if;

  if position(',' in v_value) > 0 and position('.' in v_value) > 0 then
    return replace(replace(v_value, '.', ''), ',', '.');
  end if;

  return replace(v_value, ',', '.');
end;
$$;

revoke all on function private.normalize_quote_decimal_input(text)
from public, anon, authenticated;

alter function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) set schema private;

alter function private.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) rename to save_supply_quote_core;

revoke all on function private.save_supply_quote_core(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon, authenticated;

create function public.save_supply_quote(
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
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_normalized text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    return private.save_supply_quote_core(
      p_quote_id,
      p_supplier_id,
      p_supplier_channel_id,
      p_quote_date,
      p_valid_until,
      p_contact,
      p_context_type,
      p_status,
      p_notes,
      p_store_ids,
      p_items
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    foreach v_key in array array[
      'quantity',
      'unit_price',
      'discount_amount',
      'shipping_amount',
      'other_costs',
      'minimum_quantity'
    ] loop
      v_normalized := private.normalize_quote_decimal_input(v_item ->> v_key);
      if v_normalized is not null then
        v_item := jsonb_set(v_item, array[v_key], to_jsonb(v_normalized), true);
      end if;
    end loop;

    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  return private.save_supply_quote_core(
    p_quote_id,
    p_supplier_id,
    p_supplier_channel_id,
    p_quote_date,
    p_valid_until,
    p_contact,
    p_context_type,
    p_status,
    p_notes,
    p_store_ids,
    v_items
  );
end;
$$;

revoke all on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon;

grant execute on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';;
