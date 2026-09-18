drop policy if exists works_service_documents_read_scoped on public.works_service_documents;
create policy works_service_documents_read_scoped
on public.works_service_documents
for select
to authenticated
using (
  app.can_store('works', 'view', store_id)
  or app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
  or app.can_store('works', 'documents_view', store_id)
  or app.can_store('finance', 'store_detail_documents_view', store_id)
);
