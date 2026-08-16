create type public.user_status as enum ('active', 'inactive', 'blocked');
create type public.permission_effect as enum ('grant', 'deny');

create sequence public.usuario_codigo_seq start with 1 increment by 1;

create table public.modulos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[a-z][a-z0-9_]*$'),
  nome text not null check (length(trim(nome)) between 2 and 80),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[a-z][a-z0-9_]*$'),
  nome text not null check (length(trim(nome)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissoes (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.modulos(id) on delete restrict,
  acao_id uuid not null references public.acoes(id) on delete restrict,
  chave text not null unique check (chave ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modulo_id, acao_id)
);

create table public.perfis (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[a-z][a-z0-9_]*$'),
  nome text not null unique check (length(trim(nome)) between 2 and 80),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.perfil_permissoes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  permissao_id uuid not null references public.permissoes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (perfil_id, permissao_id)
);

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique default ('USR-' || lpad(nextval('public.usuario_codigo_seq')::text, 4, '0'))
    check (codigo_negocio ~ '^USR-[0-9]{4,}$'),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  perfil_id uuid not null references public.perfis(id) on delete restrict,
  nome text not null check (length(trim(nome)) between 2 and 160),
  cpf_last4 text not null check (cpf_last4 ~ '^[0-9]{4}$'),
  status public.user_status not null default 'active',
  must_change_password boolean not null default true,
  all_stores boolean not null default false,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.auth_identities (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  cpf_lookup text not null unique check (cpf_lookup ~ '^[0-9a-f]{64}$'),
  technical_email text not null unique check (technical_email = lower(technical_email)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_usuario_id uuid references public.usuarios(id) on delete set null,
  action text not null check (length(action) between 3 and 120),
  entity_type text not null check (length(entity_type) between 2 and 80),
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid(),
  origin text not null check (origin in ('edge', 'database', 'bootstrap', 'migration')),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);

create index permissoes_modulo_id_idx on public.permissoes(modulo_id);
create index permissoes_acao_id_idx on public.permissoes(acao_id);
create index perfil_permissoes_perfil_id_idx on public.perfil_permissoes(perfil_id);
create index perfil_permissoes_permissao_id_idx on public.perfil_permissoes(permissao_id);
create index usuarios_perfil_id_idx on public.usuarios(perfil_id);
create index usuarios_status_idx on public.usuarios(status);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_usuario_id, occurred_at desc);
create index audit_logs_correlation_idx on public.audit_logs(correlation_id);

create trigger modulos_set_updated_at before update on public.modulos
for each row execute function app.set_updated_at();
create trigger acoes_set_updated_at before update on public.acoes
for each row execute function app.set_updated_at();
create trigger permissoes_set_updated_at before update on public.permissoes
for each row execute function app.set_updated_at();
create trigger perfis_set_updated_at before update on public.perfis
for each row execute function app.set_updated_at();
create trigger usuarios_set_updated_at before update on public.usuarios
for each row execute function app.set_updated_at();
create trigger auth_identities_set_updated_at before update on private.auth_identities
for each row execute function app.set_updated_at();

alter table public.modulos enable row level security;
alter table public.acoes enable row level security;
alter table public.permissoes enable row level security;
alter table public.perfis enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios enable row level security;
alter table public.audit_logs enable row level security;
