create or replace function public.create_supply_purchase_batch_operation_v1(
  p_operations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_operation jsonb;
  v_purchase_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_operations) is distinct from 'array'
     or jsonb_array_length(p_operations) = 0 then
    raise exception 'purchase batch operations must be a non-empty array';
  end if;

  for v_operation in
    select value from jsonb_array_elements(p_operations)
  loop
    v_purchase_id := nullif(v_operation ->> 'purchase_id', '')::uuid;
    if v_purchase_id is null then
      raise exception 'purchase batch operation requires purchase_id';
    end if;

    v_result := public.create_supply_purchase_operation_v1(
      v_purchase_id,
      nullif(v_operation ->> 'purchased_on', '')::date,
      v_operation ->> 'supplier_order_ref',
      nullif(v_operation ->> 'expected_delivery_date', '')::date,
      v_operation ->> 'notes',
      v_operation -> 'lines',
      v_operation -> 'payments'
    );

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'purchase_id', v_purchase_id,
        'order_id', v_result ->> 'order_id',
        'payment_ids', coalesce(v_result -> 'payment_ids', '[]'::jsonb)
      )
    );
  end loop;

  return jsonb_build_object('operations', v_results);
end;
$function$;

revoke execute on function public.create_supply_purchase_batch_operation_v1(jsonb) from public;
revoke execute on function public.create_supply_purchase_batch_operation_v1(jsonb) from anon;
grant execute on function public.create_supply_purchase_batch_operation_v1(jsonb) to authenticated;
