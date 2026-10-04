create table public.supply_purchase_payment_occurrences (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supply_purchase_payments(id) on delete cascade,
  attachment_id uuid null references public.supply_purchase_attachments(id) on delete set null,
  occurred_on date not null,
  amount numeric(16,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('pix','boleto','bank_transfer','credit_card','debit_card','cash','invoiced','other')),
  reference_label text null,
  source text not null default 'manual' check (source in ('manual','proof_backfill')),
  notes text null,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supply_purchase_payment_occurrences_payment_idx
  on public.supply_purchase_payment_occurrences(payment_id, position, occurred_on);
create index supply_purchase_payment_occurrences_date_idx
  on public.supply_purchase_payment_occurrences(occurred_on);
create index supply_purchase_payment_occurrences_attachment_idx
  on public.supply_purchase_payment_occurrences(attachment_id)
  where attachment_id is not null;

alter table public.supply_purchase_payment_occurrences enable row level security;
revoke all on table public.supply_purchase_payment_occurrences from anon, authenticated;
grant select on table public.supply_purchase_payment_occurrences to authenticated;

create policy supply_purchase_payment_occurrences_read_scoped
on public.supply_purchase_payment_occurrences
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_payments payment
    where payment.id = payment_id
      and app.can_read_supply_purchase(payment.purchase_id)
  )
);

create or replace function public.replace_supply_purchase_payment_occurrences(
  p_payment_id uuid,
  p_occurrences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_purchase_id uuid;
  v_occurrence jsonb;
  v_position integer;
  v_attachment_id uuid;
  v_amount numeric(16,2);
  v_method text;
  v_date date;
  v_source text;
  v_count integer := 0;
  v_total numeric(16,2) := 0;
  v_before jsonb;
begin
  select payment.purchase_id
  into v_purchase_id
  from public.supply_purchase_payments payment
  where payment.id = p_payment_id;

  if v_purchase_id is null then
    raise exception 'purchase payment not found';
  end if;
  if not app.can_edit_supply_purchase(v_purchase_id) then
    raise exception 'permission denied';
  end if;
  if p_occurrences is null then
    p_occurrences := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_occurrences) is distinct from 'array' then
    raise exception 'payment occurrences must be an array';
  end if;

  select coalesce(jsonb_agg(to_jsonb(occurrence) order by occurrence.position, occurrence.occurred_on, occurrence.id), '[]'::jsonb)
  into v_before
  from public.supply_purchase_payment_occurrences occurrence
  where occurrence.payment_id = p_payment_id;

  delete from public.supply_purchase_payment_occurrences
  where payment_id = p_payment_id;

  for v_occurrence, v_position in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_occurrences) with ordinality
  loop
    v_date := nullif(v_occurrence ->> 'occurred_on', '')::date;
    v_amount := nullif(private.normalize_decimal_input(v_occurrence ->> 'amount'), '')::numeric;
    v_method := nullif(trim(v_occurrence ->> 'payment_method'), '');
    v_source := coalesce(nullif(trim(v_occurrence ->> 'source'), ''), 'manual');
    v_attachment_id := nullif(v_occurrence ->> 'attachment_id', '')::uuid;

    if v_date is null then
      raise exception 'payment occurrence date is required';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'payment occurrence amount must be positive';
    end if;
    if v_method not in ('pix','boleto','bank_transfer','credit_card','debit_card','cash','invoiced','other') then
      raise exception 'invalid payment occurrence method';
    end if;
    if v_source not in ('manual','proof_backfill') then
      raise exception 'invalid payment occurrence source';
    end if;
    if v_attachment_id is not null and not exists (
      select 1
      from public.supply_purchase_attachments attachment
      where attachment.id = v_attachment_id
        and attachment.purchase_id = v_purchase_id
        and attachment.deleted_at is null
    ) then
      raise exception 'payment occurrence attachment is outside purchase';
    end if;

    insert into public.supply_purchase_payment_occurrences (
      payment_id,
      attachment_id,
      occurred_on,
      amount,
      payment_method,
      reference_label,
      source,
      notes,
      position
    ) values (
      p_payment_id,
      v_attachment_id,
      v_date,
      v_amount,
      v_method,
      nullif(trim(v_occurrence ->> 'reference_label'), ''),
      v_source,
      nullif(trim(v_occurrence ->> 'notes'), ''),
      v_position
    );

    v_count := v_count + 1;
    v_total := v_total + v_amount;
  end loop;

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    origin
  ) values (
    app.current_usuario_id(),
    'purchase.payment.occurrences.replaced',
    'supply_purchase_payment',
    p_payment_id,
    v_before,
    jsonb_build_object('count', v_count, 'total', v_total),
    'database'
  );

  return jsonb_build_object('count', v_count, 'total', v_total);
end;
$function$;

revoke all on function public.replace_supply_purchase_payment_occurrences(uuid, jsonb) from public, anon;
grant execute on function public.replace_supply_purchase_payment_occurrences(uuid, jsonb) to authenticated;

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
    if v_payment ? 'occurrences' then
      perform public.replace_supply_purchase_payment_occurrences(
        v_payment_id,
        coalesce(v_payment -> 'occurrences', '[]'::jsonb)
      );
    end if;
  end loop;

  return v_result;
end;
$function$;

revoke all on function public.create_supply_purchase_operation_v2(uuid, date, text, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_supply_purchase_operation_v2(uuid, date, text, date, text, jsonb, jsonb) to authenticated;

create or replace function public.create_supply_purchase_batch_operation_v2(p_operations jsonb)
returns jsonb
language plpgsql
set search_path to ''
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

    v_result := public.create_supply_purchase_operation_v2(
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

revoke all on function public.create_supply_purchase_batch_operation_v2(jsonb) from public, anon;
grant execute on function public.create_supply_purchase_batch_operation_v2(jsonb) to authenticated;
