-- The administrative document audit belongs exclusively to the named USR-0001 account.
-- Do not change rights to the other administration modules.
BEGIN;
DO $scope$
DECLARE
  v_owner uuid;
  v_permission uuid;
BEGIN
  SELECT u.id INTO v_owner
  FROM public.usuarios u
  WHERE u.codigo_negocio='USR-0001' AND u.nome='Ernands Santos' AND u.status='active';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner USR-0001 Ernands Santos is not active or does not exist';
  END IF;

  SELECT p.id INTO v_permission FROM public.permissoes p WHERE p.chave='access.audit_view' AND p.ativo;
  IF v_permission IS NULL THEN
    RAISE EXCEPTION 'Audit permission access.audit_view not found';
  END IF;

  -- Remove inherited administrator access and any existing explicit grant/denial
  -- exclusively for this capability, without touching other permissions.
  DELETE FROM public.perfil_permissoes WHERE permissao_id=v_permission;
  DELETE FROM public.usuario_permissoes WHERE permissao_id=v_permission;

  INSERT INTO public.usuario_permissoes(
    usuario_id,permissao_id,loja_id,efeito,expires_at,motivo,created_by
  ) VALUES (
    v_owner,v_permission,NULL,'grant',NULL,
    'Auditoria OBR/CMP exclusiva ao USR-0001',v_owner
  );
END;
$scope$;

CREATE OR REPLACE FUNCTION public.admin_reference_audit_v1(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_id uuid;
  v_kind text;
  v_created timestamptz;
  v_creator uuid;
  v_creator_name text;
  v_creator_basis text;
  v_place text;
  v_status text;
  v_docs jsonb:='[]'::jsonb;
  v_events jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT app.can('access','view') OR NOT app.can('access','audit_view')
     OR app.current_usuario_id() IS DISTINCT FROM (
       SELECT u.id FROM public.usuarios u
       WHERE u.codigo_negocio='USR-0001' AND u.nome='Ernands Santos' AND u.status='active'
     ) THEN
    RAISE EXCEPTION 'Acesso nao autorizado' USING ERRCODE='42501';
  END IF;
  IF v_code !~ '^(OBR|CMP)-[0-9]{5,}$' THEN
    RAISE EXCEPTION 'Codigo invalido' USING ERRCODE='22023';
  END IF;
  IF v_code LIKE 'OBR-%' THEN
    v_kind:='OBR';
    SELECT id,created_at,created_by,status,
      concat_ws('/',nullif(store_city_snapshot,''),nullif(store_state_snapshot,''))
    INTO v_id,v_created,v_creator,v_status,v_place
    FROM public.works_services WHERE codigo_negocio=v_code;
    v_creator_basis:='Autor do cadastro';
    IF v_id IS NULL THEN RETURN NULL; END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'name',d.original_name,'type',d.document_type,
      'uploadedAt',d.created_at,'uploadedBy',coalesce(u.nome,'Nao identificado'),
      'deleted',false,'deletedAt',null,'number',d.document_number
    ) ORDER BY d.created_at,d.id),'[]'::jsonb)
    INTO v_docs
    FROM public.works_service_documents d
    LEFT JOIN public.usuarios u ON u.id=d.created_by
    WHERE d.service_id=v_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'fileId',a.entity_id,'action',a.action,
      'at',a.occurred_at,'by',coalesce(u.nome,'Nao identificado'),
      'name',coalesce(a.after_json->>'original_name',a.before_json->>'original_name','Arquivo sem nome'),
      'previousName',a.before_json->>'original_name','nextName',a.after_json->>'original_name',
      'previousType',a.before_json->>'document_type','nextType',a.after_json->>'document_type',
      'previousStatus',a.before_json->>'status','nextStatus',a.after_json->>'status',
      'previousPaymentId',a.before_json->>'payment_id','nextPaymentId',a.after_json->>'payment_id',
      'fileChanged',coalesce(a.before_json->>'storage_path','')<>coalesce(a.after_json->>'storage_path','')
    ) ORDER BY a.occurred_at,a.id),'[]'::jsonb)
    INTO v_events
    FROM public.audit_logs a LEFT JOIN public.usuarios u ON u.id=a.actor_usuario_id
    WHERE a.entity_type='works_service_documents'
      AND (a.before_json->>'service_id'=v_id::text OR a.after_json->>'service_id'=v_id::text);
  ELSE
    v_kind:='CMP';
    SELECT id,created_at,status,origin_city_snapshot
    INTO v_id,v_created,v_status,v_place
    FROM public.supply_purchases WHERE codigo_negocio=v_code;
    IF v_id IS NULL THEN RETURN NULL; END IF;

    -- CMP e criada pela aprovacao da cotacao; a trilha registra o autor desse ato.
    SELECT actor_usuario_id INTO v_creator
    FROM public.audit_logs
    WHERE entity_type='supply_purchase' AND entity_id=v_id AND action='purchase.approved'
    ORDER BY occurred_at LIMIT 1;
    v_creator_basis:='Aprovacao que gerou a CMP (auditoria)';
    IF v_creator IS NULL THEN
      SELECT approved_by INTO v_creator FROM public.supply_purchases WHERE id=v_id;
      v_creator_basis:='Aprovador registrado na CMP';
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'name',d.original_name,'type',d.document_type,
      'uploadedAt',d.created_at,'uploadedBy',coalesce(u.nome,'Nao identificado'),
      'deleted',d.deleted_at IS NOT NULL,'deletedAt',d.deleted_at,'number',d.document_number
    ) ORDER BY d.created_at,d.id),'[]'::jsonb)
    INTO v_docs
    FROM public.supply_purchase_attachments d LEFT JOIN public.usuarios u ON u.id=d.created_by
    WHERE d.purchase_id=v_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'fileId',a.entity_id,'action',a.action,
      'at',a.occurred_at,'by',coalesce(u.nome,'Nao identificado'),
      'name',coalesce(a.after_json->>'original_name',a.before_json->>'original_name','Arquivo sem nome'),
      'previousName',a.before_json->>'original_name','nextName',a.after_json->>'original_name',
      'previousType',a.before_json->>'document_type','nextType',a.after_json->>'document_type',
      'fileChanged',coalesce(a.before_json->>'storage_path','')<>coalesce(a.after_json->>'storage_path','')
    ) ORDER BY a.occurred_at,a.id),'[]'::jsonb)
    INTO v_events
    FROM public.audit_logs a LEFT JOIN public.usuarios u ON u.id=a.actor_usuario_id
    WHERE a.entity_type='supply_purchase_attachment'
      AND (a.before_json->>'purchase_id'=v_id::text OR a.after_json->>'purchase_id'=v_id::text
        OR a.entity_id IN (SELECT d.id FROM public.supply_purchase_attachments d WHERE d.purchase_id=v_id));
  END IF;

  SELECT u.nome INTO v_creator_name FROM public.usuarios u WHERE u.id=v_creator;
  RETURN jsonb_build_object('code',v_code,'kind',v_kind,'createdAt',v_created,
    'createdBy',coalesce(v_creator_name,'Nao identificado'),'creatorBasis',v_creator_basis,
    'location',v_place,'status',v_status,'files',v_docs,'events',v_events);
END;
$func$;
REVOKE ALL ON FUNCTION public.admin_reference_audit_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reference_audit_v1(text) TO authenticated;
COMMIT;