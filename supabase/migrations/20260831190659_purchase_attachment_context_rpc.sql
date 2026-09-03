create or replace function public.register_supply_purchase_attachment_v2(
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
  p_document_amount text
)
returns public.supply_purchase_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_purchase_attachments;
  v_actor uuid := app.current_usuario_id();
  v_amount numeric(14,2);
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

  if nullif(trim(coalesce(p_document_amount, '')), '') is not null then
    v_amount := private.normalize_decimal_input(p_document_amount)::numeric;
    if v_amount < 0 then raise exception 'document amount cannot be negative'; end if;
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
    v_amount,
    v_actor
  ) returning * into v_attachment;

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
      'document_amount', v_attachment.document_amount
    ),
    'database'
  );

  return v_attachment;
end;
$$;

revoke execute on function public.register_supply_purchase_attachment_v2(uuid, uuid, text, text, text, bigint, text, text, text, date, text) from public, anon;
grant execute on function public.register_supply_purchase_attachment_v2(uuid, uuid, text, text, text, bigint, text, text, text, date, text) to authenticated;