-- Obras e Servicos + verba por loja para a Visao Geral do Financeiro.
-- Aditiva: nao altera registros de Compras/Financeiro existentes.

insert into public.modulos (chave, nome)
values ('works', 'Obras e Servicos')
on conflict (chave) do update set nome = excluded.nome;

insert into public.acoes (chave, nome)
values ('manage', 'Gerenciar')
on conflict (chave) do update set nome = excluded.nome;

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, permission.key, permission.description
from (values
  ('works', 'view', 'works.view', 'Visualizar obras e servicos das lojas acessiveis'),
  ('works', 'manage', 'works.manage', 'Criar e atualizar obras, pagamentos e documentos das lojas acessiveis')
) as permission(module_key, action_key, key, description)
join public.modulos module on module.chave = permission.module_key
join public.acoes action on action.chave = permission.action_key
on conflict (chave) do update set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in ('works.view', 'works.manage')
where profile.chave = 'administrator'
on conflict do nothing;

create sequence public.works_service_code_seq start with 1 increment by 1;

create table public.works_services (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('OBR-' || lpad(nextval('public.works_service_code_seq')::text, 5, '0'))
    check (codigo_negocio ~ '^OBR-[0-9]{5,}$'),
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null,
  category text not null check (length(trim(category)) between 2 and 120),
  description text not null check (length(trim(description)) between 2 and 500),
  provider_name text check (provider_name is null or length(provider_name) <= 200),
  provider_tax_id text check (provider_tax_id is null or length(provider_tax_id) <= 30),
  provider_phone text check (provider_phone is null or length(provider_phone) <= 40),
  budget_amount numeric(16,2) not null default 0 check (budget_amount >= 0),
  contracted_amount numeric(16,2) not null default 0 check (contracted_amount >= 0),
  status text not null default 'budget' check (
    status in ('budget','awaiting_approval','approved','contracted','in_progress','paused','completed','cancelled')
  ),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  planned_start_date date,
  planned_end_date date,
  notes text check (notes is null or length(notes) <= 4000),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date)
);

create table public.works_service_payments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.works_services(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  label text not null check (length(trim(label)) between 1 and 120),
  payment_method text not null check (length(trim(payment_method)) between 1 and 80),
  source_label text check (source_label is null or length(source_label) <= 160),
  due_date date,
  amount numeric(16,2) not null check (amount > 0),
  status text not null default 'planned' check (status in ('planned','paid','overdue','cancelled')),
  paid_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);

create table public.works_service_documents (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.works_services(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  payment_id uuid references public.works_service_payments(id) on delete set null,
  document_type text not null check (document_type in ('invoice','receipt','rpa','other')),
  document_number text check (document_number is null or length(document_number) <= 120),
  document_date date,
  document_amount numeric(16,2) check (document_amount is null or document_amount >= 0),
  original_name text,
  storage_path text unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'pending' check (status in ('pending','verified')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (storage_path is null and original_name is null and mime_type is null and size_bytes is null)
    or
    (storage_path is not null and original_name is not null and mime_type is not null and size_bytes is not null)
  )
);

create table public.finance_store_budgets (
  store_id uuid primary key references public.lojas(id) on delete cascade,
  budget_amount numeric(16,2) not null default 0 check (budget_amount >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  updated_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index works_services_store_status_idx on public.works_services (store_id, status, updated_at desc);
create index works_services_category_idx on public.works_services (category);
create index works_service_payments_service_status_idx on public.works_service_payments (service_id, status, due_date);
create index works_service_payments_store_idx on public.works_service_payments (store_id, due_date);
create index works_service_documents_service_idx on public.works_service_documents (service_id, created_at desc);
create index works_service_documents_store_idx on public.works_service_documents (store_id, document_date);

create trigger works_services_set_updated_at
before update on public.works_services
for each row execute function app.set_updated_at();

create trigger works_service_payments_set_updated_at
before update on public.works_service_payments
for each row execute function app.set_updated_at();

create or replace function private.prepare_work_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.lojas;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can_store('works', 'manage', new.store_id) then
    raise exception 'permission denied';
  end if;
  select * into v_store from public.lojas where id = new.store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  new.store_code_snapshot := v_store.codigo_negocio;
  new.store_name_snapshot := v_store.nome;
  new.store_city_snapshot := v_store.cidade;
  new.store_state_snapshot := v_store.uf;
  new.updated_by := v_actor;
  if tg_op = 'INSERT' then new.created_by := v_actor; end if;
  return new;
end;
$$;

revoke all on function private.prepare_work_service() from public, anon, authenticated, service_role;

create trigger works_services_prepare
before insert or update of store_id on public.works_services
for each row execute function private.prepare_work_service();

create or replace function private.prepare_work_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_actor uuid := app.current_usuario_id();
begin
  select service.store_id into v_store_id
  from public.works_services service
  where service.id = new.service_id;

  if v_store_id is null then raise exception 'work service not found'; end if;
  if not app.can_store('works', 'manage', v_store_id) then raise exception 'permission denied'; end if;

  new.store_id := v_store_id;
  new.updated_by := v_actor;
  if tg_op = 'INSERT' then new.created_by := v_actor; end if;

  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  elsif new.status <> 'paid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_work_payment() from public, anon, authenticated, service_role;

create trigger works_service_payments_prepare
before insert or update of service_id, status on public.works_service_payments
for each row execute function private.prepare_work_payment();

create or replace function private.prepare_work_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_actor uuid := app.current_usuario_id();
begin
  select service.store_id into v_store_id
  from public.works_services service
  where service.id = new.service_id;

  if v_store_id is null then raise exception 'work service not found'; end if;
  if not app.can_store('works', 'manage', v_store_id) then raise exception 'permission denied'; end if;

  if new.payment_id is not null and not exists (
    select 1 from public.works_service_payments payment
    where payment.id = new.payment_id and payment.service_id = new.service_id
  ) then
    raise exception 'payment is outside work service';
  end if;

  new.store_id := v_store_id;
  if tg_op = 'INSERT' then new.created_by := v_actor; end if;
  return new;
end;
$$;

revoke all on function private.prepare_work_document() from public, anon, authenticated, service_role;

create trigger works_service_documents_prepare
before insert or update of service_id, payment_id on public.works_service_documents
for each row execute function private.prepare_work_document();

create or replace function private.audit_works_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_entity_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    app.current_usuario_id(), 'works.' || lower(tg_op), tg_table_name,
    v_entity_id, v_old, v_row, 'database'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_works_change() from public, anon, authenticated, service_role;

create trigger works_services_audit
after insert or update or delete on public.works_services
for each row execute function private.audit_works_change();

create trigger works_service_payments_audit
after insert or update or delete on public.works_service_payments
for each row execute function private.audit_works_change();

create trigger works_service_documents_audit
after insert or update or delete on public.works_service_documents
for each row execute function private.audit_works_change();

create or replace function private.prepare_finance_store_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_store('finance', 'manage', new.store_id) then raise exception 'permission denied'; end if;
  new.updated_by := app.current_usuario_id();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_finance_store_budget() from public, anon, authenticated, service_role;

create trigger finance_store_budgets_prepare
before insert or update on public.finance_store_budgets
for each row execute function private.prepare_finance_store_budget();

alter table public.works_services enable row level security;
alter table public.works_service_payments enable row level security;
alter table public.works_service_documents enable row level security;
alter table public.finance_store_budgets enable row level security;

create policy works_services_read_scoped on public.works_services
for select to authenticated
using ((select app.can('works','view')) and store_id = any((select app.readable_store_ids('works','view'))::uuid[]));
create policy works_services_manage_insert on public.works_services
for insert to authenticated
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_services_manage_update on public.works_services
for update to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]))
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_services_manage_delete on public.works_services
for delete to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));

create policy works_service_payments_read_scoped on public.works_service_payments
for select to authenticated
using ((select app.can('works','view')) and store_id = any((select app.readable_store_ids('works','view'))::uuid[]));
create policy works_service_payments_manage_insert on public.works_service_payments
for insert to authenticated
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_service_payments_manage_update on public.works_service_payments
for update to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]))
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_service_payments_manage_delete on public.works_service_payments
for delete to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));

create policy works_service_documents_read_scoped on public.works_service_documents
for select to authenticated
using ((select app.can('works','view')) and store_id = any((select app.readable_store_ids('works','view'))::uuid[]));
create policy works_service_documents_manage_insert on public.works_service_documents
for insert to authenticated
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_service_documents_manage_update on public.works_service_documents
for update to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]))
with check ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));
create policy works_service_documents_manage_delete on public.works_service_documents
for delete to authenticated
using ((select app.can('works','manage')) and store_id = any((select app.readable_store_ids('works','manage'))::uuid[]));

create policy finance_store_budgets_read_scoped on public.finance_store_budgets
for select to authenticated
using ((select app.can('finance','view')) and store_id = any((select app.readable_store_ids('finance','view'))::uuid[]));
create policy finance_store_budgets_manage_insert on public.finance_store_budgets
for insert to authenticated
with check ((select app.can('finance','manage')) and store_id = any((select app.readable_store_ids('finance','manage'))::uuid[]));
create policy finance_store_budgets_manage_update on public.finance_store_budgets
for update to authenticated
using ((select app.can('finance','manage')) and store_id = any((select app.readable_store_ids('finance','manage'))::uuid[]))
with check ((select app.can('finance','manage')) and store_id = any((select app.readable_store_ids('finance','manage'))::uuid[]));

revoke all on table public.works_services from public, anon, authenticated;
revoke all on table public.works_service_payments from public, anon, authenticated;
revoke all on table public.works_service_documents from public, anon, authenticated;
revoke all on table public.finance_store_budgets from public, anon, authenticated;
grant select, insert, update, delete on table public.works_services to authenticated;
grant select, insert, update, delete on table public.works_service_payments to authenticated;
grant select, insert, update, delete on table public.works_service_documents to authenticated;
grant select, insert, update on table public.finance_store_budgets to authenticated;
grant all on table public.works_services to service_role;
grant all on table public.works_service_payments to service_role;
grant all on table public.works_service_documents to service_role;
grant all on table public.finance_store_budgets to service_role;
grant usage, select on sequence public.works_service_code_seq to authenticated, service_role;

create or replace function app.storage_work_store_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_object_name ~ '^obras/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      then split_part(p_object_name, '/', 2)::uuid
    else null
  end;
$$;

revoke all on function app.storage_work_store_id(text) from public, anon;
grant execute on function app.storage_work_store_id(text) to authenticated, service_role;

create or replace function app.can_read_work_document_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.works_service_documents document
    where document.storage_path = p_object_name
      and document.store_id = app.storage_work_store_id(p_object_name)
      and app.can_store('works', 'view', document.store_id)
  );
$$;

revoke all on function app.can_read_work_document_object(text) from public, anon, authenticated;
grant execute on function app.can_read_work_document_object(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage schema unavailable; works bucket skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'works-documents', 'works-documents', false, 26214400,
    array[
      'application/pdf','image/jpeg','image/png','image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $policy$
    create policy works_documents_objects_read
    on storage.objects for select to authenticated
    using (bucket_id = 'works-documents' and app.can_read_work_document_object(name))
  $policy$;

  execute $policy$
    create policy works_documents_objects_create
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'works-documents'
      and app.can_store('works', 'manage', app.storage_work_store_id(name))
    )
  $policy$;

  execute $policy$
    create policy works_documents_objects_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'works-documents'
      and app.can_store('works', 'manage', app.storage_work_store_id(name))
    )
  $policy$;
end;
$$;

comment on table public.works_services is
  'Servicos de obra por loja, separados do fluxo de itens/compras.';
comment on table public.works_service_payments is
  'Parcelas e pagamentos individuais de um servico de obra.';
comment on table public.works_service_documents is
  'Notas fiscais, recibos, RPA e outros documentos de um servico de obra; arquivo e opcional.';
comment on table public.finance_store_budgets is
  'Verba/teto BB por loja para a Visao Geral do Financeiro.';
