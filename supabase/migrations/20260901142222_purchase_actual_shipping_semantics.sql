alter table public.supply_purchase_order_items
  add column if not exists actual_shipping_type public.supply_shipping_type;

update public.supply_purchase_order_items line
set actual_shipping_type = case
  when line.shipping_amount > 0 then 'informed'::public.supply_shipping_type
  when purchase_order.source = 'legacy_backfill' then 'pending'::public.supply_shipping_type
  else 'free'::public.supply_shipping_type
end
from public.supply_purchase_orders purchase_order
where purchase_order.id = line.order_id
  and line.actual_shipping_type is null;

alter table public.supply_purchase_order_items
  alter column actual_shipping_type set default 'pending'::public.supply_shipping_type,
  alter column actual_shipping_type set not null;

create or replace function private.set_supply_purchase_order_item_shipping_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  select purchase_order.source
  into v_source
  from public.supply_purchase_orders purchase_order
  where purchase_order.id = new.order_id;

  if new.shipping_amount > 0 then
    new.actual_shipping_type := 'informed'::public.supply_shipping_type;
  elsif v_source = 'legacy_backfill' then
    -- No modelo anterior, zero pode significar gratis ou simplesmente nao informado.
    -- Preservamos a incerteza historica em vez de inventar frete gratis.
    new.actual_shipping_type := 'pending'::public.supply_shipping_type;
  else
    -- Registros manuais V2 so chegam aqui depois da validacao explicita do RPC V2.
    new.actual_shipping_type := 'free'::public.supply_shipping_type;
  end if;

  return new;
end;
$$;

drop trigger if exists supply_purchase_order_items_shipping_type on public.supply_purchase_order_items;
create trigger supply_purchase_order_items_shipping_type
before insert or update of shipping_amount, order_id
on public.supply_purchase_order_items
for each row execute function private.set_supply_purchase_order_item_shipping_type();

create or replace function public.create_supply_purchase_order_v2(
  p_purchase_id uuid,
  p_purchased_on date,
  p_supplier_order_ref text,
  p_expected_delivery_date date,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_shipping_raw text;
  v_shipping_normalized text;
  v_shipping numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase order lines must be a non-empty array';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_shipping_raw := nullif(trim(v_line ->> 'shipping_amount'), '');
    if v_shipping_raw is null then
      raise exception 'purchase shipping must be informed; use 0 for free shipping';
    end if;

    v_shipping_normalized := private.normalize_decimal_input(v_shipping_raw);
    if nullif(v_shipping_normalized, '') is null then
      raise exception 'invalid purchase shipping amount';
    end if;

    v_shipping := v_shipping_normalized::numeric;
    if v_shipping < 0 then
      raise exception 'purchase shipping amount cannot be negative';
    end if;
  end loop;

  return public.create_supply_purchase_order(
    p_purchase_id,
    p_purchased_on,
    p_supplier_order_ref,
    p_expected_delivery_date,
    p_notes,
    p_lines
  );
end;
$$;

-- A versao antiga fica apenas como implementacao interna durante o pacote V2.
-- A interface autenticada deve chamar exclusivamente a versao V2, que preserva
-- a diferenca entre campo vazio e zero digitado explicitamente.
revoke execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.create_supply_purchase_order_v2(uuid, date, text, date, text, jsonb)
  from public, anon;
grant execute on function public.create_supply_purchase_order_v2(uuid, date, text, date, text, jsonb)
  to authenticated;