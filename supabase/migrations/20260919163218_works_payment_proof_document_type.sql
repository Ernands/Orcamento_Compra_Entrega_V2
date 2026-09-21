-- Complementa a migracao anterior com o tipo explicito de comprovante de pagamento.

alter table public.works_service_documents
  drop constraint if exists works_service_documents_document_type_check;

alter table public.works_service_documents
  add constraint works_service_documents_document_type_check
  check (document_type in ('quote', 'invoice', 'receipt', 'rpa', 'payment_proof', 'other'));
