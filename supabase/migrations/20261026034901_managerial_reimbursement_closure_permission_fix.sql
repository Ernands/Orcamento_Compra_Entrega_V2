-- One verified transaction: finalize the managerial reimbursement ledger and
-- activate the exact store-level financial closure already used in Lojas.
-- A failure in EITHER operation rolls back BOTH. PROD must not be touched.
create or replace function public.finalize_managerial_reimbursement_and_close_store(
  p_store_id uuid,
  p_loss_cents bigint,
  p_entry_date date,
  p_confirm_text text
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_previous_state text;
  v_entry_id uuid;
begin
  if auth.uid() is null
     or not app.can('stores','finalize_reopen')
     or not app.can_store('stores','view',p_store_id)
     or not app.can_store('finance','manage',p_store_id)
     or not app.can('dashboard','view') then
    raise exception using errcode='42501',
      message='Sem permissão para finalizar o reembolso e bloquear financeiramente esta loja.';
  end if;
  if p_confirm_text is distinct from 'FINALIZAR' then
    raise exception 'Confirmação FINALIZAR obrigatória.';
  end if;
  if p_loss_cents is null or p_loss_cents < 0 or p_entry_date is null then
    raise exception 'Valor ou data inválida para finalização.';
  end if;

  -- Confirm store visibility without requiring the separate stores.edit role.
  -- Existing change_store_financial_closure takes the authoritative FOR UPDATE
  -- lock, serialized against all purchase/work financial mutation guards.
  perform 1 from public.lojas where id=p_store_id;
  if not found then raise exception 'Loja não encontrada.'; end if;
  select state into v_previous_state
    from public.store_financial_closures where store_id=p_store_id;

  -- Trigger validates existing ledger and remaining BB allowance.
  insert into public.finance_managerial_reimbursement_entries
    (store_id,entry_type,amount_cents,entry_date,protocol,notes)
  values (p_store_id,'finalized',p_loss_cents,p_entry_date,null,
    'Finalização do reembolso vinculada ao fechamento financeiro da loja; perda restrita à Verba BB.')
  returning id into v_entry_id;

  if coalesce(v_previous_state,'open') <> 'closed' then
    -- Reuse the Lojas RPC for the real locks and append-only closure audit.
    perform public.change_store_financial_closure(
      p_store_id,'close','FINALIZAR','Finalização pelo painel Reembolso');
  end if;
  return jsonb_build_object(
    'reimbursement_id',v_entry_id,
    'store_id',p_store_id,
    'store_state','closed',
    'store_closed_now',coalesce(v_previous_state,'open') <> 'closed'
  );
end;
$$;
revoke all on function public.finalize_managerial_reimbursement_and_close_store(uuid,bigint,date,text)
  from public,anon,authenticated;
grant execute on function public.finalize_managerial_reimbursement_and_close_store(uuid,bigint,date,text)
  to authenticated;
comment on function public.finalize_managerial_reimbursement_and_close_store(uuid,bigint,date,text)
is 'Atomic reimbursement finalization and existing store financial closure; requires both finance manage and stores finalize_reopen permission.';
