create or replace function app.can_read_supply_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app.can('quotes', 'view'))
    and p_quote_id = any(app.readable_supply_quote_ids());
$$;

drop policy if exists supply_quotes_read_scoped on public.supply_quotes;
create policy supply_quotes_read_scoped
on public.supply_quotes for select to authenticated
using (
  (select app.can('quotes', 'view'))
  and id = any(app.readable_supply_quote_ids())
);

drop policy if exists supply_quote_stores_read_scoped on public.supply_quote_stores;
create policy supply_quote_stores_read_scoped
on public.supply_quote_stores for select to authenticated
using (
  (select app.can('quotes', 'view'))
  and quote_id = any(app.readable_supply_quote_ids())
);

drop policy if exists supply_quote_items_read_scoped on public.supply_quote_items;
create policy supply_quote_items_read_scoped
on public.supply_quote_items for select to authenticated
using (
  (select app.can('quotes', 'view'))
  and quote_id = any(app.readable_supply_quote_ids())
  and (store_id is null or app.can_store('quotes', 'view', store_id))
);

drop policy if exists supply_quote_attachments_read_scoped on public.supply_quote_attachments;
create policy supply_quote_attachments_read_scoped
on public.supply_quote_attachments for select to authenticated
using (
  deleted_at is null
  and (select app.can('quotes', 'view'))
  and quote_id = any(app.readable_supply_quote_ids())
);
