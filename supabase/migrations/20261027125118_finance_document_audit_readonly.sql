-- Read-only audit access. No purchase/work/payment/document records are changed.
-- Use the established store-scope helper; never bypass store assignment or explicit denials.
begin;
insert into public.acoes(chave,nome) values
 ('document_audit_view','Visualizar e exportar conferência documental')
on conflict (chave) do nothing;
insert into public.permissoes(modulo_id,acao_id,chave,descricao,ativo)
select m.id,a.id,'finance.document_audit_view',
 'Conferência de Compras e Obras — visualizar e exportar documentos (somente leitura)',true
from public.modulos m cross join public.acoes a
where m.chave='finance' and a.chave='document_audit_view'
on conflict (chave) do update set descricao=excluded.descricao,ativo=true;
-- Grant the new feature to administrators only. Other profiles remain opt-in in Acessos.
insert into public.perfil_permissoes(perfil_id,permissao_id)
select pf.id,p.id from public.perfis pf cross join public.permissoes p
where pf.chave='administrator' and p.chave='finance.document_audit_view'
on conflict do nothing;

drop policy if exists audit_lojas_select on public.lojas;
create policy audit_lojas_select on public.lojas for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',id)
);

drop policy if exists audit_supply_purchase_stores_select on public.supply_purchase_stores;
create policy audit_supply_purchase_stores_select on public.supply_purchase_stores for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores;
create policy audit_supply_purchase_destination_stores_select on public.supply_purchase_destination_stores for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores;
create policy audit_supply_purchase_order_line_stores_select on public.supply_purchase_order_line_stores for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_supply_purchase_attachment_stores_select on public.supply_purchase_attachment_stores;
create policy audit_supply_purchase_attachment_stores_select on public.supply_purchase_attachment_stores for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_works_services_select on public.works_services;
create policy audit_works_services_select on public.works_services for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_works_service_components_select on public.works_service_components;
create policy audit_works_service_components_select on public.works_service_components for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_works_service_payments_select on public.works_service_payments;
create policy audit_works_service_payments_select on public.works_service_payments for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_works_service_documents_select on public.works_service_documents;
create policy audit_works_service_documents_select on public.works_service_documents for select to authenticated using (
 app.can('finance','view') and app.can_store('finance','document_audit_view',store_id)
);

drop policy if exists audit_supply_purchases_select on public.supply_purchases;
create policy audit_supply_purchases_select on public.supply_purchases for select to authenticated using (
 app.can('finance','view') and app.can_read_supply_purchase_for(id,'finance','document_audit_view')
);

drop policy if exists audit_supply_purchase_items_select on public.supply_purchase_items;
create policy audit_supply_purchase_items_select on public.supply_purchase_items for select to authenticated using (
 app.can('finance','view') and app.can_read_supply_purchase_for(purchase_id,'finance','document_audit_view')
);

drop policy if exists audit_supply_purchase_orders_select on public.supply_purchase_orders;
create policy audit_supply_purchase_orders_select on public.supply_purchase_orders for select to authenticated using (
 app.can('finance','view') and app.can_read_supply_purchase_for(purchase_id,'finance','document_audit_view')
);

drop policy if exists audit_supply_purchase_payments_select on public.supply_purchase_payments;
create policy audit_supply_purchase_payments_select on public.supply_purchase_payments for select to authenticated using (
 app.can('finance','view') and app.can_read_supply_purchase_for(purchase_id,'finance','document_audit_view')
);

drop policy if exists audit_supply_purchase_attachments_select on public.supply_purchase_attachments;
create policy audit_supply_purchase_attachments_select on public.supply_purchase_attachments for select to authenticated using (
 app.can('finance','view') and app.can_read_supply_purchase_for(purchase_id,'finance','document_audit_view') and deleted_at is null
);

drop policy if exists audit_purchase_destinations_select on public.supply_purchase_destinations;
create policy audit_purchase_destinations_select on public.supply_purchase_destinations for select to authenticated using (
 app.can('finance','view') and exists (
  select 1 from public.supply_purchase_items i where i.id=purchase_item_id
   and app.can_read_supply_purchase_for(i.purchase_id,'finance','document_audit_view')
 )
);
drop policy if exists audit_purchase_order_items_select on public.supply_purchase_order_items;
create policy audit_purchase_order_items_select on public.supply_purchase_order_items for select to authenticated using (
 app.can('finance','view') and exists (
  select 1 from public.supply_purchase_orders o where o.id=order_id
   and app.can_read_supply_purchase_for(o.purchase_id,'finance','document_audit_view')
 )
);

-- Downloads remain tied to a real, undeleted attachment and the established scoped parent.
drop policy if exists audit_purchase_objects_select on storage.objects;
create policy audit_purchase_objects_select on storage.objects for select to authenticated using (
 bucket_id='purchase-attachments' and app.can('finance','view') and exists (
  select 1 from public.supply_purchase_attachments a
  where a.storage_path=storage.objects.name and a.deleted_at is null
   and a.purchase_id=app.storage_purchase_id(storage.objects.name)
   and app.can_read_supply_purchase_for(a.purchase_id,'finance','document_audit_view')
 )
);
drop policy if exists audit_work_objects_select on storage.objects;
create policy audit_work_objects_select on storage.objects for select to authenticated using (
 bucket_id='works-documents' and app.can('finance','view') and exists (
  select 1 from public.works_service_documents d
  where d.storage_path=storage.objects.name
   and d.store_id=app.storage_work_store_id(storage.objects.name)
   and app.can_store('finance','document_audit_view',d.store_id)
 )
);
-- XML is inert fiscal evidence; existing upload permissions remain unchanged.
update storage.buckets set allowed_mime_types = array(
 select distinct mime from unnest(allowed_mime_types || array['application/xml','text/xml']) as mime
) where id in ('purchase-attachments','works-documents') and allowed_mime_types is not null;
commit;
