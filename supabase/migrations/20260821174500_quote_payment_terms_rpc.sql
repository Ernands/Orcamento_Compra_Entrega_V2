create or replace function public.set_supply_quote_payment_terms(
  p_quote_id uuid,
  p_payment_method text,
  p_entry_amount numeric,
  p_installment_count integer,
  p_payment_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_usuario_id();
  v_before jsonb;
begin
  if not app.can_edit_supply_quote(p_quote_id) then raise exception 'permission denied'; end if;
  if p_payment_method is not null and trim(p_payment_method) <> ''
     and p_payment_method not in ('pix','boleto','bank_transfer','credit_card','debit_card','cash','invoiced','other') then
    raise exception 'invalid payment method';
  end if;
  if p_entry_amount is not null and p_entry_amount < 0 then raise exception 'invalid entry amount'; end if;
  if p_installment_count is not null and p_installment_count < 1 then raise exception 'invalid installment count'; end if;

  select jsonb_build_object(
    'payment_method', payment_method,
    'entry_amount', entry_amount,
    'installment_count', installment_count,
    'payment_notes', payment_notes
  ) into v_before
  from public.supply_quotes where id = p_quote_id for update;

  if v_before is null then raise exception 'quote not found'; end if;

  update public.supply_quotes
  set payment_method = nullif(trim(p_payment_method), ''),
      entry_amount = p_entry_amount,
      installment_count = p_installment_count,
      payment_notes = nullif(trim(p_payment_notes), ''),
      updated_by = v_actor
  where id = p_quote_id;

  insert into public.audit_logs (actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin)
  values (
    v_actor, 'quote.payment_terms.updated', 'supply_quote', p_quote_id, v_before,
    (select jsonb_build_object(
      'payment_method', payment_method,
      'entry_amount', entry_amount,
      'installment_count', installment_count,
      'payment_notes', payment_notes
    ) from public.supply_quotes where id = p_quote_id),
    'database'
  );
end;
$$;

revoke all on function public.set_supply_quote_payment_terms(uuid, text, numeric, integer, text)
from public, anon, authenticated;
grant execute on function public.set_supply_quote_payment_terms(uuid, text, numeric, integer, text)
to authenticated, service_role;