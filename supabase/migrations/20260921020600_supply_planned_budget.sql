begin;

insert into public.modulos (chave, nome, ativo)
values ('planned_budget', 'Orcamento Previsto', true)
on conflict (chave) do update
set nome = excluded.nome,
    ativo = true,
    updated_at = now();

insert into public.permissoes (modulo_id, acao_id, chave, descricao, ativo)
select m.id, a.id, v.permission_key, v.description, true
from (
  values
    ('view', 'planned_budget.view', 'Visualizar Orcamento Previsto'),
    ('manage', 'planned_budget.manage', 'Cadastrar, editar, ativar, inativar e excluir itens do Orcamento Previsto')
) as v(action_key, permission_key, description)
join public.modulos m on m.chave = 'planned_budget'
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
  and p.chave in ('planned_budget.view','planned_budget.manage')
on conflict (perfil_id, permissao_id) do nothing;

create table if not exists public.supply_budget_segments (
  id uuid primary key default gen_random_uuid(),
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  notes text,
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_budget_segments_name_check check (length(btrim(name)) between 1 and 120),
  constraint supply_budget_segments_id_item_unique unique (id, supply_item_id)
);

create table if not exists public.supply_budget_segment_stores (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.supply_budget_segments(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  quantity numeric(14,3) not null,
  created_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  constraint supply_budget_segment_stores_quantity_check check (quantity > 0),
  constraint supply_budget_segment_stores_unique unique (segment_id, store_id)
);

create table if not exists public.supply_budget_items (
  id uuid primary key default gen_random_uuid(),
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  segment_id uuid not null unique,
  unit_price numeric(14,2) not null,
  active boolean not null default true,
  notes text,
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_budget_items_unit_price_check check (unit_price >= 0),
  constraint supply_budget_items_segment_item_fk
    foreign key (segment_id, supply_item_id)
    references public.supply_budget_segments(id, supply_item_id)
    on delete restrict
);

create index if not exists supply_budget_segments_item_idx
  on public.supply_budget_segments(supply_item_id);
create index if not exists supply_budget_segments_active_idx
  on public.supply_budget_segments(active);
create index if not exists supply_budget_segment_stores_store_idx
  on public.supply_budget_segment_stores(store_id);
create index if not exists supply_budget_items_item_idx
  on public.supply_budget_items(supply_item_id);
create index if not exists supply_budget_items_active_idx
  on public.supply_budget_items(active);

drop trigger if exists supply_budget_segments_updated_at on public.supply_budget_segments;
create trigger supply_budget_segments_updated_at
before update on public.supply_budget_segments
for each row execute function app.set_updated_at();

drop trigger if exists supply_budget_items_updated_at on public.supply_budget_items;
create trigger supply_budget_items_updated_at
before update on public.supply_budget_items
for each row execute function app.set_updated_at();

alter table public.supply_budget_segments enable row level security;
alter table public.supply_budget_segment_stores enable row level security;
alter table public.supply_budget_items enable row level security;

revoke all on public.supply_budget_segments from anon;
revoke all on public.supply_budget_segment_stores from anon;
revoke all on public.supply_budget_items from anon;

grant select, insert, update, delete on public.supply_budget_segments to authenticated;
grant select, insert, update, delete on public.supply_budget_segment_stores to authenticated;
grant select, insert, update, delete on public.supply_budget_items to authenticated;

drop policy if exists supply_budget_segments_read on public.supply_budget_segments;
create policy supply_budget_segments_read
on public.supply_budget_segments
for select
to authenticated
using (
  app.can('planned_budget','view')
  or app.can('finance','overview_view')
  or app.can('finance','store_detail_view')
);

drop policy if exists supply_budget_segments_insert on public.supply_budget_segments;
create policy supply_budget_segments_insert
on public.supply_budget_segments
for insert
to authenticated
with check (
  app.can('planned_budget','manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists supply_budget_segments_update on public.supply_budget_segments;
create policy supply_budget_segments_update
on public.supply_budget_segments
for update
to authenticated
using (app.can('planned_budget','manage'))
with check (
  app.can('planned_budget','manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

drop policy if exists supply_budget_segments_delete on public.supply_budget_segments;
create policy supply_budget_segments_delete
on public.supply_budget_segments
for delete
to authenticated
using (app.can('planned_budget','manage'));

drop policy if exists supply_budget_segment_stores_read on public.supply_budget_segment_stores;
create policy supply_budget_segment_stores_read
on public.supply_budget_segment_stores
for select
to authenticated
using (
  app.can_store('planned_budget','view',store_id)
  or app.can_store('finance','overview_view',store_id)
  or app.can_store('finance','store_detail_view',store_id)
);

drop policy if exists supply_budget_segment_stores_insert on public.supply_budget_segment_stores;
create policy supply_budget_segment_stores_insert
on public.supply_budget_segment_stores
for insert
to authenticated
with check (
  app.can_store('planned_budget','manage',store_id)
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists supply_budget_segment_stores_update on public.supply_budget_segment_stores;
create policy supply_budget_segment_stores_update
on public.supply_budget_segment_stores
for update
to authenticated
using (app.can_store('planned_budget','manage',store_id))
with check (app.can_store('planned_budget','manage',store_id));

drop policy if exists supply_budget_segment_stores_delete on public.supply_budget_segment_stores;
create policy supply_budget_segment_stores_delete
on public.supply_budget_segment_stores
for delete
to authenticated
using (app.can_store('planned_budget','manage',store_id));

drop policy if exists supply_budget_items_read on public.supply_budget_items;
create policy supply_budget_items_read
on public.supply_budget_items
for select
to authenticated
using (
  app.can('planned_budget','view')
  or app.can('finance','overview_view')
  or app.can('finance','store_detail_view')
);

drop policy if exists supply_budget_items_insert on public.supply_budget_items;
create policy supply_budget_items_insert
on public.supply_budget_items
for insert
to authenticated
with check (
  app.can('planned_budget','manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

drop policy if exists supply_budget_items_update on public.supply_budget_items;
create policy supply_budget_items_update
on public.supply_budget_items
for update
to authenticated
using (app.can('planned_budget','manage'))
with check (
  app.can('planned_budget','manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

drop policy if exists supply_budget_items_delete on public.supply_budget_items;
create policy supply_budget_items_delete
on public.supply_budget_items
for delete
to authenticated
using (app.can('planned_budget','manage'));

drop policy if exists supply_items_read_capability on public.supply_items;
create policy supply_items_read_capability
on public.supply_items
for select
to authenticated
using (
  app.can('items','view')
  or app.can('planned_budget','view')
  or app.can('planned_budget','manage')
  or app.can('finance','overview_view')
  or app.can('finance','store_detail_view')
);

drop policy if exists stores_read_scoped on public.lojas;
create policy stores_read_scoped
on public.lojas
for select
to authenticated
using (
  app.can_store('stores','view',id)
  or app.can_store('works','view',id)
  or app.can_store('planned_budget','view',id)
  or app.can_store('planned_budget','manage',id)
  or app.can_store('finance','overview_view',id)
  or app.can_store('finance','store_detail_view',id)
  or app.can_store('finance','payments_view',id)
  or app.can_store('finance','stores_ufs_view',id)
  or app.can_store('finance','reimbursements_view',id)
);

create or replace function public.save_supply_budget_segment(
  p_segment_id uuid,
  p_supply_item_id uuid,
  p_name text,
  p_active boolean,
  p_notes text,
  p_stores jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_segment_id uuid;
  v_user_id uuid := app.current_usuario_id();
  v_count integer;
  v_distinct_count integer;
begin
  if not app.can('planned_budget','manage') then
    raise exception 'insufficient capability';
  end if;

  if p_supply_item_id is null or not exists (
    select 1 from public.supply_items i where i.id = p_supply_item_id and i.active
  ) then
    raise exception 'invalid or inactive supply item';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'invalid segment name';
  end if;

  if p_stores is null or jsonb_typeof(p_stores) <> 'array' then
    raise exception 'invalid stores';
  end if;

  select count(*), count(distinct entry->>'storeId')
  into v_count, v_distinct_count
  from jsonb_array_elements(p_stores) entry;

  if v_count = 0 or v_count <> v_distinct_count then
    raise exception 'segment must contain unique stores';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stores) entry
    where coalesce(entry->>'storeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(entry->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
       or (entry->>'quantity')::numeric <= 0
  ) then
    raise exception 'invalid store quantity';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stores) entry
    where not app.can_store('planned_budget','manage',(entry->>'storeId')::uuid)
  ) then
    raise exception 'store outside permission scope';
  end if;

  if p_segment_id is null then
    insert into public.supply_budget_segments (
      supply_item_id,name,active,notes,created_by,updated_by
    ) values (
      p_supply_item_id,btrim(p_name),coalesce(p_active,true),nullif(btrim(coalesce(p_notes,'')),''),
      v_user_id,v_user_id
    )
    returning id into v_segment_id;
  else
    if exists (
      select 1
      from public.supply_budget_items bi
      where bi.segment_id = p_segment_id
        and bi.supply_item_id <> p_supply_item_id
    ) then
      raise exception 'cannot change item of a priced segment';
    end if;

    update public.supply_budget_segments
    set supply_item_id = p_supply_item_id,
        name = btrim(p_name),
        active = coalesce(p_active,true),
        notes = nullif(btrim(coalesce(p_notes,'')),''),
        updated_by = v_user_id
    where id = p_segment_id
    returning id into v_segment_id;

    if v_segment_id is null then
      raise exception 'segment not found';
    end if;

    delete from public.supply_budget_segment_stores where segment_id = v_segment_id;
  end if;

  insert into public.supply_budget_segment_stores (
    segment_id,store_id,quantity,created_by
  )
  select
    v_segment_id,
    (entry->>'storeId')::uuid,
    (entry->>'quantity')::numeric,
    v_user_id
  from jsonb_array_elements(p_stores) entry;

  return v_segment_id;
end;
$function$;

revoke all on function public.save_supply_budget_segment(uuid,uuid,text,boolean,text,jsonb) from public;
revoke all on function public.save_supply_budget_segment(uuid,uuid,text,boolean,text,jsonb) from anon;
grant execute on function public.save_supply_budget_segment(uuid,uuid,text,boolean,text,jsonb) to authenticated;

commit;
