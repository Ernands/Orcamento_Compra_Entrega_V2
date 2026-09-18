-- Granular permissions for per-user visibility and finance subviews.
insert into public.acoes (chave, nome)
values
  ('permissions_manage', 'Gerenciar permissoes'),
  ('overview_view', 'Visualizar Visao Geral'),
  ('store_detail_view', 'Visualizar detalhe da loja'),
  ('store_detail_documents_view', 'Visualizar documentos do detalhe'),
  ('payments_view', 'Visualizar pagamentos'),
  ('stores_ufs_view', 'Visualizar lojas e UFs'),
  ('reimbursements_view', 'Visualizar reembolsos'),
  ('budget_edit', 'Editar verba BB'),
  ('documents_view', 'Visualizar documentos')
on conflict (chave) do update
set nome = excluded.nome,
    updated_at = now();

insert into public.permissoes (modulo_id, acao_id, chave, descricao, ativo)
select m.id, a.id, v.permission_key, v.description, true
from (
  values
    ('access', 'permissions_manage', 'access.permissions_manage', 'Gerenciar permissoes especificas por usuario'),
    ('finance', 'overview_view', 'finance.overview_view', 'Visualizar a aba Visao Geral do Financeiro'),
    ('finance', 'store_detail_view', 'finance.store_detail_view', 'Visualizar o detalhe financeiro das lojas'),
    ('finance', 'store_detail_documents_view', 'finance.store_detail_documents_view', 'Abrir documentos vinculados às linhas do detalhe financeiro'),
    ('finance', 'payments_view', 'finance.payments_view', 'Visualizar a aba Pagamentos do Financeiro'),
    ('finance', 'stores_ufs_view', 'finance.stores_ufs_view', 'Visualizar a aba Lojas e UFs do Financeiro'),
    ('finance', 'reimbursements_view', 'finance.reimbursements_view', 'Visualizar a aba Reembolsos do Financeiro'),
    ('finance', 'budget_edit', 'finance.budget_edit', 'Editar a verba BB das lojas'),
    ('works', 'documents_view', 'works.documents_view', 'Visualizar documentos de Obras e Servicos')
) as v(module_key, action_key, permission_key, description)
join public.modulos m on m.chave = v.module_key
join public.acoes a on a.chave = v.action_key
on conflict (chave) do update
set descricao = excluded.descricao,
    ativo = true,
    updated_at = now();

with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'finance.view'
),
targets as (
  select id
  from public.permissoes
  where chave in (
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.store_detail_documents_view',
    'finance.payments_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  )
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, targets.id
from source_profiles cross join targets
on conflict (perfil_id, permissao_id) do nothing;

with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'finance.manage'
),
targets as (
  select id from public.permissoes where chave = 'finance.budget_edit'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, targets.id
from source_profiles cross join targets
on conflict (perfil_id, permissao_id) do nothing;

with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'works.view'
),
targets as (
  select id from public.permissoes where chave = 'works.documents_view'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, targets.id
from source_profiles cross join targets
on conflict (perfil_id, permissao_id) do nothing;

with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'access.edit'
),
targets as (
  select id from public.permissoes where chave = 'access.permissions_manage'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, targets.id
from source_profiles cross join targets
on conflict (perfil_id, permissao_id) do nothing;

with source_grants as (
  select up.usuario_id, up.expires_at, up.created_by
  from public.usuario_permissoes up
  join public.permissoes p on p.id = up.permissao_id
  where p.chave = 'finance.view'
    and up.loja_id is null
    and up.efeito = 'grant'
),
targets as (
  select id
  from public.permissoes
  where chave in (
    'finance.overview_view',
    'finance.store_detail_view',
    'finance.store_detail_documents_view',
    'finance.payments_view',
    'finance.stores_ufs_view',
    'finance.reimbursements_view'
  )
)
insert into public.usuario_permissoes
  (usuario_id, permissao_id, loja_id, efeito, expires_at, created_by)
select source_grants.usuario_id, targets.id, null, 'grant', source_grants.expires_at, source_grants.created_by
from source_grants cross join targets
on conflict (usuario_id, permissao_id, loja_id) do nothing;

with source_grants as (
  select up.usuario_id, up.expires_at, up.created_by
  from public.usuario_permissoes up
  join public.permissoes p on p.id = up.permissao_id
  where p.chave = 'works.view'
    and up.loja_id is null
    and up.efeito = 'grant'
),
targets as (
  select id from public.permissoes where chave = 'works.documents_view'
)
insert into public.usuario_permissoes
  (usuario_id, permissao_id, loja_id, efeito, expires_at, created_by)
select source_grants.usuario_id, targets.id, null, 'grant', source_grants.expires_at, source_grants.created_by
from source_grants cross join targets
on conflict (usuario_id, permissao_id, loja_id) do nothing;

create or replace function app.can_read_supply_purchase_for(
  p_purchase_id uuid,
  p_module_key text,
  p_action_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select app.can(p_module_key, p_action_key)
    and exists (
      select 1
      from public.supply_purchase_stores ps
      where ps.purchase_id = p_purchase_id
    )
    and not exists (
      select 1
      from public.supply_purchase_stores ps
      where ps.purchase_id = p_purchase_id
        and not app.can_store(p_module_key, p_action_key, ps.store_id)
    );
$function$;

create or replace function app.can_read_supply_purchase(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    app.can_read_supply_purchase_for(p_purchase_id, 'purchases', 'view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'overview_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'store_detail_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'payments_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'stores_ufs_view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'reimbursements_view');
$function$;

create or replace function app.can_read_supply_purchase_attachment(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    app.can_read_supply_purchase_for(p_purchase_id, 'purchases', 'view')
    or app.can_read_supply_purchase_for(p_purchase_id, 'finance', 'store_detail_documents_view');
$function$;

create or replace function app.can_read_supply_purchase_attachment_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.storage_path = p_object_name
      and attachment.deleted_at is null
      and attachment.purchase_id = app.storage_purchase_id(p_object_name)
      and app.can_read_supply_purchase_attachment(attachment.purchase_id)
  );
$function$;

create or replace function app.can_read_work_document_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.works_service_documents document
    where document.storage_path = p_object_name
      and document.store_id = app.storage_work_store_id(p_object_name)
      and (
        app.can_store('works', 'documents_view', document.store_id)
        or app.can_store('finance', 'store_detail_documents_view', document.store_id)
      )
  );
$function$;

drop policy if exists stores_read_scoped on public.lojas;
create policy stores_read_scoped
on public.lojas
for select
to authenticated
using (
  app.can_store('stores', 'view', id)
  or app.can_store('works', 'view', id)
  or app.can_store('finance', 'overview_view', id)
  or app.can_store('finance', 'store_detail_view', id)
  or app.can_store('finance', 'payments_view', id)
  or app.can_store('finance', 'stores_ufs_view', id)
  or app.can_store('finance', 'reimbursements_view', id)
);

drop policy if exists supply_purchase_stores_read_scoped on public.supply_purchase_stores;
create policy supply_purchase_stores_read_scoped
on public.supply_purchase_stores
for select
to authenticated
using (
  app.can_read_supply_purchase(purchase_id)
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists supply_purchase_destination_stores_read on public.supply_purchase_destination_stores;
create policy supply_purchase_destination_stores_read
on public.supply_purchase_destination_stores
for select
to authenticated
using (
  app.can_read_supply_purchase(purchase_id)
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read
on public.supply_purchase_order_line_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.id = supply_purchase_order_line_stores.order_line_id
      and app.can_read_supply_purchase(purchase_order.purchase_id)
  )
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'overview_view', store_id)
    or app.can_store('finance', 'store_detail_view', store_id)
    or app.can_store('finance', 'payments_view', store_id)
    or app.can_store('finance', 'stores_ufs_view', store_id)
    or app.can_store('finance', 'reimbursements_view', store_id)
  )
);

drop policy if exists supply_purchase_attachments_read_scoped on public.supply_purchase_attachments;
create policy supply_purchase_attachments_read_scoped
on public.supply_purchase_attachments
for select
to authenticated
using (
  deleted_at is null
  and app.can_read_supply_purchase_attachment(purchase_id)
);

drop policy if exists supply_purchase_attachment_stores_read on public.supply_purchase_attachment_stores;
create policy supply_purchase_attachment_stores_read
on public.supply_purchase_attachment_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.id = supply_purchase_attachment_stores.attachment_id
      and app.can_read_supply_purchase_attachment(attachment.purchase_id)
  )
  and (
    app.can_store('purchases', 'view', store_id)
    or app.can_store('finance', 'store_detail_documents_view', store_id)
  )
);

drop policy if exists works_services_read_scoped on public.works_services;
create policy works_services_read_scoped
on public.works_services
for select
to authenticated
using (
  app.can_store('works', 'view', store_id)
  or app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
);

drop policy if exists works_service_payments_read_scoped on public.works_service_payments;
create policy works_service_payments_read_scoped
on public.works_service_payments
for select
to authenticated
using (
  app.can_store('works', 'view', store_id)
  or app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
);

drop policy if exists works_service_documents_read_scoped on public.works_service_documents;
create policy works_service_documents_read_scoped
on public.works_service_documents
for select
to authenticated
using (
  app.can_store('works', 'documents_view', store_id)
  or app.can_store('finance', 'store_detail_documents_view', store_id)
);

drop policy if exists works_service_documents_manage_insert on public.works_service_documents;
create policy works_service_documents_manage_insert
on public.works_service_documents
for insert
to authenticated
with check (
  app.can_store('works', 'manage', store_id)
  and app.can_store('works', 'documents_view', store_id)
);

drop policy if exists works_service_documents_manage_update on public.works_service_documents;
create policy works_service_documents_manage_update
on public.works_service_documents
for update
to authenticated
using (
  app.can_store('works', 'manage', store_id)
  and app.can_store('works', 'documents_view', store_id)
)
with check (
  app.can_store('works', 'manage', store_id)
  and app.can_store('works', 'documents_view', store_id)
);

drop policy if exists works_service_documents_manage_delete on public.works_service_documents;
create policy works_service_documents_manage_delete
on public.works_service_documents
for delete
to authenticated
using (
  app.can_store('works', 'manage', store_id)
  and app.can_store('works', 'documents_view', store_id)
);

drop policy if exists finance_store_budgets_read_scoped on public.finance_store_budgets;
create policy finance_store_budgets_read_scoped
on public.finance_store_budgets
for select
to authenticated
using (
  app.can_store('finance', 'overview_view', store_id)
  or app.can_store('finance', 'store_detail_view', store_id)
);

drop policy if exists finance_store_budgets_manage_insert on public.finance_store_budgets;
create policy finance_store_budgets_manage_insert
on public.finance_store_budgets
for insert
to authenticated
with check (app.can_store('finance', 'budget_edit', store_id));

drop policy if exists finance_store_budgets_manage_update on public.finance_store_budgets;
create policy finance_store_budgets_manage_update
on public.finance_store_budgets
for update
to authenticated
using (app.can_store('finance', 'budget_edit', store_id))
with check (app.can_store('finance', 'budget_edit', store_id));

drop policy if exists finance_reimbursements_read_scoped on public.finance_reimbursements;
create policy finance_reimbursements_read_scoped
on public.finance_reimbursements
for select
to authenticated
using (app.can_store('finance', 'reimbursements_view', store_id));

drop policy if exists works_documents_objects_read on storage.objects;
create policy works_documents_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'works-documents'
  and app.can_read_work_document_object(name)
);

drop policy if exists works_documents_objects_create on storage.objects;
create policy works_documents_objects_create
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'works-documents'
  and app.can_store('works', 'manage', app.storage_work_store_id(name))
  and app.can_store('works', 'documents_view', app.storage_work_store_id(name))
);

drop policy if exists works_documents_objects_delete on storage.objects;
create policy works_documents_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'works-documents'
  and app.can_store('works', 'manage', app.storage_work_store_id(name))
  and app.can_store('works', 'documents_view', app.storage_work_store_id(name))
);

drop policy if exists purchase_attachments_objects_read on storage.objects;
create policy purchase_attachments_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'purchase-attachments'
  and app.can_read_supply_purchase_attachment_object(name)
);
