insert into public.modulos (chave, nome) values
  ('items', 'Itens de Suprimentos'),
  ('suppliers', 'Fornecedores'),
  ('quotes', 'Cotacoes');

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, permission.key, permission.description
from (values
  ('items', 'view', 'items.view', 'Visualizar catalogo de itens'),
  ('items', 'manage', 'items.manage', 'Criar e editar itens do catalogo'),
  ('suppliers', 'view', 'suppliers.view', 'Visualizar fornecedores e canais'),
  ('suppliers', 'manage', 'suppliers.manage', 'Criar e editar fornecedores e canais'),
  ('quotes', 'view', 'quotes.view', 'Visualizar cotacoes das lojas acessiveis'),
  ('quotes', 'create', 'quotes.create', 'Criar cotacoes para lojas acessiveis'),
  ('quotes', 'edit', 'quotes.edit', 'Editar cotacoes draft das lojas acessiveis')
) as permission(module_key, action_key, key, description)
join public.modulos module on module.chave = permission.module_key
join public.acoes action on action.chave = permission.action_key;

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in (
  'items.view', 'items.manage',
  'suppliers.view', 'suppliers.manage',
  'quotes.view', 'quotes.create', 'quotes.edit'
)
where profile.chave in ('administrator', 'prospector');

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in (
  'items.view', 'suppliers.view', 'quotes.view'
)
where profile.chave = 'consultation';

create or replace function app.can_read_supply_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('quotes', 'view')
    and exists (
      select 1 from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
    )
    and not exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
        and not app.can_store('quotes', 'view', quote_store.store_id)
    );
$$;

revoke all on function app.can_read_supply_quote(uuid) from public, anon, authenticated;
grant execute on function app.can_read_supply_quote(uuid) to authenticated;

create policy supply_items_read_capability
on public.supply_items for select to authenticated
using (app.can('items', 'view'));

create policy supply_items_create_capability
on public.supply_items for insert to authenticated
with check (
  app.can('items', 'manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy supply_items_update_capability
on public.supply_items for update to authenticated
using (app.can('items', 'manage'))
with check (
  app.can('items', 'manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy suppliers_read_capability
on public.suppliers for select to authenticated
using (app.can('suppliers', 'view'));

create policy suppliers_create_capability
on public.suppliers for insert to authenticated
with check (
  app.can('suppliers', 'manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy suppliers_update_capability
on public.suppliers for update to authenticated
using (app.can('suppliers', 'manage'))
with check (
  app.can('suppliers', 'manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy supplier_channels_read_capability
on public.supplier_channels for select to authenticated
using (app.can('suppliers', 'view'));

create policy supplier_channels_create_capability
on public.supplier_channels for insert to authenticated
with check (
  app.can('suppliers', 'manage')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy supplier_channels_update_capability
on public.supplier_channels for update to authenticated
using (app.can('suppliers', 'manage'))
with check (
  app.can('suppliers', 'manage')
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy supply_quotes_read_scoped
on public.supply_quotes for select to authenticated
using (app.can_read_supply_quote(id));

create policy supply_quote_stores_read_scoped
on public.supply_quote_stores for select to authenticated
using (
  app.can_read_supply_quote(quote_id)
  and app.can_store('quotes', 'view', store_id)
);

create policy supply_quote_items_read_scoped
on public.supply_quote_items for select to authenticated
using (
  app.can_read_supply_quote(quote_id)
  and (store_id is null or app.can_store('quotes', 'view', store_id))
);

revoke all on table public.supply_items from anon, authenticated;
revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.supplier_channels from anon, authenticated;
revoke all on table public.supply_quotes from anon, authenticated;
revoke all on table public.supply_quote_stores from anon, authenticated;
revoke all on table public.supply_quote_items from anon, authenticated;

grant select, insert, update on table public.supply_items to authenticated;
grant select on table public.suppliers to authenticated;
grant select on table public.supplier_channels to authenticated;
grant select on table public.supply_quotes to authenticated;
grant select on table public.supply_quote_stores to authenticated;
grant select on table public.supply_quote_items to authenticated;
grant usage, select on sequence public.supply_item_codigo_seq to authenticated;

grant all on table public.supply_items to service_role;
grant all on table public.suppliers to service_role;
grant all on table public.supplier_channels to service_role;
grant all on table public.supply_quotes to service_role;
grant all on table public.supply_quote_stores to service_role;
grant all on table public.supply_quote_items to service_role;
grant all on sequence public.supply_item_codigo_seq to service_role;
grant all on sequence public.supplier_codigo_seq to service_role;
grant all on sequence public.supply_quote_codigo_seq to service_role;
