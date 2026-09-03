alter table public.supply_purchase_payments
  add column if not exists purchase_order_id uuid
    references public.supply_purchase_orders(id) on delete set null;

create index if not exists supply_purchase_payments_order_idx
  on public.supply_purchase_payments (purchase_order_id)
  where purchase_order_id is not null;

drop function if exists public.save_supply_purchase_payment(
  uuid, uuid, text, text, numeric, numeric, integer, date, text, timestamptz, text
);

create function public.save_supply_purchase_payment(
  p_payment_id uuid,
  p_purchase_id uuid,
  p_purchase_order_id uuid,
  p_payment_method text,
  p_source_label text,
  p_amount numeric,
  p_entry_amount numeric,
  p_installment_count integer,
  p_first_due_date date,
  p_status text,
  p_paid_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_payment_id;
  v_actor uuid := app.current_usuario_id();
  v_before jsonb;
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;
  if p_purchase_order_id is not null and not exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = p_purchase_order_id
      and purchase_order.purchase_id = p_purchase_id
  ) then
    raise exception 'purchase order is outside purchase';
  end if;
  if p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_entry_amount is not null and (p_entry_amount < 0 or p_entry_amount > p_amount) then
    raise exception 'invalid entry amount';
  end if;

  if v_id is null then
    insert into public.supply_purchase_payments (
      purchase_id,
      purchase_order_id,
      payment_method,
      source_label,
      amount,
      entry_amount,
      installment_count,
      first_due_date,
      status,
      paid_at,
      notes,
      created_by,
      updated_by
    ) values (
      p_purchase_id,
      p_purchase_order_id,
      p_payment_method,
      nullif(trim(p_source_label), ''),
      p_amount,
      p_entry_amount,
      p_installment_count,
      p_first_due_date,
      p_status,
      p_paid_at,
      nullif(trim(p_notes), ''),
      v_actor,
      v_actor
    ) returning id into v_id;
  else
    select to_jsonb(payment)
    into v_before
    from public.supply_purchase_payments payment
    where payment.id = v_id
      and payment.purchase_id = p_purchase_id
    for update;

    if v_before is null then
      raise exception 'payment not found';
    end if;

    update public.supply_purchase_payments
    set
      purchase_order_id = p_purchase_order_id,
      payment_method = p_payment_method,
      source_label = nullif(trim(p_source_label), ''),
      amount = p_amount,
      entry_amount = p_entry_amount,
      installment_count = p_installment_count,
      first_due_date = p_first_due_date,
      status = p_status,
      paid_at = p_paid_at,
      notes = nullif(trim(p_notes), ''),
      updated_by = v_actor
    where id = v_id;
  end if;

  perform private.recalculate_supply_purchase_status(p_purchase_id);

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    origin
  ) values (
    v_actor,
    'purchase.payment.saved',
    'supply_purchase_payment',
    v_id,
    v_before,
    (select to_jsonb(payment) from public.supply_purchase_payments payment where payment.id = v_id),
    'database'
  );

  return v_id;
end;
$$;

revoke all on function public.save_supply_purchase_payment(
  uuid, uuid, uuid, text, text, numeric, numeric, integer, date, text, timestamptz, text
) from public, anon, authenticated, service_role;

grant execute on function public.save_supply_purchase_payment(
  uuid, uuid, uuid, text, text, numeric, numeric, integer, date, text, timestamptz, text
) to authenticated, service_role;
