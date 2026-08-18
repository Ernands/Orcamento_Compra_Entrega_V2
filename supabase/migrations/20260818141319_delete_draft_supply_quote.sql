create or replace function public.delete_supply_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.supply_quote_status;
  v_actor uuid := app.current_usuario_id();
  v_before jsonb;
begin
  select quote.status
  into v_status
  from public.supply_quotes quote
  where quote.id = p_quote_id
  for update of quote;

  if not found then
    raise exception 'quote not found';
  end if;

  if v_status <> 'draft' then
    raise exception 'only draft quotes can be deleted';
  end if;

  if not app.can('quotes', 'edit')
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

  select jsonb_build_object(
    'quote', to_jsonb(quote),
    'stores', coalesce(
      (
        select jsonb_agg(to_jsonb(quote_store) order by quote_store.created_at)
        from public.supply_quote_stores quote_store
        where quote_store.quote_id = p_quote_id
      ),
      '[]'::jsonb
    ),
    'items', coalesce(
      (
        select jsonb_agg(to_jsonb(quote_item) order by quote_item.created_at)
        from public.supply_quote_items quote_item
        where quote_item.quote_id = p_quote_id
      ),
      '[]'::jsonb
    )
  )
  into v_before
  from public.supply_quotes quote
  where quote.id = p_quote_id;

  delete from public.supply_quotes
  where id = p_quote_id;

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
    'quote.deleted',
    'quote',
    p_quote_id,
    v_before,
    null,
    'database'
  );
end;
$$;

revoke all on function public.delete_supply_quote(uuid)
from public, anon, authenticated;

grant execute on function public.delete_supply_quote(uuid)
to authenticated, service_role;;
