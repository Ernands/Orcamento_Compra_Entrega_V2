-- Link a payment proof to its exact purchase installment. Existing rows are untouched.
begin;

alter table public.supply_purchase_attachments
  add column if not exists payment_id uuid references public.supply_purchase_payments(id) on delete set null;

create index if not exists supply_purchase_attachments_payment_idx
  on public.supply_purchase_attachments(payment_id)
  where payment_id is not null and deleted_at is null;

create or replace function public.link_supply_purchase_payment_proof_v1(
  p_attachment_id uuid,
  p_payment_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.supply_purchase_payments%rowtype;
  v_attachment public.supply_purchase_attachments%rowtype;
begin
  select * into v_payment
    from public.supply_purchase_payments
    where id = p_payment_id
    for update;
  if not found or v_payment.status <> 'paid' then
    raise exception 'payment not found or not paid';
  end if;
  if not app.can_edit_supply_purchase(v_payment.purchase_id) then
    raise exception 'permission denied';
  end if;

  select * into v_attachment
    from public.supply_purchase_attachments
    where id = p_attachment_id
    for update;
  if not found
     or v_attachment.deleted_at is not null
     or v_attachment.document_type <> 'payment_proof'
     or v_attachment.purchase_id <> v_payment.purchase_id
     or v_attachment.purchase_order_id is distinct from v_payment.purchase_order_id
     or (v_attachment.payment_id is not null and v_attachment.payment_id <> p_payment_id) then
    raise exception 'proof document is not eligible for this payment';
  end if;

  update public.supply_purchase_attachments
     set payment_id = p_payment_id
   where id = p_attachment_id
     and payment_id is distinct from p_payment_id;

  insert into public.audit_logs
    (actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin)
  values (
    app.current_usuario_id(), 'purchase.payment.proof.linked',
    'supply_purchase_attachment', p_attachment_id,
    to_jsonb(v_attachment),
    (select to_jsonb(a) from public.supply_purchase_attachments a where a.id=p_attachment_id),
    'database'
  );
end;
$$;

revoke all on function public.link_supply_purchase_payment_proof_v1(uuid,uuid) from public, anon;
grant execute on function public.link_supply_purchase_payment_proof_v1(uuid,uuid) to authenticated;

commit;
