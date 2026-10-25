-- PREVIEW ONLY. Apply to an isolated Supabase DEV database before testing close/reopen.
-- Never run against PROD without authorization and a verified backup.
-- Existing lojas.status is operational; financial closure is a separate state.

INSERT INTO public.acoes (chave, nome) VALUES ('finalize_reopen','Finalizar/Reabrir Loja')
ON CONFLICT (chave) DO NOTHING;
INSERT INTO public.permissoes (modulo_id,acao_id,chave,descricao,ativo)
SELECT m.id,a.id,'stores.finalize_reopen','Finalizar e reabrir financeiramente lojas',true
FROM public.modulos m CROSS JOIN public.acoes a
WHERE m.chave='stores' AND a.chave='finalize_reopen'
ON CONFLICT (chave) DO NOTHING;
-- Administrators receive the new capability by profile, subject to user-level deny overrides.
INSERT INTO public.perfil_permissoes (perfil_id,permissao_id)
SELECT perfil.id,p.id FROM public.perfis perfil JOIN public.permissoes p ON p.chave='stores.finalize_reopen'
WHERE perfil.chave='administrator'
ON CONFLICT DO NOTHING;

CREATE TABLE public.store_financial_closures (
  store_id uuid PRIMARY KEY REFERENCES public.lojas(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.usuarios(id),
  closed_by_name text,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES public.usuarios(id),
  reopened_by_name text,
  reopen_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closed_metadata_present CHECK (state='open' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL))
);
CREATE TABLE public.store_financial_closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK(event IN ('closed','reopened','document_added')),
  actor_usuario_id uuid REFERENCES public.usuarios(id),
  actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON public.store_financial_closure_events (store_id,occurred_at DESC);
ALTER TABLE public.store_financial_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_financial_closure_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_financial_closures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.store_financial_closure_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_financial_closures TO authenticated;
GRANT SELECT ON public.store_financial_closure_events TO authenticated;
CREATE POLICY store_closure_read ON public.store_financial_closures FOR SELECT TO authenticated
USING (app.can_store('stores','view',store_id) OR app.can_store('finance','store_detail_view',store_id)
    OR app.can_store('works','view',store_id));
CREATE POLICY store_closure_events_read ON public.store_financial_closure_events FOR SELECT TO authenticated
USING (app.can_store('stores','view',store_id) OR app.can_store('finance','store_detail_view',store_id)
    OR app.can_store('works','view',store_id));

-- Lock the parent loja row for EVERY financial write. Closing takes FOR UPDATE
-- on this same row, preventing TOCTOU races with payments committed concurrently.
CREATE FUNCTION private.assert_store_financially_open(p_store_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_closed boolean;
BEGIN
 IF p_store_id IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.lojas WHERE id=p_store_id FOR SHARE;
 SELECT (state='closed') INTO v_closed FROM public.store_financial_closures WHERE store_id=p_store_id;
 IF COALESCE(v_closed,false) THEN
  RAISE EXCEPTION USING ERRCODE='P0001',
   MESSAGE='Esta loja está finalizada e não permite novas movimentações financeiras. Para realizar alterações, um administrador autorizado deve reabrir a loja.';
 END IF;
END; $$;
REVOKE ALL ON FUNCTION private.assert_store_financially_open(uuid) FROM PUBLIC, anon, authenticated;

-- Purchases may involve multiple stores. Any change to their financial source
-- is conservatively blocked if ANY related store is already closed.
CREATE FUNCTION private.finance_purchase_store_ids(p_purchase_id uuid) RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$
 SELECT s.store_id FROM public.supply_purchase_stores s WHERE s.purchase_id=p_purchase_id
 UNION
 SELECT sl.store_id FROM public.supply_purchase_orders o
 JOIN public.supply_purchase_order_items l ON l.order_id=o.id
 JOIN public.supply_purchase_order_line_stores sl ON sl.order_line_id=l.id
 WHERE o.purchase_id=p_purchase_id
 UNION
 SELECT ds.store_id FROM public.supply_purchase_destination_stores ds
 WHERE ds.purchase_id=p_purchase_id
 UNION
 SELECT sl.store_id FROM public.supply_purchase_orders o
 JOIN public.supply_purchase_order_items l ON l.order_id=o.id
 JOIN public.supply_purchase_destinations d ON d.id=l.purchase_destination_id
 JOIN public.supply_purchase_destination_stores sl ON sl.purchase_destination_id=d.id
 WHERE o.purchase_id=p_purchase_id
$$;
REVOKE ALL ON FUNCTION private.finance_purchase_store_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.guard_store_financial_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_row jsonb; v_parent uuid; v_store uuid; v_idx integer; v_direct_store uuid;
BEGIN
 -- Inspect BOTH OLD and NEW; a move away from a closed store also modifies its totals.
 FOR v_idx IN 1..2 LOOP
  IF (v_idx=1 AND TG_OP='INSERT') OR (v_idx=2 AND TG_OP='DELETE') THEN CONTINUE; END IF;
  IF v_idx=1 THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
  v_parent := NULL;
  v_direct_store := NULL;
  IF v_row ? 'store_id' AND NULLIF(v_row->>'store_id','') IS NOT NULL THEN
    v_direct_store := (v_row->>'store_id')::uuid;
  END IF;
  IF v_direct_store IS NOT NULL THEN PERFORM private.assert_store_financially_open(v_direct_store); END IF;
  -- A work payment/component may carry a stale or reassigned store_id.
  -- Always guard the parent service's store as well, on both OLD and NEW rows.
  IF TG_TABLE_NAME IN ('works_service_payments','works_service_components') THEN
    SELECT ws.store_id INTO v_store FROM public.works_services ws
    WHERE ws.id=NULLIF(v_row->>'service_id','')::uuid;
    IF v_store IS NOT NULL THEN PERFORM private.assert_store_financially_open(v_store); END IF;
  END IF;
  CASE TG_TABLE_NAME
   WHEN 'supply_purchases','supply_purchase_stores','supply_purchase_payments',
        'supply_purchase_items','supply_purchase_orders','supply_purchase_destinations',
        'supply_purchase_destination_stores','supply_purchase_attachments' THEN
    IF v_row ? 'purchase_id' THEN v_parent := NULLIF(v_row->>'purchase_id','')::uuid; END IF;
    IF TG_TABLE_NAME='supply_purchases' THEN v_parent := (v_row->>'id')::uuid; END IF;
    IF TG_TABLE_NAME='supply_purchase_destinations' THEN
      SELECT pi.purchase_id INTO v_parent FROM public.supply_purchase_items pi
      WHERE pi.id=NULLIF(v_row->>'purchase_item_id','')::uuid;
    END IF;
   WHEN 'supply_purchase_order_items' THEN
    SELECT po.purchase_id INTO v_parent FROM public.supply_purchase_orders po
    WHERE po.id=NULLIF(v_row->>'order_id','')::uuid;
   WHEN 'supply_purchase_order_line_stores' THEN
    SELECT po.purchase_id INTO v_parent FROM public.supply_purchase_orders po
    JOIN public.supply_purchase_order_items li ON li.order_id=po.id
    WHERE li.id=NULLIF(v_row->>'order_line_id','')::uuid;
   WHEN 'supply_purchase_payment_occurrences' THEN
    SELECT pay.purchase_id INTO v_parent FROM public.supply_purchase_payments pay
    WHERE pay.id=NULLIF(v_row->>'payment_id','')::uuid;
   WHEN 'finance_reimbursement_items' THEN
    v_direct_store := NULLIF(v_row->>'store_id','')::uuid;
   WHEN 'finance_reimbursements' THEN
    v_direct_store := NULLIF(v_row->>'store_id','')::uuid;
  END CASE;
  IF v_parent IS NOT NULL THEN
   FOR v_store IN SELECT store_id FROM private.finance_purchase_store_ids(v_parent) LOOP
     PERFORM private.assert_store_financially_open(v_store);
   END LOOP;
  END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
REVOKE ALL ON FUNCTION private.guard_store_financial_changes() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE tbl text;
BEGIN
 -- Protect every direct and derived source of the consolidated financial value.
 FOREACH tbl IN ARRAY ARRAY[
   'supply_purchases','supply_purchase_stores','supply_purchase_items',
   'supply_purchase_destinations','supply_purchase_destination_stores',
   'supply_purchase_orders','supply_purchase_order_items','supply_purchase_order_line_stores',
   'supply_purchase_payments','supply_purchase_payment_occurrences',
   'works_services','works_service_payments','works_service_components',
   'finance_reimbursement_items',
   'finance_store_budgets'
 ] LOOP
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
    FOR EACH ROW EXECUTE FUNCTION private.guard_store_financial_changes()',
    'financial_lock_'||tbl,tbl);
 END LOOP;
END; $$;


-- Existing reimbursement metadata (bank protocol/status/decision) remains editable,
-- even after closure. Changing its owner store or deleting its history is forbidden.
CREATE FUNCTION private.guard_reimbursement_reference_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
BEGIN
 IF TG_OP='DELETE' THEN
   PERFORM private.assert_store_financially_open(OLD.store_id);
   RETURN OLD;
 END IF;
 IF OLD.store_id IS DISTINCT FROM NEW.store_id THEN
   PERFORM private.assert_store_financially_open(OLD.store_id);
   PERFORM private.assert_store_financially_open(NEW.store_id);
 END IF;
 RETURN NEW;
END; $;
CREATE TRIGGER financial_reimbursement_protect_reference
 BEFORE UPDATE OR DELETE ON public.finance_reimbursements
 FOR EACH ROW EXECUTE FUNCTION private.guard_reimbursement_reference_change();

-- Documents may be appended while closed. Removal/modification of historical
-- documents is blocked to prevent replacing an invoice or altering its fiscal value.
CREATE FUNCTION private.guard_closed_store_document_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_store uuid; v_parent uuid; v_doc jsonb;
BEGIN
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 FOR v_doc IN SELECT to_jsonb(OLD) UNION ALL SELECT to_jsonb(NEW) WHERE TG_OP='UPDATE' LOOP
   IF TG_TABLE_NAME='works_service_documents' THEN
     v_store := NULLIF(v_doc->>'store_id','')::uuid;
     PERFORM private.assert_store_financially_open(v_store);
     SELECT ws.store_id INTO v_store FROM public.works_services ws
     WHERE ws.id=NULLIF(v_doc->>'service_id','')::uuid;
     IF v_store IS NOT NULL THEN PERFORM private.assert_store_financially_open(v_store); END IF;
   ELSE
     v_parent := NULLIF(v_doc->>'purchase_id','')::uuid;
     FOR v_store IN SELECT store_id FROM private.finance_purchase_store_ids(v_parent) LOOP
       PERFORM private.assert_store_financially_open(v_store);
     END LOOP;
   END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER financial_lock_works_documents BEFORE UPDATE OR DELETE ON public.works_service_documents
FOR EACH ROW EXECUTE FUNCTION private.guard_closed_store_document_changes();
CREATE TRIGGER financial_lock_purchase_documents BEFORE UPDATE OR DELETE ON public.supply_purchase_attachments
FOR EACH ROW EXECUTE FUNCTION private.guard_closed_store_document_changes();

-- Store-to-document links may be added without changing the expense; removing
-- a link is not permitted once any affected store is closed.
CREATE FUNCTION private.guard_closed_document_store_unlink() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
   PERFORM private.assert_store_financially_open(OLD.store_id);
   IF TG_OP='UPDATE' THEN PERFORM private.assert_store_financially_open(NEW.store_id); END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER financial_lock_attachment_stores BEFORE UPDATE OR DELETE ON public.supply_purchase_attachment_stores
FOR EACH ROW EXECUTE FUNCTION private.guard_closed_document_store_unlink();

-- Immutable append-only closure history, including new fiscal evidence after closing.
CREATE FUNCTION private.audit_financial_document_append() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_store uuid; v_actor uuid; v_name text; v_parent uuid;
BEGIN
 v_actor := app.current_usuario_id();
 SELECT nome INTO v_name FROM public.usuarios WHERE id=v_actor;
 IF TG_TABLE_NAME='works_service_documents' THEN
    FOR v_store IN SELECT DISTINCT stores.store_id
      FROM (SELECT NEW.store_id AS store_id UNION ALL
            SELECT ws.store_id FROM public.works_services ws WHERE ws.id=NEW.service_id) stores
      WHERE stores.store_id IS NOT NULL LOOP
      IF EXISTS(SELECT 1 FROM public.store_financial_closures c WHERE c.store_id=v_store AND c.state='closed') THEN
       INSERT INTO public.store_financial_closure_events(store_id,event,actor_usuario_id,actor_name,details)
       VALUES(v_store,'document_added',v_actor,v_name,jsonb_build_object('document_id',NEW.id,'source','work','document_type',NEW.document_type));
      END IF;
    END LOOP;
 ELSE
    v_parent:=NEW.purchase_id;
    FOR v_store IN SELECT store_id FROM private.finance_purchase_store_ids(v_parent) LOOP
      IF EXISTS(SELECT 1 FROM public.store_financial_closures c WHERE c.store_id=v_store AND c.state='closed') THEN
       INSERT INTO public.store_financial_closure_events(store_id,event,actor_usuario_id,actor_name,details)
       VALUES(v_store,'document_added',v_actor,v_name,jsonb_build_object('document_id',NEW.id,'source','purchase','document_type',NEW.document_type));
      END IF;
    END LOOP;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER store_closed_work_document_added AFTER INSERT ON public.works_service_documents
FOR EACH ROW EXECUTE FUNCTION private.audit_financial_document_append();
CREATE TRIGGER store_closed_purchase_document_added AFTER INSERT ON public.supply_purchase_attachments
FOR EACH ROW EXECUTE FUNCTION private.audit_financial_document_append();

CREATE FUNCTION public.change_store_financial_closure(
 p_store_id uuid, p_action text, p_confirm_text text, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid; v_name text; v_prev text; v_next text; v_ts timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_as(auth.uid(),'stores','finalize_reopen')
    OR NOT app.can_store('stores','view',p_store_id) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sem permissão para finalizar ou reabrir esta loja.';
 END IF;
 IF p_action NOT IN ('close','reopen') THEN RAISE EXCEPTION 'Operação inválida.'; END IF;
 IF p_confirm_text <> CASE WHEN p_action='close' THEN 'FINALIZAR' ELSE 'REABRIR' END THEN
   RAISE EXCEPTION 'Confirmação adicional obrigatória.';
 END IF;
 IF p_action='reopen' AND length(trim(coalesce(p_reason,'')))<10 THEN
   RAISE EXCEPTION 'Informe o motivo da reabertura (mínimo de 10 caracteres).';
 END IF;
 SELECT id INTO v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND status='active';
 SELECT nome INTO v_name FROM public.usuarios WHERE id=v_actor;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Usuário ativo não encontrado.'; END IF;
 -- Serialized with every financial trigger to guarantee no write crosses closing.
 PERFORM 1 FROM public.lojas WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada.'; END IF;
 SELECT state INTO v_prev FROM public.store_financial_closures WHERE store_id=p_store_id FOR UPDATE;
 v_prev:=coalesce(v_prev,'open');
 v_next:=CASE WHEN p_action='close' THEN 'closed' ELSE 'open' END;
 IF v_prev=v_next THEN RAISE EXCEPTION 'A loja já está neste estado de fechamento.'; END IF;
 INSERT INTO public.store_financial_closures
   (store_id,state,closed_at,closed_by,closed_by_name,reopened_at,reopened_by,reopened_by_name,reopen_reason,updated_at)
 VALUES (p_store_id,v_next,
  CASE WHEN v_next='closed' THEN v_ts END,CASE WHEN v_next='closed' THEN v_actor END,
  CASE WHEN v_next='closed' THEN v_name END,
  CASE WHEN v_next='open' THEN v_ts END,CASE WHEN v_next='open' THEN v_actor END,
  CASE WHEN v_next='open' THEN v_name END,
  CASE WHEN v_next='open' THEN trim(p_reason) END,v_ts)
 ON CONFLICT (store_id) DO UPDATE SET
 state=v_next,
 closed_at=CASE WHEN v_next='closed' THEN v_ts ELSE public.store_financial_closures.closed_at END,
 closed_by=CASE WHEN v_next='closed' THEN v_actor ELSE public.store_financial_closures.closed_by END,
 closed_by_name=CASE WHEN v_next='closed' THEN v_name ELSE public.store_financial_closures.closed_by_name END,
 reopened_at=CASE WHEN v_next='open' THEN v_ts ELSE public.store_financial_closures.reopened_at END,
 reopened_by=CASE WHEN v_next='open' THEN v_actor ELSE public.store_financial_closures.reopened_by END,
 reopened_by_name=CASE WHEN v_next='open' THEN v_name ELSE public.store_financial_closures.reopened_by_name END,
 reopen_reason=CASE WHEN v_next='open' THEN trim(p_reason) ELSE public.store_financial_closures.reopen_reason END,
 updated_at=v_ts;
 INSERT INTO public.store_financial_closure_events(store_id,event,actor_usuario_id,actor_name,reason)
 VALUES(p_store_id,CASE WHEN v_next='closed' THEN 'closed' ELSE 'reopened' END,v_actor,v_name,
 CASE WHEN v_next='open' THEN trim(p_reason) END);
 RETURN jsonb_build_object('store_id',p_store_id,'state',v_next,'by',v_name,'at',v_ts);
END; $$;
REVOKE ALL ON FUNCTION public.change_store_financial_closure(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_store_financial_closure(uuid,text,text,text) TO authenticated;

-- Note: financial changes through direct Data API, SECURITY DEFINER RPCs and
-- legacy routes are blocked by BEFORE triggers, not by frontend-only permissions.
