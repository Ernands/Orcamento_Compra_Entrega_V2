create table if not exists public.supply_purchase_attachment_stores (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.supply_purchase_attachments(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null check (store_state_snapshot ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  unique (attachment_id, store_id)
);

create index if not exists supply_purchase_attachment_stores_store_idx
  on public.supply_purchase_attachment_stores (store_id);

alter table public.supply_purchase_attachment_stores enable row level security;

drop policy if exists supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores;
create policy supply_purchase_attachment_stores_read
on public.supply_purchase_attachment_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.id = attachment_id
      and app.can_read_supply_purchase(attachment.purchase_id)
  )
  and app.can_store('purchases', 'view', store_id)
);

revoke all on public.supply_purchase_attachment_stores from public, anon, authenticated;
grant select on public.supply_purchase_attachment_stores to authenticated;

create or replace function public.register_supply_purchase_attachment_v3(
  p_purchase_id uuid,
  p_purchase_order_id uuid,
  p_original_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text,
  p_document_type text,
  p_document_number text,
  p_document_date date,
  p_document_amount text,
  p_store_ids uuid[]
)
returns public.supply_purchase_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_purchase_attachments;
  v_actor uuid := app.current_usuario_id();
  v_document_amount numeric(14,2);
  v_expected_store_count integer := 0;
  v_distinct_store_count integer := 0;
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;
  if p_storage_path not like 'compras/' || p_purchase_id::text || '/%' then
    raise exception 'invalid storage path';
  end if;
  if p_purchase_order_id is not null and not exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = p_purchase_order_id
      and purchase_order.purchase_id = p_purchase_id
  ) then
    raise exception 'purchase order is outside purchase';
  end if;

  if nullif(trim(p_document_amount), '') is not null then
    v_document_amount := private.normalize_decimal_input(p_document_amount)::numeric;
    if v_document_amount < 0 then
      raise exception 'document amount cannot be negative';
    end if;
  end if;

  v_expected_store_count := coalesce(cardinality(p_store_ids), 0);
  if v_expected_store_count > 0 then
    select count(distinct store_id)
    into v_distinct_store_count
    from unnest(p_store_ids) as store_id;

    if v_distinct_store_count <> v_expected_store_count then
      raise exception 'document store scope has duplicate stores';
    end if;

    if exists (
      select 1
      from unnest(p_store_ids) as selected_store_id
      where not exists (
        select 1
        from public.supply_purchase_stores purchase_store
        where purchase_store.purchase_id = p_purchase_id
          and purchase_store.store_id = selected_store_id
      )
    ) then
      raise exception 'document store is outside purchase';
    end if;
  end if;

  insert into public.supply_purchase_attachments (
    purchase_id,
    purchase_order_id,
    original_name,
    storage_path,
    mime_type,
    size_bytes,
    description,
    document_type,
    document_number,
    document_date,
    document_amount,
    created_by
  ) values (
    p_purchase_id,
    p_purchase_order_id,
    trim(p_original_name),
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    nullif(trim(p_description), ''),
    p_document_type,
    nullif(trim(p_document_number), ''),
    p_document_date,
    v_document_amount,
    v_actor
  ) returning * into v_attachment;

  if v_expected_store_count > 0 then
    insert into public.supply_purchase_attachment_stores (
      attachment_id,
      store_id,
      store_code_snapshot,
      store_name_snapshot,
      store_city_snapshot,
      store_state_snapshot
    )
    select
      v_attachment.id,
      purchase_store.store_id,
      purchase_store.store_code_snapshot,
      purchase_store.store_name_snapshot,
      purchase_store.store_city_snapshot,
      purchase_store.store_state_snapshot
    from public.supply_purchase_stores purchase_store
    where purchase_store.purchase_id = p_purchase_id
      and purchase_store.store_id = any(p_store_ids);
  end if;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.attachment.created',
    'supply_purchase_attachment',
    v_attachment.id,
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'purchase_order_id', p_purchase_order_id,
      'original_name', v_attachment.original_name,
      'document_type', v_attachment.document_type,
      'document_number', v_attachment.document_number,
      'document_date', v_attachment.document_date,
      'document_amount', v_attachment.document_amount,
      'store_count', v_expected_store_count
    ),
    'database'
  );

  return v_attachment;
end;
$$;

revoke execute on function public.register_supply_purchase_attachment_v3(uuid, uuid, text, text, text, bigint, text, text, text, date, text, uuid[]) from public, anon;
grant execute on function public.register_supply_purchase_attachment_v3(uuid, uuid, text, text, text, bigint, text, text, text, date, text, uuid[]) to authenticated;