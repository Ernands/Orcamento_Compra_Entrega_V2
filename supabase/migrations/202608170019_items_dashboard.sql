alter table public.supply_items
add column group_name text,
add column area_name text,
add column default_quantity numeric(14, 3),
add column product_link text;

alter table public.supply_items
add constraint supply_items_group_name_check check (
  group_name is null or length(trim(group_name)) between 2 and 100
),
add constraint supply_items_area_name_check check (
  area_name is null or length(trim(area_name)) between 2 and 100
),
add constraint supply_items_default_quantity_check check (
  default_quantity is null or default_quantity > 0
),
add constraint supply_items_product_link_check check (
  product_link is null or product_link ~* '^https?://'
);

create index supply_items_group_area_active_idx
on public.supply_items(group_name, area_name, active, name);

create or replace function private.protect_supply_item_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.codigo_negocio is distinct from old.codigo_negocio
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'supply item identity is immutable';
  end if;

  return new;
end;
$$;

create trigger supply_items_protect_identity
before update on public.supply_items
for each row execute function private.protect_supply_item_identity();

revoke all on function private.protect_supply_item_identity()
from public, anon, authenticated;

insert into public.modulos (chave, nome)
values ('dashboard', 'Dashboard');

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, 'dashboard.view', 'Visualizar dashboards operacionais'
from public.modulos module
join public.acoes action on action.chave = 'view'
where module.chave = 'dashboard';

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave = 'dashboard.view'
where profile.chave in ('administrator', 'prospector', 'consultation');
