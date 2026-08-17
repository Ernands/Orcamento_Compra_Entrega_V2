create or replace function private.enforce_supply_quote_status_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'new quotes must start as draft';
  end if;

  if tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and current_setting('app.supply_quote_status_change', true) is distinct from 'allowed' then
    raise exception 'use set_supply_quote_status to change quote status';
  end if;

  return new;
end;
$$;

create trigger supply_quotes_enforce_status_lifecycle
before insert or update on public.supply_quotes
for each row execute function private.enforce_supply_quote_status_lifecycle();

revoke all on function private.enforce_supply_quote_status_lifecycle()
from public, anon, authenticated;

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

  if not (
    (v_previous_status = 'draft' and p_status in ('received', 'cancelled'))
    or (v_previous_status = 'received' and p_status in ('cancelled', 'expired'))
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

revoke all on function public.set_supply_quote_status(uuid, public.supply_quote_status)
from public, anon, authenticated;
grant execute on function public.set_supply_quote_status(uuid, public.supply_quote_status)
to authenticated, service_role;

revoke select on table public.suppliers from authenticated;
grant select (
  id,
  codigo_negocio,
  trade_name,
  legal_name,
  person_type,
  contact_name,
  phone,
  email,
  website,
  city,
  state,
  address,
  notes,
  active
) on table public.suppliers to authenticated;

create or replace function public.list_suppliers_for_management()
returns table (
  id uuid,
  codigo_negocio text,
  trade_name text,
  legal_name text,
  person_type public.supplier_person_type,
  document text,
  contact_name text,
  phone text,
  email text,
  website text,
  city text,
  state text,
  address text,
  notes text,
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can('suppliers', 'manage') then
    raise exception 'permission denied';
  end if;

  return query
  select
    supplier.id,
    supplier.codigo_negocio,
    supplier.trade_name,
    supplier.legal_name,
    supplier.person_type,
    supplier.document,
    supplier.contact_name,
    supplier.phone,
    supplier.email,
    supplier.website,
    supplier.city,
    supplier.state,
    supplier.address,
    supplier.notes,
    supplier.active
  from public.suppliers supplier
  order by supplier.trade_name;
end;
$$;

revoke all on function public.list_suppliers_for_management()
from public, anon, authenticated;
grant execute on function public.list_suppliers_for_management()
to authenticated, service_role;
