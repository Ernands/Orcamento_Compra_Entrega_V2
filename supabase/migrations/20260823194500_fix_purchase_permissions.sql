-- Corrige a capability usada pelas operacoes de aprovacao/devolucao de compras.
-- A permissao cadastrada e purchases.approve; app.can monta a chave como modulo.acao.

create or replace function public.approve_supply_quote_for_purchase(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.supply_quotes;
  v_purchase_id uuid;
  v_purchase_status text;
  v_actor uuid := app.current_usuario_id();
  v_total numeric(16, 2);
  v_pending boolean;
begin
  if not app.can('purchases', 'approve') then raise exception 'permission denied'; end if;
  if not app.can_read_supply_quote(p_quote_id) then raise exception 'permission denied'; end if;

  select * into v_quote from public.supply_quotes where id = p_quote_id for update;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  if v_quote.status <> 'received' then raise exception 'quote must be received before purchase approval'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until < current_date then raise exception 'quote expired'; end if;

  if exists (
    select 1 from public.supply_quote_stores qs
    where qs.quote_id = p_quote_id and not app.can_store('purchases', 'view', qs.store_id)
  ) then raise exception 'permission denied'; end if;

  select id, status into v_purchase_id, v_purchase_status
  from public.supply_purchases where quote_id = p_quote_id for update;

  if v_purchase_id is not null and v_purchase_status not in ('returned', 'cancelled') then
    raise exception 'quote already approved for purchase';
  end if;

  if v_purchase_id is not null and exists (
    select 1 from public.supply_purchase_payments
    where purchase_id = v_purchase_id and status <> 'cancelled'
  ) then raise exception 'previous purchase has active payments'; end if;

  if v_purchase_id is not null and exists (
    select 1 from public.supply_purchase_attachments
    where purchase_id = v_purchase_id and deleted_at is null
  ) then raise exception 'previous purchase has active documents'; end if;

  select coalesce(sum(greatest(
      round(item.quantity * item.unit_price, 2) - item.discount_amount
      + coalesce(item.shipping_amount, 0) + item.other_costs, 0
    )), 0),
    coalesce(bool_or(item.shipping_type = 'pending'), false)
  into v_total, v_pending
  from public.supply_quote_items item where item.quote_id = p_quote_id;

  if v_purchase_id is null then
    insert into public.supply_purchases (
      quote_id, quote_code_snapshot, supplier_id, supplier_name_snapshot, quote_date_snapshot,
      approved_total, has_pending_shipping, payment_method_snapshot, entry_amount_snapshot,
      installment_count_snapshot, payment_notes_snapshot, status, approved_by, approved_at
    ) values (
      v_quote.id, v_quote.codigo_negocio, v_quote.supplier_id, v_quote.supplier_name_snapshot,
      v_quote.quote_date, v_total, v_pending, v_quote.payment_method, v_quote.entry_amount,
      v_quote.installment_count, v_quote.payment_notes, 'approved', v_actor, now()
    ) returning id into v_purchase_id;
  else
    delete from public.supply_purchase_items where purchase_id = v_purchase_id;
    delete from public.supply_purchase_stores where purchase_id = v_purchase_id;
    update public.supply_purchases
    set quote_code_snapshot = v_quote.codigo_negocio,
        supplier_id = v_quote.supplier_id,
        supplier_name_snapshot = v_quote.supplier_name_snapshot,
        quote_date_snapshot = v_quote.quote_date,
        approved_total = v_total,
        has_pending_shipping = v_pending,
        payment_method_snapshot = v_quote.payment_method,
        entry_amount_snapshot = v_quote.entry_amount,
        installment_count_snapshot = v_quote.installment_count,
        payment_notes_snapshot = v_quote.payment_notes,
        status = 'approved', approved_by = v_actor, approved_at = now(),
        returned_by = null, returned_at = null
    where id = v_purchase_id;
  end if;

  insert into public.supply_purchase_stores (
    purchase_id, store_id, store_code_snapshot, store_name_snapshot, store_city_snapshot, store_state_snapshot
  )
  select v_purchase_id, store.id, store.codigo_negocio, store.nome, store.cidade, store.uf
  from public.supply_quote_stores qs join public.lojas store on store.id = qs.store_id
  where qs.quote_id = p_quote_id;

  insert into public.supply_purchase_items (
    purchase_id, source_quote_item_id, supply_item_id, item_code_snapshot, item_name_snapshot,
    store_id, store_code_snapshot, quantity_approved, unit, quoted_unit_price,
    quoted_discount_amount, quoted_shipping_type, quoted_shipping_amount, quoted_other_costs,
    approved_line_total, actual_unit_price
  )
  select v_purchase_id, qi.id, qi.supply_item_id, si.codigo_negocio, si.name,
    qi.store_id, store.codigo_negocio, qi.quantity, qi.unit, qi.unit_price,
    qi.discount_amount, qi.shipping_type, qi.shipping_amount, qi.other_costs,
    greatest(round(qi.quantity * qi.unit_price, 2) - qi.discount_amount
      + coalesce(qi.shipping_amount, 0) + qi.other_costs, 0),
    qi.unit_price
  from public.supply_quote_items qi
  join public.supply_items si on si.id = qi.supply_item_id
  left join public.lojas store on store.id = qi.store_id
  where qi.quote_id = p_quote_id;

  insert into public.audit_logs (actor_usuario_id, action, entity_type, entity_id, after_json, origin)
  values (v_actor, 'purchase.approved', 'supply_purchase', v_purchase_id,
    jsonb_build_object('quote_id', p_quote_id, 'quote_code', v_quote.codigo_negocio,
      'approved_total', v_total, 'has_pending_shipping', v_pending), 'database');

  return v_purchase_id;
end;
$$;

create or replace function public.return_supply_purchase_to_quote(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.supply_purchases;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can('purchases', 'approve') then raise exception 'permission denied'; end if;
  select * into v_purchase from public.supply_purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not app.can_read_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_purchase.status in ('returned', 'cancelled') then raise exception 'purchase is already closed'; end if;
  if exists (
    select 1 from public.supply_purchase_items
    where purchase_id = p_purchase_id and purchased_quantity > 0
  ) then raise exception 'purchase has executed items'; end if;
  if exists (
    select 1 from public.supply_purchase_payments
    where purchase_id = p_purchase_id and status <> 'cancelled'
  ) then raise exception 'purchase has active payments'; end if;
  if exists (
    select 1 from public.supply_purchase_attachments
    where purchase_id = p_purchase_id and deleted_at is null
  ) then raise exception 'purchase has active documents'; end if;

  update public.supply_purchases
  set status = 'returned', returned_by = v_actor, returned_at = now()
  where id = p_purchase_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.returned_to_quote',
    'supply_purchase',
    p_purchase_id,
    to_jsonb(v_purchase),
    (select to_jsonb(purchase) from public.supply_purchases purchase where purchase.id = p_purchase_id),
    'database'
  );
end;
$$;
