-- Scoped, transactional revision of an already reconciled partial refund.
-- Only CMP-00099 is eligible. Existing payment, order lines and documents remain immutable.
-- Replacement adjustment is inserted in the same transaction; failures roll back the DELETE.
create or replace function public.revise_cmp00099_partial_adjustment_v1(
  p_adjustment_id uuid,
  p_expected_created_at timestamptz,
  p_expected_original_cents bigint,
  p_expected_refund_cents bigint,
  p_refund_attachment_id uuid,
  p_reference text,
  p_reason text,
  p_adjustments jsonb,
  p_refund_entries jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := app.current_usuario_id();
  v_prior public.supply_purchase_partial_adjustments%rowtype;
  v_next public.supply_purchase_partial_adjustments%rowtype;
  v_purchase_code text;
  v_store_id uuid;
  v_store_count integer;
  v_next_id uuid;
begin
  if v_actor is null then
    raise exception 'Usuário autenticado necessário';
  end if;

  -- Serialise revisions and prevent overlapping, inconsistent snapshots.
  select * into v_prior
  from public.supply_purchase_partial_adjustments
  where id = p_adjustment_id for update;

  if v_prior.id is null then
    raise exception 'Ajuste não encontrado ou já revisado. Atualize a página.';
  end if;

  select codigo_negocio into v_purchase_code
  from public.supply_purchases where id = v_prior.purchase_id for update;

  if v_purchase_code is distinct from 'CMP-00099' then
    raise exception 'Revisão excepcional disponível somente para CMP-00099';
  end if;

  if not app.can_edit_supply_purchase(v_prior.purchase_id) then
    raise exception 'Permissão negada para revisão de compra';
  end if;

  if v_prior.created_at is distinct from p_expected_created_at
     or v_prior.original_cents is distinct from p_expected_original_cents
     or v_prior.refund_cents is distinct from p_expected_refund_cents then
    raise exception 'Ajuste modificado desde a abertura. Atualize a página antes de salvar.';
  end if;

  select count(*), min(store_id::text)::uuid into v_store_count, v_store_id
  from public.supply_purchase_stores where purchase_id = v_prior.purchase_id;

  if v_store_count <> 1 or exists (
    select 1 from public.store_financial_closures
    where store_id = v_store_id and state = 'closed'
  ) then
    raise exception 'Compra com múltiplas lojas ou loja financeiramente finalizada';
  end if;

  if (select count(*) from public.supply_purchase_partial_adjustments
      where order_id = v_prior.order_id or payment_id = v_prior.payment_id) <> 1 then
    raise exception 'Conciliação vinculada a outros ajustes';
  end if;

  -- The v2 RPC rechecks ownership, paid amount, source line values, reimbursements,
  -- attachment, store permissions and the signed freight allocation. None are weakened.
  -- Both statements run in the SAME PostgreSQL transaction: no partial removal is possible.
  delete from public.supply_purchase_partial_adjustments where id = v_prior.id;

  v_next_id := public.register_supply_purchase_partial_adjustment_v2(
    v_prior.order_id,
    v_prior.payment_id,
    p_refund_attachment_id,
    p_reference,
    p_reason,
    p_expected_original_cents,
    p_adjustments,
    p_refund_entries
  );

  select * into strict v_next
  from public.supply_purchase_partial_adjustments where id = v_next_id;

  if v_next.purchase_id is distinct from v_prior.purchase_id
     or v_next.order_id is distinct from v_prior.order_id
     or v_next.payment_id is distinct from v_prior.payment_id
     or v_next.original_cents is distinct from v_prior.original_cents then
    raise exception 'Conciliação revisada inconsistente; transação revertida';
  end if;

  insert into public.audit_logs(
    actor_usuario_id, action, entity_type, entity_id,
    before_json, after_json, origin
  ) values (
    v_actor, 'purchase.partial_refund.revised',
    'supply_purchase_partial_adjustment', v_next_id,
    jsonb_build_object('purchase_code',v_purchase_code,'old_adjustment_id',v_prior.id,
      'snapshot',to_jsonb(v_prior)),
    jsonb_build_object('purchase_code',v_purchase_code,'new_adjustment_id',v_next_id,
      'supersedes',v_prior.id,'snapshot',to_jsonb(v_next)),
    'database'
  );

  return v_next_id;
end;
$function$;

revoke all on function public.revise_cmp00099_partial_adjustment_v1(
  uuid,timestamptz,bigint,bigint,uuid,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.revise_cmp00099_partial_adjustment_v1(
  uuid,timestamptz,bigint,bigint,uuid,text,text,jsonb,jsonb
) to authenticated;
