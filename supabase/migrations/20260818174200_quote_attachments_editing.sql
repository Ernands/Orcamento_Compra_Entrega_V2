create or replace function app.can_edit_supply_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('quotes', 'edit')
    and exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
    )
    and not exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
        and not app.can_store('quotes', 'edit', quote_store.store_id)
    );
$$;

revoke all on function app.can_edit_supply_quote(uuid) from public, anon, authenticated;
grant execute on function app.can_edit_supply_quote(uuid) to authenticated, service_role;

create table public.supply_quote_attachments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supply_quotes(id) on delete restrict,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  storage_path text not null unique check (
    storage_path ~ '^cotacoes/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  ),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-m4v',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  description text check (description is null or length(description) <= 1000),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references public.usuarios(id) on delete set null,
  deleted_at timestamptz
);

create index supply_quote_attachments_quote_created_idx
on public.supply_quote_attachments(quote_id, created_at desc)
where deleted_at is null;

alter table public.supply_quote_attachments enable row level security;

create policy supply_quote_attachments_read_scoped
on public.supply_quote_attachments for select to authenticated
using (deleted_at is null and app.can_read_supply_quote(quote_id));

revoke all on table public.supply_quote_attachments from anon, authenticated;
grant select on table public.supply_quote_attachments to authenticated;
grant all on table public.supply_quote_attachments to service_role;

create or replace function public.register_supply_quote_attachment(
  p_quote_id uuid,
  p_original_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text
)
returns public.supply_quote_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_quote_attachments;
  v_actor uuid := app.current_usuario_id();
  v_quote_code text;
  v_quote_status public.supply_quote_status;
begin
  if not app.can_edit_supply_quote(p_quote_id) then
    raise exception 'permission denied';
  end if;

  if p_storage_path not like 'cotacoes/' || p_quote_id::text || '/%' then
    raise exception 'invalid storage path';
  end if;

  select quote.codigo_negocio, quote.status
  into v_quote_code, v_quote_status
  from public.supply_quotes quote
  where quote.id = p_quote_id;

  insert into public.supply_quote_attachments (
    quote_id, original_name, storage_path, mime_type, size_bytes, description, created_by
  ) values (
    p_quote_id,
    trim(p_original_name),
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    nullif(trim(p_description), ''),
    v_actor
  ) returning * into v_attachment;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'quote.attachment.created',
    'quote_attachment',
    v_attachment.id,
    jsonb_build_object(
      'quote_id', p_quote_id,
      'quote_code', v_quote_code,
      'quote_status', v_quote_status,
      'original_name', v_attachment.original_name,
      'mime_type', v_attachment.mime_type,
      'size_bytes', v_attachment.size_bytes
    ),
    'database'
  );

  return v_attachment;
end;
$$;

create or replace function public.delete_supply_quote_attachment(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_quote_attachments;
  v_actor uuid := app.current_usuario_id();
  v_quote_code text;
  v_quote_status public.supply_quote_status;
begin
  select * into v_attachment
  from public.supply_quote_attachments
  where id = p_attachment_id and deleted_at is null
  for update;

  if v_attachment.id is null or not app.can_edit_supply_quote(v_attachment.quote_id) then
    raise exception 'permission denied';
  end if;

  select quote.codigo_negocio, quote.status
  into v_quote_code, v_quote_status
  from public.supply_quotes quote
  where quote.id = v_attachment.quote_id;

  update public.supply_quote_attachments
  set deleted_at = now(), deleted_by = v_actor
  where id = p_attachment_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'quote.attachment.deleted',
    'quote_attachment',
    p_attachment_id,
    jsonb_build_object(
      'quote_id', v_attachment.quote_id,
      'quote_code', v_quote_code,
      'quote_status', v_quote_status,
      'original_name', v_attachment.original_name
    ),
    jsonb_build_object('deleted_at', now()),
    'database'
  );

  return v_attachment.storage_path;
end;
$$;

revoke all on function public.register_supply_quote_attachment(uuid, text, text, text, bigint, text)
from public, anon, authenticated;
revoke all on function public.delete_supply_quote_attachment(uuid)
from public, anon, authenticated;
grant execute on function public.register_supply_quote_attachment(uuid, text, text, text, bigint, text)
to authenticated, service_role;
grant execute on function public.delete_supply_quote_attachment(uuid)
to authenticated, service_role;

create or replace function app.storage_quote_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_object_name ~ '^cotacoes/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      then split_part(p_object_name, '/', 2)::uuid
    else null
  end;
$$;

create or replace function app.can_read_supply_quote_attachment_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.supply_quote_attachments attachment
    where attachment.storage_path = p_object_name
      and attachment.deleted_at is null
      and attachment.quote_id = app.storage_quote_id(p_object_name)
      and app.can_read_supply_quote(attachment.quote_id)
  );
$$;

revoke all on function app.storage_quote_id(text) from public, anon;
revoke all on function app.can_read_supply_quote_attachment_object(text)
from public, anon, authenticated;
grant execute on function app.storage_quote_id(text) to authenticated, service_role;
grant execute on function app.can_read_supply_quote_attachment_object(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage schema unavailable; quote attachment bucket and policies skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'quote-attachments',
    'quote-attachments',
    false,
    104857600,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-m4v',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists quote_attachments_objects_read on storage.objects';
  execute 'drop policy if exists quote_attachments_objects_create on storage.objects';
  execute 'drop policy if exists quote_attachments_objects_delete on storage.objects';

  execute $policy$
    create policy quote_attachments_objects_read
    on storage.objects for select to authenticated
    using (
      bucket_id = 'quote-attachments'
      and app.can_read_supply_quote_attachment_object(name)
    )
  $policy$;

  execute $policy$
    create policy quote_attachments_objects_create
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'quote-attachments'
      and app.can_edit_supply_quote(app.storage_quote_id(name))
    )
  $policy$;

  execute $policy$
    create policy quote_attachments_objects_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'quote-attachments'
      and app.can_edit_supply_quote(app.storage_quote_id(name))
    )
  $policy$;
end;
$$;

create or replace function private.supply_quote_audit_snapshot(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(quote) || jsonb_build_object(
    'stores', coalesce((
      select jsonb_agg(
        jsonb_build_object('store_id', quote_store.store_id)
        order by quote_store.store_id
      )
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = quote.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at, item.id)
      from public.supply_quote_items item
      where item.quote_id = quote.id
    ), '[]'::jsonb)
  )
  from public.supply_quotes quote
  where quote.id = p_quote_id;
$$;

revoke all on function private.supply_quote_audit_snapshot(uuid)
from public, anon, authenticated;

create or replace function public.save_supply_quote(
  p_quote_id uuid,
  p_supplier_id uuid,
  p_supplier_channel_id uuid,
  p_quote_date date,
  p_valid_until date,
  p_contact text,
  p_context_type public.supply_quote_context,
  p_status public.supply_quote_status,
  p_notes text,
  p_store_ids uuid[],
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := p_quote_id;
  v_actor uuid := app.current_usuario_id();
  v_is_new boolean := p_quote_id is null;
  v_existing_status public.supply_quote_status;
  v_store_ids uuid[];
  v_store_id uuid;
  v_supplier_name text;
  v_channel_type public.supplier_channel_type;
  v_origin_city text;
  v_origin_state text;
  v_item jsonb;
  v_supply_item_id uuid;
  v_need_id uuid;
  v_need_store_id uuid;
  v_need_item_id uuid;
  v_quantity numeric(14, 3);
  v_unit text;
  v_default_unit text;
  v_unit_price numeric(14, 2);
  v_discount numeric(14, 2);
  v_shipping_type public.supply_shipping_type;
  v_shipping_amount numeric(14, 2);
  v_other_costs numeric(14, 2);
  v_delivery_days integer;
  v_minimum_quantity numeric(14, 3);
  v_item_count integer := 0;
  v_before jsonb;
  v_after jsonb;
begin
  if p_quote_date is null then
    raise exception 'quote date is required';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'quote validity cannot precede quote date';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'quote requires at least one item';
  end if;

  select array_agg(distinct store_id) into v_store_ids
  from unnest(coalesce(p_store_ids, array[]::uuid[])) store_id;

  if coalesce(cardinality(v_store_ids), 0) = 0 then
    raise exception 'quote requires at least one store';
  end if;

  if p_context_type = 'store' and cardinality(v_store_ids) <> 1 then
    raise exception 'store quote requires exactly one store';
  end if;

  if p_context_type = 'consolidated' and cardinality(v_store_ids) < 2 then
    raise exception 'consolidated quote requires at least two stores';
  end if;

  if not v_is_new then
    select quote.status into v_existing_status
    from public.supply_quotes quote
    where quote.id = v_quote_id
    for update of quote;

    if v_existing_status is null then
      raise exception 'quote not found';
    end if;

    if p_status is distinct from v_existing_status then
      raise exception 'use set_supply_quote_status to change quote status';
    end if;

    if not app.can_edit_supply_quote(v_quote_id) then
      raise exception 'permission denied';
    end if;

    v_before := private.supply_quote_audit_snapshot(v_quote_id);
  end if;

  foreach v_store_id in array v_store_ids loop
    if not exists (select 1 from public.lojas where id = v_store_id)
      or not app.can_store('quotes', case when v_is_new then 'create' else 'edit' end, v_store_id) then
      raise exception 'permission denied';
    end if;
  end loop;

  select
    supplier.trade_name,
    channel.channel_type,
    coalesce(channel.city, supplier.city),
    coalesce(channel.state, supplier.state)
  into v_supplier_name, v_channel_type, v_origin_city, v_origin_state
  from public.suppliers supplier
  join public.supplier_channels channel
    on channel.id = p_supplier_channel_id and channel.supplier_id = supplier.id
  where supplier.id = p_supplier_id
    and supplier.active
    and channel.active;

  if v_supplier_name is null then
    raise exception 'active supplier channel not found';
  end if;

  if v_is_new then
    insert into public.supply_quotes (
      supplier_id, supplier_channel_id, supplier_name_snapshot, channel_snapshot,
      origin_city_snapshot, origin_state_snapshot, quote_date, valid_until,
      contact_snapshot, context_type, status, notes, created_by, updated_by
    ) values (
      p_supplier_id, p_supplier_channel_id, v_supplier_name, v_channel_type,
      v_origin_city, v_origin_state, p_quote_date, p_valid_until,
      nullif(trim(p_contact), ''), p_context_type, p_status,
      nullif(trim(p_notes), ''), v_actor, v_actor
    ) returning id into v_quote_id;
  else
    delete from public.supply_quote_items where quote_id = v_quote_id;
    delete from public.supply_quote_stores where quote_id = v_quote_id;

    update public.supply_quotes
    set
      supplier_id = p_supplier_id,
      supplier_channel_id = p_supplier_channel_id,
      supplier_name_snapshot = v_supplier_name,
      channel_snapshot = v_channel_type,
      origin_city_snapshot = v_origin_city,
      origin_state_snapshot = v_origin_state,
      quote_date = p_quote_date,
      valid_until = p_valid_until,
      contact_snapshot = nullif(trim(p_contact), ''),
      context_type = p_context_type,
      notes = nullif(trim(p_notes), ''),
      updated_by = v_actor
    where id = v_quote_id;
  end if;

  insert into public.supply_quote_stores (quote_id, store_id)
  select v_quote_id, store_id from unnest(v_store_ids) store_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_supply_item_id := nullif(v_item ->> 'supply_item_id', '')::uuid;
    v_need_id := nullif(v_item ->> 'store_need_id', '')::uuid;
    v_store_id := nullif(v_item ->> 'store_id', '')::uuid;
    v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, -1);
    v_discount := coalesce(nullif(v_item ->> 'discount_amount', '')::numeric, 0);
    v_shipping_type := coalesce(nullif(v_item ->> 'shipping_type', ''), 'pending')::public.supply_shipping_type;
    v_shipping_amount := nullif(v_item ->> 'shipping_amount', '')::numeric;
    v_other_costs := coalesce(nullif(v_item ->> 'other_costs', '')::numeric, 0);
    v_delivery_days := nullif(v_item ->> 'delivery_days', '')::integer;
    v_minimum_quantity := nullif(v_item ->> 'minimum_quantity', '')::numeric;

    select item.default_unit into v_default_unit
    from public.supply_items item
    where item.id = v_supply_item_id and item.active;

    if v_default_unit is null then
      raise exception 'active supply item not found';
    end if;

    v_unit := coalesce(nullif(trim(v_item ->> 'unit'), ''), v_default_unit);

    if v_quantity <= 0 or v_unit_price < 0 or v_discount < 0 or v_other_costs < 0
      or v_discount > round(v_quantity * v_unit_price, 2)
      or (v_delivery_days is not null and v_delivery_days < 0)
      or (v_minimum_quantity is not null and v_minimum_quantity <= 0) then
      raise exception 'invalid quote item values';
    end if;

    if v_shipping_type = 'free' then
      v_shipping_amount := 0;
    elsif v_shipping_type = 'informed' and (v_shipping_amount is null or v_shipping_amount < 0) then
      raise exception 'informed shipping requires a non-negative amount';
    elsif v_shipping_type = 'pending' then
      v_shipping_amount := null;
    end if;

    if v_store_id is null and p_context_type <> 'consolidated' then
      raise exception 'store quote items require a store';
    end if;

    if v_store_id is not null and not (v_store_id = any(v_store_ids)) then
      raise exception 'quote item store is outside quote scope';
    end if;

    if v_need_id is not null then
      select need.store_id, need.supply_item_id
      into v_need_store_id, v_need_item_id
      from public.store_needs need
      where need.id = v_need_id;

      if v_need_store_id is null
        or v_need_store_id is distinct from v_store_id
        or (v_need_item_id is not null and v_need_item_id is distinct from v_supply_item_id) then
        raise exception 'quote item does not match the linked need';
      end if;

      if v_need_item_id is null then
        if not app.can_store('needs', 'edit', v_need_store_id) then
          raise exception 'permission denied';
        end if;

        update public.store_needs
        set supply_item_id = v_supply_item_id, updated_by = v_actor
        where id = v_need_id;
      end if;
    end if;

    insert into public.supply_quote_items (
      quote_id, supply_item_id, store_need_id, store_id, quantity, unit,
      unit_price, discount_amount, shipping_type, shipping_amount, other_costs,
      delivery_days, minimum_quantity, offered_brand_model, notes, product_url, captured_at
    ) values (
      v_quote_id, v_supply_item_id, v_need_id, v_store_id, v_quantity, v_unit,
      v_unit_price, v_discount, v_shipping_type, v_shipping_amount, v_other_costs,
      v_delivery_days, v_minimum_quantity,
      nullif(trim(v_item ->> 'offered_brand_model'), ''),
      nullif(trim(v_item ->> 'notes'), ''),
      nullif(trim(v_item ->> 'product_url'), ''),
      nullif(v_item ->> 'captured_at', '')::timestamptz
    );

    v_item_count := v_item_count + 1;
  end loop;

  v_after := private.supply_quote_audit_snapshot(v_quote_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    case when v_is_new then 'quote.created' else 'quote.updated' end,
    'quote',
    v_quote_id,
    v_before,
    v_after,
    'database'
  );

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    case when v_is_new then 'quote.item_added' else 'quote.item_updated' end,
    'quote',
    v_quote_id,
    jsonb_build_object('item_count', v_item_count, 'status', coalesce(v_existing_status, 'draft')),
    'database'
  );

  return v_quote_id;
end;
$$;

revoke all on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.save_supply_quote(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb
) to authenticated, service_role;

create or replace function public.delete_supply_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_usuario_id();
  v_status public.supply_quote_status;
  v_before jsonb;
begin
  select quote.status into v_status
  from public.supply_quotes quote
  where quote.id = p_quote_id
  for update of quote;

  if v_status is null or not app.can_edit_supply_quote(p_quote_id) then
    raise exception 'permission denied';
  end if;

  if v_status <> 'draft' then
    raise exception 'only draft quotes can be deleted';
  end if;

  if exists (
    select 1
    from public.supply_quote_attachments attachment
    where attachment.quote_id = p_quote_id
      and attachment.deleted_at is null
  ) then
    raise exception 'remove quote attachments before deleting quote';
  end if;

  v_before := private.supply_quote_audit_snapshot(p_quote_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, origin
  ) values (
    v_actor, 'quote.deleted', 'quote', p_quote_id, v_before, 'database'
  );

  delete from public.supply_quote_attachments where quote_id = p_quote_id;
  delete from public.supply_quotes where id = p_quote_id;
end;
$$;

revoke all on function public.delete_supply_quote(uuid)
from public, anon, authenticated;
grant execute on function public.delete_supply_quote(uuid)
to authenticated, service_role;
