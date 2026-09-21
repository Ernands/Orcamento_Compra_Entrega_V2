-- Índices de auditoria; migration idempotente para promoção após Obras.
create index if not exists works_service_components_created_by_idx
  on public.works_service_components(created_by);

create index if not exists works_service_components_updated_by_idx
  on public.works_service_components(updated_by);
