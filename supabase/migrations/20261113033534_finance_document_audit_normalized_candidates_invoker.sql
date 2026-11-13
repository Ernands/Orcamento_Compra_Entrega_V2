-- DEV-only until separate production authorization.
-- Normalize fiscal numbers exclusively to collect manual-review candidates.
-- SECURITY INVOKER retains the caller's RLS on purchase/work documents.
CREATE INDEX IF NOT EXISTS supply_purchase_attachments_audit_number_normalized_idx
  ON public.supply_purchase_attachments
  ((upper(regexp_replace(btrim(document_number), '[[:space:]]+', '', 'g'))))
  WHERE deleted_at IS NULL
    AND document_type IN ('invoice', 'receipt')
    AND document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS works_service_documents_audit_number_normalized_idx
  ON public.works_service_documents
  ((upper(regexp_replace(btrim(document_number), '[[:space:]]+', '', 'g'))))
  WHERE document_type IN ('invoice', 'receipt')
    AND document_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finance_document_audit_fiscal_candidates_v1(
  p_numbers text[] DEFAULT '{}'::text[],
  p_paths text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(
  source text,
  id uuid,
  purchase_id uuid,
  service_id uuid,
  purchase_order_id uuid,
  document_type text,
  document_number text,
  storage_path text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    'purchase'::text,
    a.id, a.purchase_id, null::uuid, a.purchase_order_id,
    a.document_type, a.document_number, a.storage_path
  FROM public.supply_purchase_attachments AS a
  WHERE a.deleted_at IS NULL
    AND a.document_type IN ('invoice', 'receipt')
    AND (
      a.storage_path = ANY(coalesce(p_paths, '{}'::text[]))
      OR (
        a.document_number IS NOT NULL AND
        upper(regexp_replace(btrim(a.document_number), '[[:space:]]+', '', 'g'))
          = ANY(coalesce(p_numbers, '{}'::text[]))
      )
    )

  UNION ALL

  SELECT
    'work'::text,
    d.id, null::uuid, d.service_id, null::uuid,
    d.document_type, d.document_number, d.storage_path
  FROM public.works_service_documents AS d
  WHERE d.document_type IN ('invoice', 'receipt')
    AND (
      d.storage_path = ANY(coalesce(p_paths, '{}'::text[]))
      OR (
        d.document_number IS NOT NULL AND
        upper(regexp_replace(btrim(d.document_number), '[[:space:]]+', '', 'g'))
          = ANY(coalesce(p_numbers, '{}'::text[]))
      )
    )
$$;

REVOKE ALL ON FUNCTION public.finance_document_audit_fiscal_candidates_v1(text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_document_audit_fiscal_candidates_v1(text[], text[]) TO authenticated;
