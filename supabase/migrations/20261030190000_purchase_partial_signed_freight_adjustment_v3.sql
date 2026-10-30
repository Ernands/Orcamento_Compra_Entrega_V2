-- Acerto de frete assinado, sem alterar pagamentos, itens ou documentos originais.
-- Compatibilidade: v1 preservada; v2 valida créditos e delega para v3 privada.
BEGIN;
ALTER TABLE public.supply_purchase_partial_adjustments
  DROP CONSTRAINT IF EXISTS supply_purchase_partial_adjustmen_freight_reduction_cents_check;
ALTER TABLE public.supply_purchase_partial_adjustments
  DROP CONSTRAINT IF EXISTS purchase_partial_signed_freight_range_v3;
ALTER TABLE public.supply_purchase_partial_adjustments
  ADD CONSTRAINT purchase_partial_signed_freight_range_v3
    CHECK (freight_reduction_cents >= -cancelled_cents
      AND freight_reduction_cents < original_cents);
CREATE OR REPLACE FUNCTION app.register_supply_purchase_partial_adjustment_freight_v3(p_order_id uuid, p_payment_id uuid, p_refund_attachment_id uuid, p_refunded_on date, p_reference text, p_reason text, p_expected_original_cents bigint, p_refund_cents bigint, p_adjustments jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_order public.supply_purchase_orders%rowtype;
 v_payment public.supply_purchase_payments%rowtype;
 v_actor uuid:=app.current_usuario_id();
 v_purchase_status text;
 v_store_id uuid;
 v_gross bigint;
 v_cancel bigint:=0;
 v_cancelled_freight bigint:=0;
 v_freight bigint:=0;
 v_store_count integer;
 v_total_lines integer;
 v_line public.supply_purchase_order_items%rowtype;
 v_entry jsonb;
 v_id uuid;
 v_kind text;
 v_cents bigint;
 v_seen uuid[]:='{}';
 v_cancel_ids uuid[]:='{}';
 v_remaining_freight bigint:=0;
 v_expected jsonb:='[]'::jsonb;
 v_provided jsonb:='[]'::jsonb;
 v_left bigint;
 v_weight bigint;
 v_base bigint;
 v_row record;
begin
 if v_actor is null or p_refunded_on is null or p_refunded_on>current_date or
   length(btrim(coalesce(p_reference,''))) not between 4 and 180 or
   length(btrim(coalesce(p_reason,''))) not between 10 and 1500 then
   raise exception 'Informe usuário, data, referência e justificativa válidos';
 end if;
 if p_expected_original_cents<=0 or p_refund_cents<=0 or
    jsonb_typeof(p_adjustments) is distinct from 'array' or
    jsonb_array_length(p_adjustments)>150 then
    raise exception 'Valores de reembolso ou formato inválidos';
 end if;
 select * into v_order from public.supply_purchase_orders
  where id=p_order_id for update;
 if v_order.id is null or v_order.status<>'active' then raise exception 'Pedido não está ativo'; end if;
 if not app.can_edit_supply_purchase(v_order.purchase_id) then raise exception 'Permissão negada'; end if;
 select status into v_purchase_status from public.supply_purchases
  where id=v_order.purchase_id for update;
 if v_purchase_status in ('returned','cancelled') then raise exception 'Compra encerrada'; end if;
 if exists(select 1 from public.supply_purchase_partial_adjustments
           where order_id=p_order_id) then
   raise exception 'Ajuste já registrado. Crédito duplicado bloqueado';
 end if;
 select count(*),min(store_id::text)::uuid into v_store_count,v_store_id
  from public.supply_purchase_stores where purchase_id=v_order.purchase_id;
 if v_store_count<>1 then raise exception 'Operação restrita a compra com uma loja'; end if;
 if exists(select 1 from public.store_financial_closures
   where store_id=v_store_id and state='closed') then
   raise exception 'Loja finalizada: ajuste bloqueado';
 end if;
 select * into v_payment from public.supply_purchase_payments
  where id=p_payment_id and purchase_id=v_order.purchase_id and
   purchase_order_id=p_order_id and status='paid' for update;
 if v_payment.id is null then raise exception 'Pagamento quitado não encontrado'; end if;
 if (select count(*) from public.supply_purchase_payments where
     purchase_order_id=p_order_id and status<>'cancelled')<>1 or
   exists(select 1 from public.supply_purchase_payments
     where purchase_id=v_order.purchase_id and purchase_order_id is null
       and status<>'cancelled') then
   raise exception 'Concilie pagamentos múltiplos ou não vinculados antes do ajuste';
 end if;
 if not exists(select 1 from public.supply_purchase_attachments
    where id=p_refund_attachment_id and purchase_id=v_order.purchase_id and
      purchase_order_id=p_order_id and deleted_at is null and
      document_type='reimbursement') then
   raise exception 'Anexe comprovante do reembolso ao pedido antes de aplicar';
 end if;
 if exists(select 1 from public.supply_purchase_order_items
   where order_id=p_order_id and (line_total is null or shipping_amount is null or
     store_distribution_status<>'confirmed')) then
   raise exception 'Todos os itens precisam de valor, frete e loja confirmados';
 end if;
 if exists(select 1 from public.supply_purchase_order_line_stores st
   join public.supply_purchase_order_items li on li.id=st.order_line_id
   where li.order_id=p_order_id and st.store_id<>v_store_id) then
   raise exception 'Pedido com distribuição fora da loja';
 end if;
 select coalesce(sum(round(line_total*100)::bigint),0),count(*)
  into v_gross,v_total_lines from public.supply_purchase_order_items
  where order_id=p_order_id;
 if v_gross<>p_expected_original_cents or
    v_gross<>round(v_payment.amount*100)::bigint then
   raise exception 'Valores alterados: atualize a página antes de aplicar';
 end if;
 if p_refund_cents>=v_gross then raise exception 'Reembolso excede saldo permitido'; end if;
 -- Recebe somente linhas de cancelamento; o rateio é recalculado pelo servidor.
 for v_entry in select value from jsonb_array_elements(p_adjustments) loop
   if v_entry->>'kind'<>'cancelled' or
      (v_entry->>'line_id') is null or
      (v_entry->>'reduction_cents') !~ '^[0-9]{1,14}$' then
     raise exception 'Lista de itens cancelados inválida';
   end if;
   v_id:=(v_entry->>'line_id')::uuid;
   if v_id=any(v_seen) then raise exception 'Item duplicado'; end if;
   v_seen:=array_append(v_seen,v_id);
   select * into v_line from public.supply_purchase_order_items
    where id=v_id and order_id=p_order_id for update;
   if v_line.id is null then raise exception 'Item fora do pedido'; end if;
   v_cents:=(v_entry->>'reduction_cents')::bigint;
   if v_cents<>round(v_line.line_total*100)::bigint then
     raise exception 'Valor cancelado difere do lançamento original';
   end if;
   v_cancel:=v_cancel+v_cents;
   v_cancelled_freight:=v_cancelled_freight+round(v_line.shipping_amount*100)::bigint;
   v_cancel_ids:=array_append(v_cancel_ids,v_id);
 end loop;
 if cardinality(v_cancel_ids)=0 or cardinality(v_cancel_ids)>=v_total_lines then
   raise exception 'É necessário cancelar parte dos itens, mantendo outros';
 end if;
 v_freight:=p_refund_cents-v_cancel;
 if v_freight<0 and -v_freight>v_cancelled_freight then
   raise exception 'Frete não restituído excede o frete original dos itens cancelados (%)', v_cancelled_freight;
 end if;
 select coalesce(sum(round(shipping_amount*100)::bigint),0)
  into v_remaining_freight
  from public.supply_purchase_order_items where order_id=p_order_id
    and not id=any(v_cancel_ids);
 if v_freight>v_remaining_freight then
   raise exception 'O crédito supera o frete disponível para rateio';
 end if;
 -- Monta o snapshot de cancelamentos sem alterar as linhas originais.
 select coalesce(jsonb_agg(jsonb_build_object(
  'line_id',id,'kind','cancelled','reduction_cents',round(line_total*100)::bigint,
  'original_line_cents',round(line_total*100)::bigint,
  'original_shipping_cents',round(shipping_amount*100)::bigint
 ) order by id),'[]'::jsonb) into v_expected
 from public.supply_purchase_order_items
 where order_id=p_order_id and id=any(v_cancel_ids);
 -- Frete não restituído vira um terceiro lançamento assinado, vinculado ao item
 -- cancelado de menor ID. O pagamento original e o cadastro dos itens persistem.
 if v_freight<0 then
   select v_expected || jsonb_build_array(jsonb_build_object(
     'line_id',id,'kind','freight_retained','reduction_cents',v_freight,
     'original_line_cents',round(line_total*100)::bigint,
     'original_shipping_cents',round(shipping_amount*100)::bigint
   )) into v_expected
   from public.supply_purchase_order_items
   where order_id=p_order_id and id=any(v_cancel_ids)
   order by id limit 1;
 end if;
 -- Rateio determinístico em centavos pelo método das maiores sobras:
 -- FLOOR em todas as linhas; distribuir o restante por maior resto e ID.
 if v_freight>0 then
   select v_expected || coalesce(jsonb_agg(
      jsonb_build_object('line_id',id,'kind','freight','reduction_cents',allocation,
        'original_line_cents',line_cents,'original_shipping_cents',ship_cents)
      order by id),'[]'::jsonb) into v_expected
   from (
     with weighted as (
       select id,round(line_total*100)::bigint line_cents,
         round(shipping_amount*100)::bigint ship_cents,
         (round(shipping_amount*100)::bigint * v_freight)/v_remaining_freight base,
         (round(shipping_amount*100)::bigint * v_freight)%v_remaining_freight remainder
       from public.supply_purchase_order_items
       where order_id=p_order_id and not id=any(v_cancel_ids)
     ), extras as (
       select *, row_number() over(order by remainder desc,id) idx,
         v_freight-sum(base) over() leftover from weighted
     )
     select id,line_cents,ship_cents,
       (base+case when idx<=leftover then 1 else 0 end)::bigint allocation
     from extras
   ) allocations where allocation>0;
 end if;
 if v_cancel+v_freight<>p_refund_cents or
   (select coalesce(sum((el->>'reduction_cents')::bigint),0)
    from jsonb_array_elements(v_expected) el)<>p_refund_cents then
   raise exception 'Falha de conciliação em centavos';
 end if;
 insert into public.supply_purchase_partial_adjustments(
  purchase_id,order_id,payment_id,refund_attachment_id,
  original_cents,cancelled_cents,freight_reduction_cents,
  refund_cents,remaining_cents,refunded_on,reference,reason,line_adjustments,actor_id
 ) values(
  v_order.purchase_id,p_order_id,p_payment_id,p_refund_attachment_id,
  v_gross,v_cancel,v_freight,p_refund_cents,v_gross-p_refund_cents,
  p_refunded_on,btrim(p_reference),btrim(p_reason),v_expected,v_actor
 ) returning id into v_id;
 insert into public.audit_logs(actor_usuario_id,action,entity_type,entity_id,
  before_json,after_json,origin)
 values(v_actor,'purchase.partial_refund.registered',
   'supply_purchase_partial_adjustment',v_id,
   jsonb_build_object('original_payment_cents',v_gross,'order_id',p_order_id),
   jsonb_build_object('refund_cents',p_refund_cents,'remaining_cents',v_gross-p_refund_cents,
     'cancelled_cents',v_cancel,'freight_reduction_cents',v_freight,
     'attachment_id',p_refund_attachment_id,'lines',v_expected,
     'reference',p_reference,'reason',p_reason),'database');
 return v_id;
end;
$function$
;
REVOKE ALL ON FUNCTION app.register_supply_purchase_partial_adjustment_freight_v3(uuid,uuid,uuid,date,text,text,bigint,bigint,jsonb)
  FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.register_supply_purchase_partial_adjustment_v2(p_order_id uuid, p_payment_id uuid, p_refund_attachment_id uuid, p_reference text, p_reason text, p_expected_original_cents bigint, p_adjustments jsonb, p_refund_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_line_ids uuid[]:='{}';
  v_entry jsonb;
  v_line_id uuid;
  v_date date;
  v_amount bigint;
  v_total bigint:=0;
  v_latest date;
  v_id uuid;
  v_actor uuid;
BEGIN
  -- v1 executa também as validações de auth, loja, pagamento, documento,
  -- antifraude, frete e repetição, no mesmo contexto transacional.
  IF jsonb_typeof(p_adjustments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_adjustments)<1
    OR jsonb_array_length(p_adjustments)>150 THEN
    RAISE EXCEPTION 'Selecione os itens integralmente cancelados';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_adjustments) LOOP
    IF v_entry->>'kind'<>'cancelled' OR (v_entry->>'line_id') IS NULL THEN
      RAISE EXCEPTION 'Seleção de itens cancelados inválida';
    END IF;
    v_line_id:=(v_entry->>'line_id')::uuid;
    IF v_line_id=ANY(v_line_ids) THEN
      RAISE EXCEPTION 'Item cancelado repetido';
    END IF;
    v_line_ids:=array_append(v_line_ids,v_line_id);
  END LOOP;
  IF jsonb_typeof(p_refund_entries) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_refund_entries)<1 OR jsonb_array_length(p_refund_entries)>150 THEN
    RAISE EXCEPTION 'Informe os lançamentos de reembolso por item e data';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_refund_entries) LOOP
    IF coalesce(v_entry->>'line_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(v_entry->>'amount_cents','') !~ '^[0-9]{1,14}$'
       OR coalesce(v_entry->>'refunded_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Informe item, valor e data válidos em cada reembolso';
    END IF;
    v_line_id:=(v_entry->>'line_id')::uuid;
    IF NOT v_line_id=ANY(v_line_ids) THEN
      RAISE EXCEPTION 'Um reembolso foi associado a item não cancelado';
    END IF;
    v_amount:=(v_entry->>'amount_cents')::bigint;
    v_date:=(v_entry->>'refunded_on')::date;
    IF v_amount<=0 OR v_date>current_date THEN
      RAISE EXCEPTION 'Valor deve ser positivo e data não pode ser futura';
    END IF;
    v_total:=v_total+v_amount;
    v_latest:=greatest(coalesce(v_latest,v_date),v_date);
  END LOOP;
  IF v_total<=0 THEN RAISE EXCEPTION 'O valor total do reembolso deve ser positivo'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_line_ids) lid
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_refund_entries) e
      WHERE (e->>'line_id')::uuid=lid
    )
  ) THEN
    RAISE EXCEPTION 'Informe ao menos um reembolso para cada item cancelado';
  END IF;

  v_id:=app.register_supply_purchase_partial_adjustment_freight_v3(
    p_order_id,p_payment_id,p_refund_attachment_id,v_latest,
    p_reference,p_reason,p_expected_original_cents,v_total,p_adjustments
  );
  UPDATE public.supply_purchase_partial_adjustments
    SET refund_entries=p_refund_entries WHERE id=v_id;
  v_actor:=app.current_usuario_id();
  INSERT INTO public.audit_logs(actor_usuario_id,action,entity_type,entity_id,before_json,after_json,origin)
  VALUES(v_actor,'purchase.partial_refund.entries_registered',
    'supply_purchase_partial_adjustment',v_id,NULL,
    jsonb_build_object('refund_entries',p_refund_entries,'refund_cents',v_total),'database');
  RETURN v_id;
END
$function$
;
COMMIT;
