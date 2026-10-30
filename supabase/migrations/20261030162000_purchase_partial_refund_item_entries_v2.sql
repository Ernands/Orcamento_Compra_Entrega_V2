-- Reembolsos parciais por item/data, total auditável sem alterar pagamento original.
-- Mantém RPC v1 e seus invariantes intactos; v2 delega a conciliação ao v1.
BEGIN;
ALTER TABLE public.supply_purchase_partial_adjustments
 ADD COLUMN IF NOT EXISTS refund_entries jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $check$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint WHERE conname='purchase_partial_refund_entries_array_v2'
   AND conrelid='public.supply_purchase_partial_adjustments'::regclass
 ) THEN
  ALTER TABLE public.supply_purchase_partial_adjustments
    ADD CONSTRAINT purchase_partial_refund_entries_array_v2
      CHECK (jsonb_typeof(refund_entries)='array');
 END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.register_supply_purchase_partial_adjustment_v2(
  p_order_id uuid, p_payment_id uuid, p_refund_attachment_id uuid,
  p_reference text, p_reason text, p_expected_original_cents bigint,
  p_adjustments jsonb, p_refund_entries jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
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

  v_id:=public.register_supply_purchase_partial_adjustment_v1(
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
$func$;

REVOKE ALL ON FUNCTION public.register_supply_purchase_partial_adjustment_v2(uuid,uuid,uuid,text,text,bigint,jsonb,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_supply_purchase_partial_adjustment_v2(uuid,uuid,uuid,text,text,bigint,jsonb,jsonb)
 TO authenticated;
COMMIT;