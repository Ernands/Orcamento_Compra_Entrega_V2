create type public.checklist_version_status as enum ('draft', 'published', 'archived');
create type public.implementation_status as enum ('not_started', 'in_progress', 'completed', 'cancelled');
create type public.implementation_item_status as enum ('pending', 'in_progress', 'completed', 'blocked', 'not_applicable');
create type public.need_priority as enum ('low', 'normal', 'high', 'critical');
create type public.need_status as enum ('identified', 'under_review', 'resolved', 'cancelled');
create type public.need_origin as enum ('manual', 'implementation');

create sequence public.checklist_master_version_seq start with 1 increment by 1;

create table public.checklist_master_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null unique default nextval('public.checklist_master_version_seq'),
  name text not null check (length(trim(name)) between 2 and 120),
  status public.checklist_version_status not null default 'draft',
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.usuarios(id) on delete set null,
  published_by uuid references public.usuarios(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and published_at is null and published_by is null)
    or (status in ('published', 'archived') and published_at is not null)
  )
);

create table public.checklist_master_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.checklist_master_versions(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  description text check (description is null or length(description) <= 3000),
  category text not null check (length(trim(category)) between 2 and 100),
  position integer not null check (position >= 0),
  is_required boolean not null default true,
  is_active boolean not null default true,
  relative_due_days integer check (relative_due_days is null or relative_due_days between 0 and 3650),
  guidance text check (guidance is null or length(guidance) <= 3000),
  responsibility_type text check (
    responsibility_type is null or length(trim(responsibility_type)) between 2 and 80
  ),
  evidence_required boolean not null default false,
  priority public.need_priority not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_implementations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.lojas(id) on delete restrict,
  checklist_version_id uuid not null references public.checklist_master_versions(id) on delete restrict,
  status public.implementation_status not null default 'in_progress',
  coordinator_usuario_id uuid references public.usuarios(id) on delete set null,
  base_date date not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'not_started' and started_at is null and completed_at is null)
    or (status = 'in_progress' and started_at is not null and completed_at is null)
    or (status = 'completed' and started_at is not null and completed_at is not null)
    or (status = 'cancelled' and completed_at is null)
  )
);

create unique index store_implementations_one_active_idx
on public.store_implementations(store_id)
where status in ('not_started', 'in_progress');

create table public.store_implementation_items (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.store_implementations(id) on delete cascade,
  master_item_id uuid references public.checklist_master_items(id) on delete restrict,
  title_snapshot text not null check (length(trim(title_snapshot)) between 2 and 200),
  description_snapshot text,
  category_snapshot text not null check (length(trim(category_snapshot)) between 2 and 100),
  guidance_snapshot text,
  responsibility_type_snapshot text,
  evidence_required_snapshot boolean not null default false,
  priority_snapshot public.need_priority not null default 'normal',
  position integer not null check (position >= 0),
  is_required boolean not null default true,
  status public.implementation_item_status not null default 'pending',
  responsible_usuario_id uuid references public.usuarios(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  notes text check (notes is null or length(notes) <= 3000),
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (implementation_id, master_item_id),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.store_needs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.lojas(id) on delete restrict,
  title text not null check (length(trim(title)) between 2 and 200),
  description text check (description is null or length(description) <= 3000),
  category text not null check (length(trim(category)) between 2 and 100),
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text check (unit is null or length(trim(unit)) between 1 and 40),
  priority public.need_priority not null default 'normal',
  status public.need_status not null default 'identified',
  notes text check (notes is null or length(notes) <= 3000),
  origin public.need_origin not null default 'manual',
  source_implementation_item_id uuid references public.store_implementation_items(id) on delete set null,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin = 'manual' or source_implementation_item_id is not null)
);

create table public.store_attachments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.lojas(id) on delete restrict,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  storage_path text not null unique check (storage_path ~ '^lojas/[0-9a-f-]{36}/'),
  category text not null check (
    category in ('project', 'construction', 'document', 'photo', 'contract', 'quote', 'receipt', 'other')
  ),
  description text check (description is null or length(description) <= 1000),
  mime_type text not null check (length(trim(mime_type)) between 3 and 150),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references public.usuarios(id) on delete set null,
  deleted_at timestamptz
);

create index checklist_master_items_version_position_idx
on public.checklist_master_items(version_id, position, created_at);
create index checklist_master_versions_status_idx
on public.checklist_master_versions(status, version_number desc);
create index store_implementations_store_created_idx
on public.store_implementations(store_id, created_at desc);
create index store_implementations_version_idx
on public.store_implementations(checklist_version_id);
create index store_implementations_coordinator_idx
on public.store_implementations(coordinator_usuario_id) where coordinator_usuario_id is not null;
create index store_implementation_items_implementation_status_idx
on public.store_implementation_items(implementation_id, status, position);
create index store_implementation_items_responsible_idx
on public.store_implementation_items(responsible_usuario_id) where responsible_usuario_id is not null;
create index store_implementation_items_due_idx
on public.store_implementation_items(due_date) where due_date is not null;
create index store_needs_store_status_idx
on public.store_needs(store_id, status, priority);
create index store_needs_source_idx
on public.store_needs(source_implementation_item_id) where source_implementation_item_id is not null;
create index store_attachments_store_created_idx
on public.store_attachments(store_id, created_at desc) where deleted_at is null;

create trigger checklist_master_versions_set_updated_at before update on public.checklist_master_versions
for each row execute function app.set_updated_at();
create trigger checklist_master_items_set_updated_at before update on public.checklist_master_items
for each row execute function app.set_updated_at();
create trigger store_implementations_set_updated_at before update on public.store_implementations
for each row execute function app.set_updated_at();
create trigger store_implementation_items_set_updated_at before update on public.store_implementation_items
for each row execute function app.set_updated_at();
create trigger store_needs_set_updated_at before update on public.store_needs
for each row execute function app.set_updated_at();

alter table public.lojas
add constraint lojas_uf_brazil_check check (
  uf in ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
         'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')
);

alter table public.checklist_master_versions enable row level security;
alter table public.checklist_master_items enable row level security;
alter table public.store_implementations enable row level security;
alter table public.store_implementation_items enable row level security;
alter table public.store_needs enable row level security;
alter table public.store_attachments enable row level security;

create or replace function private.protect_checklist_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    if not (old.status = 'published' and new.status = 'archived')
      or new.name is distinct from old.name
      or new.notes is distinct from old.notes
      or new.version_number is distinct from old.version_number
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'published checklist versions are immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger checklist_master_versions_protect_published
before update on public.checklist_master_versions
for each row execute function private.protect_checklist_version();

create or replace function private.protect_checklist_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_version_id uuid := coalesce(new.version_id, old.version_id);
begin
  if exists (
    select 1
    from public.checklist_master_versions version
    where version.id = v_version_id
      and version.status <> 'draft'
  ) then
    raise exception 'items from published checklist versions are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger checklist_master_items_protect_published
before update or delete on public.checklist_master_items
for each row execute function private.protect_checklist_item();

revoke all on function private.protect_checklist_version() from public, anon, authenticated;
revoke all on function private.protect_checklist_item() from public, anon, authenticated;
