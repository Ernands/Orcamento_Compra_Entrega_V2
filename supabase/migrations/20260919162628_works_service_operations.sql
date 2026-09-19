-- Incrementos aditivos para o cadastro operacional de Obras e Servicos.
-- Mantem os registros existentes e habilita:
-- 1. anexos de orcamento;
-- 2. composicao de "Servicos Diversos de Obra";
-- 3. gravacao transacional do servico e de sua composicao.

alter table public.works_service_documents
  drop constraint if exists works_service_documents_document_type_check;

alter table public.works_service_documents
  add constraint works_service_documents_document_type_check
  check (document_type in ('quote', 'invoice', 'receipt', 'rpa', 'payment_proof', 'other'));

create table public.works_service_components (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.works_services(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  category text not null check (length(trim(category)) between 2 and 120),
  description text check (description is null or length(trim(description)) <= 500),
  amount numeric(16,2) not null check (amount > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, sort_order)
);

create index works_service_components_store_idx
  on public.works_service_components (store_id, service_id);

create trigger works_service_components_set_updated_at
before update on public.works_service_components
for each row execute function app.set_updated_at();

create or replace function private.prepare_work_service_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_service_category text;
  v_actor uuid := app.current_usuario_id();
begin
  select service.store_id, service.category
    into v_store_id, v_service_category
  from public.works_services service
  where service.id = new.service_id;

  if v_store_id is null then
    raise exception 'work service not found';
  end if;
  if v_service_category <> 'Serviços Diversos de Obra' then
    raise exception 'components are only allowed for diverse work services';
  end if;
  if not app.can_store('works', 'manage', v_store_id) then
    raise exception 'permission denied';
  end if;

  new.store_id := v_store_id;
  new.updated_by := v_actor;
  if tg_op = 'INSERT' then
    new.created_by := v_actor;
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_work_service_component()
from public, anon, authenticated, service_role;

create trigger works_service_components_prepare
before insert or update of service_id on public.works_service_components
for each row execute function private.prepare_work_service_component();

create trigger works_service_components_audit
after insert or update or delete on public.works_service_components
for each row execute function private.audit_works_change();

alter table public.works_service_components enable row level security;

create policy works_service_components_read_scoped
on public.works_service_components
for select to authenticated
using (
  (select app.can('works', 'view'))
  and store_id = any((select app.readable_store_ids('works', 'view'))::uuid[])
);

create policy works_service_components_manage_insert
on public.works_service_components
for insert to authenticated
with check (
  (select app.can('works', 'manage'))
  and store_id = any((select app.readable_store_ids('works', 'manage'))::uuid[])
);

create policy works_service_components_manage_update
on public.works_service_components
for update to authenticated
using (
  (select app.can('works', 'manage'))
  and store_id = any((select app.readable_store_ids('works', 'manage'))::uuid[])
)
with check (
  (select app.can('works', 'manage'))
  and store_id = any((select app.readable_store_ids('works', 'manage'))::uuid[])
);

create policy works_service_components_manage_delete
on public.works_service_components
for delete to authenticated
using (
  (select app.can('works', 'manage'))
  and store_id = any((select app.readable_store_ids('works', 'manage'))::uuid[])
);

revoke all on table public.works_service_components from public, anon, authenticated;
grant select, insert, update, delete on table public.works_service_components to authenticated;
grant all on table public.works_service_components to service_role;

create or replace function public.save_work_service_v2(
  p_service_id uuid,
  p_store_id uuid,
  p_category text,
  p_description text,
  p_provider_name text,
  p_provider_tax_id text,
  p_provider_phone text,
  p_contracted_amount numeric,
  p_budget_amount numeric,
  p_status text,
  p_progress_percent integer,
  p_planned_start_date date,
  p_planned_end_date date,
  p_notes text,
  p_components jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_service_id uuid;
  v_component jsonb;
  v_component_count integer;
  v_component_amount numeric(16,2);
  v_contracted_amount numeric(16,2) := coalesce(p_contracted_amount, 0);
  v_sort_order integer := 0;
begin
  if jsonb_typeof(coalesce(p_components, '[]'::jsonb)) <> 'array' then
    raise exception 'components must be an array';
  end if;

  v_component_count := jsonb_array_length(coalesce(p_components, '[]'::jsonb));
  if v_component_count > 50 then
    raise exception 'a service supports at most 50 components';
  end if;
  if p_category <> 'Serviços Diversos de Obra' and v_component_count > 0 then
    raise exception 'components are only allowed for diverse work services';
  end if;

  if v_component_count > 0 then
    v_contracted_amount := 0;
    for v_component in
      select value from jsonb_array_elements(p_components)
    loop
      if length(trim(coalesce(v_component->>'category', ''))) < 2 then
        raise exception 'component category is required';
      end if;
      begin
        v_component_amount := nullif(trim(v_component->>'amount'), '')::numeric;
      exception when others then
        raise exception 'invalid component amount';
      end;
      if v_component_amount is null or v_component_amount <= 0 then
        raise exception 'component amount must be greater than zero';
      end if;
      v_contracted_amount := v_contracted_amount + v_component_amount;
    end loop;
  end if;

  if p_service_id is null then
    insert into public.works_services (
      store_id, store_code_snapshot, store_name_snapshot, store_city_snapshot,
      store_state_snapshot, category, description, provider_name, provider_tax_id,
      provider_phone, contracted_amount, budget_amount, status, progress_percent,
      planned_start_date, planned_end_date, notes
    ) values (
      p_store_id, '-', '-', '-', '-', trim(p_category), trim(p_description),
      nullif(trim(coalesce(p_provider_name, '')), ''),
      nullif(trim(coalesce(p_provider_tax_id, '')), ''),
      nullif(trim(coalesce(p_provider_phone, '')), ''),
      v_contracted_amount, coalesce(p_budget_amount, 0), p_status,
      p_progress_percent, p_planned_start_date, p_planned_end_date,
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning id into v_service_id;
  else
    update public.works_services
    set store_id = p_store_id,
        category = trim(p_category),
        description = trim(p_description),
        provider_name = nullif(trim(coalesce(p_provider_name, '')), ''),
        provider_tax_id = nullif(trim(coalesce(p_provider_tax_id, '')), ''),
        provider_phone = nullif(trim(coalesce(p_provider_phone, '')), ''),
        contracted_amount = v_contracted_amount,
        budget_amount = coalesce(p_budget_amount, 0),
        status = p_status,
        progress_percent = p_progress_percent,
        planned_start_date = p_planned_start_date,
        planned_end_date = p_planned_end_date,
        notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = p_service_id
    returning id into v_service_id;

    if v_service_id is null then
      raise exception 'work service not found or permission denied';
    end if;
  end if;

  delete from public.works_service_components
  where service_id = v_service_id;

  for v_component in
    select value from jsonb_array_elements(coalesce(p_components, '[]'::jsonb))
  loop
    insert into public.works_service_components (
      service_id, store_id, category, description, amount, sort_order
    ) values (
      v_service_id,
      p_store_id,
      trim(v_component->>'category'),
      nullif(trim(coalesce(v_component->>'description', '')), ''),
      (v_component->>'amount')::numeric,
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  return v_service_id;
end;
$$;

revoke all on function public.save_work_service_v2(
  uuid, uuid, text, text, text, text, text, numeric, numeric, text,
  integer, date, date, text, jsonb
) from public, anon;

grant execute on function public.save_work_service_v2(
  uuid, uuid, text, text, text, text, text, numeric, numeric, text,
  integer, date, date, text, jsonb
) to authenticated, service_role;

comment on table public.works_service_components is
  'Discriminacao opcional de categorias e valores dentro de um Servico Diverso de Obra.';

comment on constraint works_service_documents_document_type_check
on public.works_service_documents is
  'Permite anexar orcamentos, documentos fiscais, RPA e outros arquivos ao servico.';

comment on function public.save_work_service_v2(
  uuid, uuid, text, text, text, text, text, numeric, numeric, text,
  integer, date, date, text, jsonb
) is
  'Cria ou atualiza um servico e sua composicao detalhada na mesma transacao.';
