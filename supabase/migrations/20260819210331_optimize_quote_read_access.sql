create or replace function app.readable_supply_quote_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with store_access as materialized (
    select
      store.id as store_id,
      app.can_store('quotes', 'view', store.id) as can_view
    from public.lojas store
  ),
  readable_quotes as (
    select quote_store.quote_id
    from public.supply_quote_stores quote_store
    join store_access access on access.store_id = quote_store.store_id
    group by quote_store.quote_id
    having bool_and(access.can_view)
  )
  select coalesce(array_agg(readable.quote_id), array[]::uuid[])
  from readable_quotes readable;
$$;

revoke all on function app.readable_supply_quote_ids() from public, anon, authenticated;
grant execute on function app.readable_supply_quote_ids() to authenticated, service_role;

create or replace function app.can_read_supply_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('quotes', 'view')
    and p_quote_id = any(app.readable_supply_quote_ids());
$$;

revoke all on function app.can_read_supply_quote(uuid) from public, anon, authenticated;
grant execute on function app.can_read_supply_quote(uuid) to authenticated, service_role;

drop policy if exists supply_quotes_read_scoped on public.supply_quotes;
create policy supply_quotes_read_scoped
on public.supply_quotes for select to authenticated
using (
  app.can('quotes', 'view')
  and id = any(app.readable_supply_quote_ids())
);

drop policy if exists supply_quote_stores_read_scoped on public.supply_quote_stores;
create policy supply_quote_stores_read_scoped
on public.supply_quote_stores for select to authenticated
using (
  app.can('quotes', 'view')
  and quote_id = any(app.readable_supply_quote_ids())
);

drop policy if exists supply_quote_items_read_scoped on public.supply_quote_items;
create policy supply_quote_items_read_scoped
on public.supply_quote_items for select to authenticated
using (
  app.can('quotes', 'view')
  and quote_id = any(app.readable_supply_quote_ids())
  and (store_id is null or app.can_store('quotes', 'view', store_id))
);

drop policy if exists supply_quote_attachments_read_scoped on public.supply_quote_attachments;
create policy supply_quote_attachments_read_scoped
on public.supply_quote_attachments for select to authenticated
using (
  deleted_at is null
  and app.can('quotes', 'view')
  and quote_id = any(app.readable_supply_quote_ids())
);
