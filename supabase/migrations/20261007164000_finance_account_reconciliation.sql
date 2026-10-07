begin;

insert into public.acoes (chave, nome)
values
  ('account_reconciliation_view', 'Visualizar conciliação da conta'),
  ('account_reconciliation_manage', 'Gerenciar conciliação da conta')
on conflict (chave) do update
set nome = excluded.nome,
    updated_at = now();

insert into public.permissoes (modulo_id, acao_id, chave, descricao, ativo)
select m.id, a.id, v.permission_key, v.description, true
from (
  values
    ('finance', 'account_reconciliation_view', 'finance.account_reconciliation_view', 'Visualizar a Conciliação Conta do Financeiro'),
    ('finance', 'account_reconciliation_manage', 'finance.account_reconciliation_manage', 'Cadastrar e ajustar dados da Conciliação Conta')
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
  where p.chave = 'finance.payments_view'
),
target as (
  select id from public.permissoes where chave = 'finance.account_reconciliation_view'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, target.id
from source_profiles cross join target
on conflict (perfil_id, permissao_id) do nothing;

with source_profiles as (
  select pp.perfil_id
  from public.perfil_permissoes pp
  join public.permissoes p on p.id = pp.permissao_id
  where p.chave = 'finance.manage'
),
target as (
  select id from public.permissoes where chave = 'finance.account_reconciliation_manage'
)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select source_profiles.perfil_id, target.id
from source_profiles cross join target
on conflict (perfil_id, permissao_id) do nothing;

with source_grants as (
  select up.usuario_id, up.expires_at, up.created_by
  from public.usuario_permissoes up
  join public.permissoes p on p.id = up.permissao_id
  where p.chave = 'finance.payments_view'
    and up.loja_id is null
    and up.efeito = 'grant'
),
target as (
  select id from public.permissoes where chave = 'finance.account_reconciliation_view'
)
insert into public.usuario_permissoes
  (usuario_id, permissao_id, loja_id, efeito, expires_at, created_by)
select source_grants.usuario_id, target.id, null, 'grant', source_grants.expires_at, source_grants.created_by
from source_grants cross join target
on conflict (usuario_id, permissao_id, loja_id) do nothing;

with source_grants as (
  select up.usuario_id, up.expires_at, up.created_by
  from public.usuario_permissoes up
  join public.permissoes p on p.id = up.permissao_id
  where p.chave = 'finance.manage'
    and up.loja_id is null
    and up.efeito = 'grant'
),
target as (
  select id from public.permissoes where chave = 'finance.account_reconciliation_manage'
)
insert into public.usuario_permissoes
  (usuario_id, permissao_id, loja_id, efeito, expires_at, created_by)
select source_grants.usuario_id, target.id, null, 'grant', source_grants.expires_at, source_grants.created_by
from source_grants cross join target
on conflict (usuario_id, permissao_id, loja_id) do nothing;

create table public.finance_account_days (
  id uuid primary key default gen_random_uuid(),
  reconciliation_date date not null unique,
  bank_payments_amount numeric(16,2) null check (bank_payments_amount >= 0),
  bank_balance numeric(16,2) null,
  notes text null,
  created_by uuid null references public.usuarios(id) on delete set null default app.current_usuario_id(),
  updated_by uuid null references public.usuarios(id) on delete set null default app.current_usuario_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_account_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  entry_type text not null check (entry_type in ('investment','adjustment_credit','adjustment_debit')),
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 2 and 500),
  notes text null,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid null references public.usuarios(id) on delete set null default app.current_usuario_id(),
  updated_by uuid null references public.usuarios(id) on delete set null default app.current_usuario_id(),
  cancelled_by uuid null references public.usuarios(id) on delete set null,
  cancelled_at timestamptz null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and cancelled_at is null)
    or
    (status = 'cancelled' and cancelled_at is not null and length(btrim(coalesce(cancellation_reason,''))) >= 2)
  )
);

create table public.finance_account_entry_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.finance_account_entries(id) on delete cascade,
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_by uuid null references public.usuarios(id) on delete set null default app.current_usuario_id(),
  created_at timestamptz not null default now()
);

create index finance_account_days_date_idx
  on public.finance_account_days(reconciliation_date desc);
create index finance_account_entries_date_idx
  on public.finance_account_entries(entry_date desc, entry_type);
create index finance_account_entries_active_idx
  on public.finance_account_entries(entry_date desc)
  where status = 'active';
create index finance_account_entry_attachments_entry_idx
  on public.finance_account_entry_attachments(entry_id);

drop trigger if exists finance_account_days_updated_at on public.finance_account_days;
create trigger finance_account_days_updated_at
before update on public.finance_account_days
for each row execute function app.set_updated_at();

drop trigger if exists finance_account_entries_updated_at on public.finance_account_entries;
create trigger finance_account_entries_updated_at
before update on public.finance_account_entries
for each row execute function app.set_updated_at();

alter table public.finance_account_days enable row level security;
alter table public.finance_account_entries enable row level security;
alter table public.finance_account_entry_attachments enable row level security;

revoke all on public.finance_account_days from anon, authenticated;
revoke all on public.finance_account_entries from anon, authenticated;
revoke all on public.finance_account_entry_attachments from anon, authenticated;

grant select, insert, update on public.finance_account_days to authenticated;
grant select, insert, update on public.finance_account_entries to authenticated;
grant select, insert, delete on public.finance_account_entry_attachments to authenticated;

create policy finance_account_days_read
on public.finance_account_days
for select
to authenticated
using (
  app.can('finance','account_reconciliation_view')
  and app.can('finance','payments_view')
);

create policy finance_account_days_insert
on public.finance_account_days
for insert
to authenticated
with check (
  app.can('finance','account_reconciliation_manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy finance_account_days_update
on public.finance_account_days
for update
to authenticated
using (app.can('finance','account_reconciliation_manage'))
with check (
  app.can('finance','account_reconciliation_manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy finance_account_entries_read
on public.finance_account_entries
for select
to authenticated
using (
  app.can('finance','account_reconciliation_view')
  and app.can('finance','payments_view')
);

create policy finance_account_entries_insert
on public.finance_account_entries
for insert
to authenticated
with check (
  app.can('finance','account_reconciliation_manage')
  and status = 'active'
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy finance_account_entries_update
on public.finance_account_entries
for update
to authenticated
using (app.can('finance','account_reconciliation_manage'))
with check (
  app.can('finance','account_reconciliation_manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy finance_account_entry_attachments_read
on public.finance_account_entry_attachments
for select
to authenticated
using (
  app.can('finance','account_reconciliation_view')
  and app.can('finance','payments_view')
);

create policy finance_account_entry_attachments_insert
on public.finance_account_entry_attachments
for insert
to authenticated
with check (
  app.can('finance','account_reconciliation_manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy finance_account_entry_attachments_delete
on public.finance_account_entry_attachments
for delete
to authenticated
using (app.can('finance','account_reconciliation_manage'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-reconciliation',
  'finance-reconciliation',
  false,
  26214400,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists finance_reconciliation_objects_read on storage.objects;
create policy finance_reconciliation_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'finance-reconciliation'
  and app.can('finance','account_reconciliation_view')
  and app.can('finance','payments_view')
);

drop policy if exists finance_reconciliation_objects_insert on storage.objects;
create policy finance_reconciliation_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'finance-reconciliation'
  and app.can('finance','account_reconciliation_manage')
);

drop policy if exists finance_reconciliation_objects_delete on storage.objects;
create policy finance_reconciliation_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'finance-reconciliation'
  and app.can('finance','account_reconciliation_manage')
);

commit;
