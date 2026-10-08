begin;

alter table public.supply_purchase_payments
  add column if not exists forwarded_to_finance_at timestamptz null,
  add column if not exists forwarded_to_finance_by uuid null references public.usuarios(id) on delete set null;

alter table public.works_service_payments
  add column if not exists forwarded_to_finance_at timestamptz null,
  add column if not exists forwarded_to_finance_by uuid null references public.usuarios(id) on delete set null;

create or replace function public.update_planned_finance_payment_v1(
  p_source text,
  p_payment_ids uuid[],
  p_due_date date,
  p_forwarded_to_finance boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_usuario_id();
  v_id uuid;
  v_before jsonb;
  v_expected_count integer;
  v_found_count integer;
begin
  if not app.can('finance','manage') then raise exception 'permission denied'; end if;
  if p_due_date is null then raise exception 'due date is required'; end if;
  v_expected_count := coalesce(array_length(p_payment_ids, 1), 0);
  if v_expected_count = 0 then raise exception 'payment ids are required'; end if;

  if p_source = 'purchase' then
    select count(*) into v_found_count
    from public.supply_purchase_payments
    where id = any(p_payment_ids) and status = 'planned' and cancelled_at is null;
    if v_found_count <> v_expected_count then
      raise exception 'one or more purchase payments are not planned or were not found';
    end if;
    foreach v_id in array p_payment_ids loop
      select to_jsonb(payment) into v_before
      from public.supply_purchase_payments payment where payment.id = v_id for update;
      update public.supply_purchase_payments
      set first_due_date = p_due_date,
          forwarded_to_finance_at = case when p_forwarded_to_finance then coalesce(forwarded_to_finance_at, now()) else null end,
          forwarded_to_finance_by = case when p_forwarded_to_finance then coalesce(forwarded_to_finance_by, v_actor) else null end,
          updated_by = v_actor, updated_at = now()
      where id = v_id;
      insert into public.audit_logs (actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin)
      values (v_actor, 'finance.planned_payment.updated', 'supply_purchase_payment', v_id, v_before,
        (select to_jsonb(payment) from public.supply_purchase_payments payment where payment.id = v_id), 'database');
    end loop;
  elsif p_source = 'work' then
    select count(*) into v_found_count
    from public.works_service_payments
    where id = any(p_payment_ids) and status in ('planned','overdue');
    if v_found_count <> v_expected_count then
      raise exception 'one or more work payments are not planned or were not found';
    end if;
    foreach v_id in array p_payment_ids loop
      select to_jsonb(payment) into v_before
      from public.works_service_payments payment where payment.id = v_id for update;
      update public.works_service_payments
      set due_date = p_due_date,
          forwarded_to_finance_at = case when p_forwarded_to_finance then coalesce(forwarded_to_finance_at, now()) else null end,
          forwarded_to_finance_by = case when p_forwarded_to_finance then coalesce(forwarded_to_finance_by, v_actor) else null end,
          updated_by = v_actor, updated_at = now()
      where id = v_id;
      insert into public.audit_logs (actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin)
      values (v_actor, 'finance.planned_payment.updated', 'works_service_payment', v_id, v_before,
        (select to_jsonb(payment) from public.works_service_payments payment where payment.id = v_id), 'database');
    end loop;
  else
    raise exception 'invalid source';
  end if;
end;
$$;

revoke all on function public.update_planned_finance_payment_v1(text, uuid[], date, boolean) from public;
grant execute on function public.update_planned_finance_payment_v1(text, uuid[], date, boolean) to authenticated;

commit;
