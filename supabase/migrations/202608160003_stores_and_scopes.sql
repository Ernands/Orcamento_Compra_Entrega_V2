create type public.store_status as enum ('planning', 'active', 'inactive');
create sequence public.loja_codigo_seq start with 1 increment by 1;

create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique default ('LOJ-' || lpad(nextval('public.loja_codigo_seq')::text, 3, '0'))
    check (codigo_negocio ~ '^LOJ-[0-9]{3,}$'),
  codigo_legado text unique,
  nome text not null check (length(trim(nome)) between 2 and 160),
  cidade text not null check (length(trim(cidade)) between 2 and 120),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  endereco text,
  responsavel_usuario_id uuid references public.usuarios(id) on delete set null,
  status public.store_status not null default 'planning',
  data_inauguracao_planejada date,
  data_inauguracao_real date,
  observacoes text,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_inauguracao_real is null or data_inauguracao_planejada is null or data_inauguracao_real >= data_inauguracao_planejada - 365)
);

create table public.usuario_lojas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (usuario_id, loja_id)
);

create table public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  permissao_id uuid not null references public.permissoes(id) on delete cascade,
  loja_id uuid references public.lojas(id) on delete cascade,
  efeito public.permission_effect not null,
  expires_at timestamptz,
  motivo text check (motivo is null or length(trim(motivo)) between 3 and 500),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (usuario_id, permissao_id, loja_id)
);

create index lojas_uf_idx on public.lojas(uf);
create index lojas_status_idx on public.lojas(status);
create index lojas_responsavel_idx on public.lojas(responsavel_usuario_id);
create index lojas_inauguracao_idx on public.lojas(data_inauguracao_planejada);
create index usuario_lojas_usuario_idx on public.usuario_lojas(usuario_id);
create index usuario_lojas_loja_idx on public.usuario_lojas(loja_id);
create index usuario_permissoes_usuario_idx on public.usuario_permissoes(usuario_id);
create index usuario_permissoes_permissao_idx on public.usuario_permissoes(permissao_id);
create index usuario_permissoes_loja_idx on public.usuario_permissoes(loja_id) where loja_id is not null;

create trigger lojas_set_updated_at before update on public.lojas
for each row execute function app.set_updated_at();

alter table public.lojas enable row level security;
alter table public.usuario_lojas enable row level security;
alter table public.usuario_permissoes enable row level security;
