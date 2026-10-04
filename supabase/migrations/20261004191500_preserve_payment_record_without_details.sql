create or replace function public.create_supply_purchase_operation_v2(
  p_purchase_id uuid,
  p_purchased_on date,
  p_supplier_order_ref text,
  p_expected_delivery_date date,
  p_notes text,
  p_lines jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_payment jsonb;
  v_ordinality bigint;
  v_payment_id uuid;
  v_payment_ids jsonb;
begin
  v_result := public.create_supply_purchase_operation_v1(
    p_purchase_id,
    p_purchased_on,
    p_supplier_order_ref,
    p_expected_delivery_date,
    p_notes,
    p_lines,
    p_payments
  );
  v_payment_ids := coalesce(v_result -> 'payment_ids', '[]'::jsonb);

  if jsonb_array_length(v_payment_ids) <> jsonb_array_length(p_payments) then
    raise exception 'purchase operation payment mapping is inconsistent';
  end if;

  for v_payment, v_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_payments) with ordinality
  loop
    v_payment_id := (v_payment_ids ->> (v_ordinality - 1)::integer)::uuid;
    if v_payment ? 'occurrences'
       and jsonb_typeof(v_payment -> 'occurrences') = 'array'
       and jsonb_array_length(v_payment -> 'occurrences') > 0 then
      perform public.replace_supply_purchase_payment_occurrences(
        v_payment_id,
        v_payment -> 'occurrences'
      );
    end if;
  end loop;

  return v_result;
end;
$function$;

revoke all on function public.create_supply_purchase_operation_v2(uuid, date, text, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_supply_purchase_operation_v2(uuid, date, text, date, text, jsonb, jsonb) to authenticated;
