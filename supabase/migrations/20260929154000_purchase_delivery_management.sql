begin;

insert into public.modulos (chave, nome, ativo)
values ('purchase_delivery', 'Gerenciamento compra/entrega', true)
on conflict (chave) do update
set nome = excluded.nome,
    ativo = true,
    updated_at = now();

insert into public.permissoes (modulo_id, acao_id, chave, descricao, ativo)
select m.id, a.id, v.permission_key, v.description, true
from (
  values
    ('view', 'purchase_delivery.view', 'Visualizar Gerenciamento compra/entrega'),
    ('manage', 'purchase_delivery.manage', 'Cadastrar, editar e excluir controles manuais de compra e entrega')
) as v(action_key, permission_key, description)
join public.modulos m on m.chave = 'purchase_delivery'
join public.acoes a on a.chave = v.action_key
on conflict (chave) do update
set descricao = excluded.descricao,
    ativo = true,
    updated_at = now();

insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from public.perfis pf
cross join public.permissoes p
where pf.chave = 'administrator'
  and p.chave in ('purchase_delivery.view', 'purchase_delivery.manage')
on conflict (perfil_id, permissao_id) do nothing;

create table if not exists public.purchase_delivery_destinations (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  keyword text,
  is_video_service boolean not null default false,
  header_tone text not null default 'default',
  position integer not null default 0,
  active boolean not null default true,
  notes text,
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_delivery_destinations_label_check check (length(btrim(label)) between 1 and 160),
  constraint purchase_delivery_destinations_header_tone_check check (header_tone in ('default','video_dark','video_light'))
);

create table if not exists public.purchase_delivery_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purchase_total numeric(14,3) not null default 0,
  acquired_quantity numeric(14,3) not null default 0,
  position integer not null default 0,
  active boolean not null default true,
  notes text,
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_delivery_items_name_check check (length(btrim(name)) between 1 and 180),
  constraint purchase_delivery_items_purchase_total_check check (purchase_total >= 0),
  constraint purchase_delivery_items_acquired_quantity_check check (acquired_quantity >= 0)
);

create table if not exists public.purchase_delivery_cells (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.purchase_delivery_items(id) on delete cascade,
  destination_id uuid not null references public.purchase_delivery_destinations(id) on delete cascade,
  quantity numeric(14,3),
  status text not null default 'none',
  note text,
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_delivery_cells_quantity_check check (quantity is null or quantity >= 0),
  constraint purchase_delivery_cells_status_check check (
    status in ('none','matrix','purchased','green_text','delivered','shipping_note','orange_text','attention','issue','do_not_buy')
  ),
  constraint purchase_delivery_cells_item_destination_unique unique (item_id, destination_id)
);

create index if not exists purchase_delivery_destinations_position_idx
  on public.purchase_delivery_destinations(position, id);
create index if not exists purchase_delivery_items_position_idx
  on public.purchase_delivery_items(position, id);
create index if not exists purchase_delivery_cells_item_idx
  on public.purchase_delivery_cells(item_id);
create index if not exists purchase_delivery_cells_destination_idx
  on public.purchase_delivery_cells(destination_id);
create index if not exists purchase_delivery_cells_status_idx
  on public.purchase_delivery_cells(status);
create index if not exists purchase_delivery_destinations_created_by_idx
  on public.purchase_delivery_destinations(created_by);
create index if not exists purchase_delivery_destinations_updated_by_idx
  on public.purchase_delivery_destinations(updated_by);
create index if not exists purchase_delivery_items_created_by_idx
  on public.purchase_delivery_items(created_by);
create index if not exists purchase_delivery_items_updated_by_idx
  on public.purchase_delivery_items(updated_by);
create index if not exists purchase_delivery_cells_created_by_idx
  on public.purchase_delivery_cells(created_by);
create index if not exists purchase_delivery_cells_updated_by_idx
  on public.purchase_delivery_cells(updated_by);

drop trigger if exists purchase_delivery_destinations_updated_at on public.purchase_delivery_destinations;
create trigger purchase_delivery_destinations_updated_at
before update on public.purchase_delivery_destinations
for each row execute function app.set_updated_at();

drop trigger if exists purchase_delivery_items_updated_at on public.purchase_delivery_items;
create trigger purchase_delivery_items_updated_at
before update on public.purchase_delivery_items
for each row execute function app.set_updated_at();

drop trigger if exists purchase_delivery_cells_updated_at on public.purchase_delivery_cells;
create trigger purchase_delivery_cells_updated_at
before update on public.purchase_delivery_cells
for each row execute function app.set_updated_at();

alter table public.purchase_delivery_destinations enable row level security;
alter table public.purchase_delivery_items enable row level security;
alter table public.purchase_delivery_cells enable row level security;

revoke all on public.purchase_delivery_destinations from anon;
revoke all on public.purchase_delivery_items from anon;
revoke all on public.purchase_delivery_cells from anon;

grant select, insert, update, delete on public.purchase_delivery_destinations to authenticated;
grant select, insert, update, delete on public.purchase_delivery_items to authenticated;
grant select, insert, update, delete on public.purchase_delivery_cells to authenticated;

drop policy if exists purchase_delivery_destinations_read on public.purchase_delivery_destinations;
create policy purchase_delivery_destinations_read
on public.purchase_delivery_destinations
for select
to authenticated
using (app.can('purchase_delivery','view') or app.can('purchase_delivery','manage'));

drop policy if exists purchase_delivery_destinations_insert on public.purchase_delivery_destinations;
create policy purchase_delivery_destinations_insert
on public.purchase_delivery_destinations
for insert
to authenticated
with check (
  app.can('purchase_delivery','manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_destinations_update on public.purchase_delivery_destinations;
create policy purchase_delivery_destinations_update
on public.purchase_delivery_destinations
for update
to authenticated
using (app.can('purchase_delivery','manage'))
with check (
  app.can('purchase_delivery','manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_destinations_delete on public.purchase_delivery_destinations;
create policy purchase_delivery_destinations_delete
on public.purchase_delivery_destinations
for delete
to authenticated
using (app.can('purchase_delivery','manage'));

drop policy if exists purchase_delivery_items_read on public.purchase_delivery_items;
create policy purchase_delivery_items_read
on public.purchase_delivery_items
for select
to authenticated
using (app.can('purchase_delivery','view') or app.can('purchase_delivery','manage'));

drop policy if exists purchase_delivery_items_insert on public.purchase_delivery_items;
create policy purchase_delivery_items_insert
on public.purchase_delivery_items
for insert
to authenticated
with check (
  app.can('purchase_delivery','manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_items_update on public.purchase_delivery_items;
create policy purchase_delivery_items_update
on public.purchase_delivery_items
for update
to authenticated
using (app.can('purchase_delivery','manage'))
with check (
  app.can('purchase_delivery','manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_items_delete on public.purchase_delivery_items;
create policy purchase_delivery_items_delete
on public.purchase_delivery_items
for delete
to authenticated
using (app.can('purchase_delivery','manage'));

drop policy if exists purchase_delivery_cells_read on public.purchase_delivery_cells;
create policy purchase_delivery_cells_read
on public.purchase_delivery_cells
for select
to authenticated
using (app.can('purchase_delivery','view') or app.can('purchase_delivery','manage'));

drop policy if exists purchase_delivery_cells_insert on public.purchase_delivery_cells;
create policy purchase_delivery_cells_insert
on public.purchase_delivery_cells
for insert
to authenticated
with check (
  app.can('purchase_delivery','manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_cells_update on public.purchase_delivery_cells;
create policy purchase_delivery_cells_update
on public.purchase_delivery_cells
for update
to authenticated
using (app.can('purchase_delivery','manage'))
with check (
  app.can('purchase_delivery','manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

drop policy if exists purchase_delivery_cells_delete on public.purchase_delivery_cells;
create policy purchase_delivery_cells_delete
on public.purchase_delivery_cells
for delete
to authenticated
using (app.can('purchase_delivery','manage'));

commit;
