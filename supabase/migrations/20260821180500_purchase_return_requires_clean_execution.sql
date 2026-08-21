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
  if not app.can('purchases', 'manage') then raise exception 'permission denied'; end if;
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