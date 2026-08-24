-- Permite reabrir uma cotacao Recebida como Rascunho enquanto nao houver compra ativa.
-- Se existir uma CMP ativa, o retorno deve ser feito primeiro pelo fluxo "Devolver para cotacao".

create or replace function public.set_supply_quote_status(
  p_quote_id uuid,
  p_status public.supply_quote_status
)
returns public.supply_quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.supply_quote_status;
  v_actor uuid := app.current_usuario_id();
begin
  select quote.status
  into v_previous_status
  from public.supply_quotes quote
  where quote.id = p_quote_id
  for update of quote;

  if not found
    or not app.can('quotes', 'edit')
    or not exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
    )
    or exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
        and not app.can_store('quotes', 'edit', quote_store.store_id)
    ) then
    raise exception 'permission denied';
  end if;

  if v_previous_status = 'received'
    and p_status = 'draft'
    and exists (
      select 1
      from public.supply_purchases purchase
      where purchase.quote_id = p_quote_id
        and purchase.status not in ('returned', 'cancelled')
    ) then
    raise exception 'quote has active purchase';
  end if;

  if not (
    (v_previous_status = 'draft' and p_status in ('received', 'cancelled'))
    or (v_previous_status = 'received' and p_status in ('draft', 'cancelled', 'expired'))
  ) then
    raise exception 'invalid quote status transition';
  end if;

  perform set_config('app.supply_quote_status_change', 'allowed', true);

  update public.supply_quotes
  set status = p_status, updated_by = v_actor
  where id = p_quote_id;

  perform set_config('app.supply_quote_status_change', '', true);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'quote.status_changed',
    'quote',
    p_quote_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status),
    'database'
  );

  return p_status;
exception
  when others then
    perform set_config('app.supply_quote_status_change', '', true);
    raise;
end;
$$;
