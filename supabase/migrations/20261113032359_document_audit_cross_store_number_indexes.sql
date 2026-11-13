-- Preview #85: index exact fiscal-number lookups without changing data or RLS.
-- Applied only to Supabase DEV during validation; PROD needs separate approval.
CREATE INDEX IF NOT EXISTS supply_purchase_attachments_audit_number_idx
  ON public.supply_purchase_attachments (document_number)
  WHERE deleted_at IS NULL
    AND document_type IN ('invoice', 'receipt')
    AND document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS works_service_documents_audit_number_idx
  ON public.works_service_documents (document_number)
  WHERE document_type IN ('invoice', 'receipt')
    AND document_number IS NOT NULL;
