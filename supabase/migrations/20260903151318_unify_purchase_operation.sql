-- Compra realizada, pagamento e distribuicao por loja devem nascer como uma
-- unica operacao. Arquivos continuam opcionais e sao vinculados ao pedido logo
-- depois do upload no Storage.

alter table public.supply_purchase_payments
  add column if not exists cancelled_by uuid references public.usuarios(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

update public.supply_purchase_payments
set cancelled_at = coalesce(cancelled_at, updated_at, created_at),
    cancellation_reason = coalesce(nullif(trim(cancellation_reason), ''), 'Registro cancelado antes da conciliacao unificada.')
where status = 'cancelled'
  and (cancelled_at is null or nullif(trim(cancellation_reason), '') is null);

alter table public.supply_purchase_payments
  drop constraint if exists supply_purchase_payments_cancellation_state_check;
alter table public.supply_purchase_payments
  add constraint supply_purchase_payments_cancellation_state_check check (
    (status = 'cancelled' and cancelled_at is not null and nullif(trim(cancellation_reason), '') is not null)
    or
    (status <> 'cancelled' and cancelled_at is null and cancellation_reason is null)
  );

create or replace function private.validate_supply_purchase_payment_order_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.supply_purchase_orders;
  v_order_total numeric(16,2);
  v_pending_total_count integer;
  v_other_payments numeric(16,2);
begin
  if new.purchase_order_id is null or new.status = 'cancelled' then
    return new;
  end if;

  select purchase_order.*
  into v_order
  from public.supply_purchase_orders purchase_order
  where purchase_order.id = new.purchase_order_id;

  if v_order.id is null or v_order.purchase_id <> new.purchase_id then
    raise exception 'purchase order is outside purchase';
  end if;
  if v_order.status <> 'active' then
    raise exception 'cannot register payment for a cancelled purchase order';
  end if;

  select
    coalesce(sum(line.line_total), 0),
    count(*) filter (where line.line_total is null)
  into v_order_total, v_pending_total_count
  from public.supply_purchase_order_items line
  where line.order_id = new.purchase_order_id;

  if v_pending_total_count > 0 then
    return new;
  end if;

  select coalesce(sum(payment.amount), 0)
  into v_other_payments
  from public.supply_purchase_payments payment
  where payment.purchase_order_id = new.purchase_order_id
    and payment.status <> 'cancelled'
    and payment.id is distinct from new.id;

  if v_other_payments + new.amount > v_order_total + 0.01 then
    raise exception 'payments exceed purchase order total';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_supply_purchase_payment_order_total()
  from public, anon, authenticated, service_role;

drop trigger if exists supply_purchase_payments_validate_order_total
  on public.supply_purchase_payments;
create trigger supply_purchase_payments_validate_order_total
before insert or update of purchase_id, purchase_order_id, amount, status
on public.supply_purchase_payments
for each row execute function private.validate_supply_purchase_payment_order_total();

create or replace function public.create_supply_purchase_operation_v1(
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
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_line_payload jsonb;
  v_line_id uuid;
  v_distribution_status text;
  v_payment jsonb;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_payment_total numeric(16,2) := 0;
  v_payment_amount numeric(16,2);
  v_order_total numeric(16,2);
  v_pending_total_count integer;
  v_payment_status text;
  v_paid_at timestamptz;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase operation lines must be a non-empty array';
  end if;
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'purchase operation requires at least one payment';
  end if;
  if exists (
    select 1
    from (
      select
        nullif(value ->> 'purchase_item_id', '')::uuid as purchase_item_id,
        nullif(value ->> 'purchase_destination_id', '')::uuid as purchase_destination_id,
        count(*)
      from jsonb_array_elements(p_lines)
      group by 1, 2
      having count(*) > 1
    ) duplicate_line
  ) then
    raise exception 'purchase operation has duplicate item and destination lines';
  end if;

  v_order_id := public.create_supply_purchase_order_v2(
    p_purchase_id,
    p_purchased_on,
    p_supplier_order_ref,
    p_expected_delivery_date,
    p_notes,
    p_lines
  );

  for v_line_payload in select value from jsonb_array_elements(p_lines)
  loop
    select line.id
    into v_line_id
    from public.supply_purchase_order_items line
    where line.order_id = v_order_id
      and line.purchase_item_id = nullif(v_line_payload ->> 'purchase_item_id', '')::uuid
      and line.purchase_destination_id is not distinct from nullif(v_line_payload ->> 'purchase_destination_id', '')::uuid;

    if v_line_id is null then
      raise exception 'purchase operation line was not created';
    end if;

    select line.store_distribution_status
    into v_distribution_status
    from public.supply_purchase_order_items line
    where line.id = v_line_id;

    if v_distribution_status <> 'confirmed' then
      if jsonb_typeof(v_line_payload -> 'store_allocations') is distinct from 'array'
         or jsonb_array_length(v_line_payload -> 'store_allocations') = 0 then
        raise exception 'purchase operation requires exact store distribution';
      end if;

      v_distribution_status := public.save_supply_purchase_order_line_distribution(
        v_line_id,
        v_line_payload -> 'store_allocations'
      );
    end if;

    if v_distribution_status <> 'confirmed' then
      raise exception 'purchase operation store distribution is incomplete';
    end if;
  end loop;

  select
    coalesce(sum(line.line_total), 0),
    count(*) filter (where line.line_total is null)
  into v_order_total, v_pending_total_count
  from public.supply_purchase_order_items line
  where line.order_id = v_order_id;

  if v_pending_total_count > 0 then
    raise exception 'purchase operation requires all line totals to be known';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_payment_status := nullif(trim(v_payment ->> 'status'), '');
    if v_payment_status not in ('planned', 'paid') then
      raise exception 'invalid purchase operation payment status';
    end if;

    v_payment_amount := nullif(private.normalize_decimal_input(v_payment ->> 'amount'), '')::numeric;
    if v_payment_amount is null or v_payment_amount <= 0 then
      raise exception 'purchase operation payment amount must be positive';
    end if;
    v_payment_total := v_payment_total + v_payment_amount;
  end loop;

  if abs(v_payment_total - v_order_total) > 0.01 then
    raise exception 'purchase operation payments must equal purchase order total';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_payment_status := nullif(trim(v_payment ->> 'status'), '');
    v_paid_at := case
      when v_payment_status = 'paid'
        then coalesce(nullif(v_payment ->> 'paid_at', '')::timestamptz, now())
      else null
    end;

    v_payment_id := public.save_supply_purchase_payment(
      null,
      p_purchase_id,
      v_order_id,
      v_payment ->> 'payment_method',
      v_payment ->> 'source_label',
      nullif(private.normalize_decimal_input(v_payment ->> 'amount'), '')::numeric,
      nullif(private.normalize_decimal_input(v_payment ->> 'entry_amount'), '')::numeric,
      nullif(v_payment ->> 'installment_count', '')::integer,
      nullif(v_payment ->> 'first_due_date', '')::date,
      v_payment_status,
      v_paid_at,
      v_payment ->> 'notes'
    );
    v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'payment_ids', v_payment_ids
  );
end;
$$;

revoke all on function public.create_supply_purchase_operation_v1(
  uuid, date, text, date, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.create_supply_purchase_operation_v1(
  uuid, date, text, date, text, jsonb, jsonb
) to authenticated, service_role;

create or replace function public.cancel_supply_purchase_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.supply_purchase_payments;
  v_actor uuid := app.current_usuario_id();
begin
  select payment.*
  into v_payment
  from public.supply_purchase_payments payment
  where payment.id = p_payment_id
  for update;

  if v_payment.id is null or not app.can_edit_supply_purchase(v_payment.purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_payment.status = 'cancelled' then
    raise exception 'payment is already cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'payment cancellation reason is required';
  end if;

  update public.supply_purchase_payments
  set status = 'cancelled',
      paid_at = case when v_payment.status = 'paid' then paid_at else null end,
      cancelled_by = v_actor,
      cancelled_at = now(),
      cancellation_reason = trim(p_reason),
      updated_by = v_actor
  where id = p_payment_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    case when v_payment.status = 'paid' then 'purchase.payment.reversed' else 'purchase.payment.cancelled' end,
    'supply_purchase_payment',
    p_payment_id,
    to_jsonb(v_payment),
    (select to_jsonb(payment) from public.supply_purchase_payments payment where payment.id = p_payment_id),
    'database'
  );
end;
$$;

revoke all on function public.cancel_supply_purchase_payment(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_supply_purchase_payment(uuid, text)
  to authenticated, service_role;

create or replace function public.cancel_supply_purchase_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.supply_purchase_orders;
  v_actor uuid := app.current_usuario_id();
  v_item_id uuid;
begin
  select purchase_order.*
  into v_order
  from public.supply_purchase_orders purchase_order
  where purchase_order.id = p_order_id
  for update;

  if v_order.id is null or not app.can_edit_supply_purchase(v_order.purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'purchase order is already cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'cancellation reason is required';
  end if;
  if exists (
    select 1
    from public.supply_purchase_payments payment
    where payment.purchase_order_id = p_order_id
      and payment.status = 'paid'
  ) then
    raise exception 'reverse or reclassify paid payments before cancelling purchase order';
  end if;

  update public.supply_purchase_payments
  set status = 'cancelled',
      cancelled_by = v_actor,
      cancelled_at = now(),
      cancellation_reason = 'Cancelado automaticamente com a compra: ' || trim(p_reason),
      updated_by = v_actor
  where purchase_order_id = p_order_id
    and status = 'planned';

  update public.supply_purchase_orders
  set status = 'cancelled',
      cancelled_by = v_actor,
      cancelled_at = now(),
      cancellation_reason = trim(p_reason)
  where id = p_order_id;

  for v_item_id in
    select distinct line.purchase_item_id
    from public.supply_purchase_order_items line
    where line.order_id = p_order_id
      and line.purchase_item_id is not null
  loop
    perform private.sync_supply_purchase_item_execution_totals(v_item_id);
  end loop;

  perform private.recalculate_supply_purchase_status(v_order.purchase_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.order.cancelled',
    'supply_purchase_order',
    p_order_id,
    to_jsonb(v_order),
    (select to_jsonb(purchase_order) from public.supply_purchase_orders purchase_order where purchase_order.id = p_order_id),
    'database'
  );
end;
$$;

revoke all on function public.cancel_supply_purchase_order(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_supply_purchase_order(uuid, text)
  to authenticated, service_role;
