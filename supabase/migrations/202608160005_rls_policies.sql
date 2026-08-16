create policy profiles_read_authenticated
on public.perfis for select to authenticated
using (app.current_usuario_id() is not null and ativo);

create policy modules_read_access_admin
on public.modulos for select to authenticated
using (app.can('access', 'view'));

create policy actions_read_access_admin
on public.acoes for select to authenticated
using (app.can('access', 'view'));

create policy permissions_read_access_admin
on public.permissoes for select to authenticated
using (app.can('access', 'view'));

create policy profile_permissions_read_access_admin
on public.perfil_permissoes for select to authenticated
using (app.can('access', 'view'));

create policy users_read_own_admin_or_store_responsible
on public.usuarios for select to authenticated
using (
  id = app.current_usuario_id()
  or app.can('access', 'view')
  or exists (
    select 1
    from public.lojas l
    where l.responsavel_usuario_id = usuarios.id
      and app.can_store('stores', 'view', l.id)
  )
);

create policy user_permissions_read_own_or_admin
on public.usuario_permissoes for select to authenticated
using (usuario_id = app.current_usuario_id() or app.can('access', 'view'));

create policy user_stores_read_own_or_admin
on public.usuario_lojas for select to authenticated
using (usuario_id = app.current_usuario_id() or app.can('access', 'view'));

create policy stores_read_scoped
on public.lojas for select to authenticated
using (app.can_store('stores', 'view', id));

create policy stores_create_capability
on public.lojas for insert to authenticated
with check (
  app.can('stores', 'create')
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy stores_update_scoped
on public.lojas for update to authenticated
using (app.can_store('stores', 'edit', id))
with check (
  app.can_store('stores', 'edit', id)
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy stores_delete_scoped
on public.lojas for delete to authenticated
using (app.can_store('stores', 'delete', id));

create policy audit_read_access_admin
on public.audit_logs for select to authenticated
using (app.can('access', 'view'));

revoke all on table public.modulos from anon, authenticated;
revoke all on table public.acoes from anon, authenticated;
revoke all on table public.permissoes from anon, authenticated;
revoke all on table public.perfis from anon, authenticated;
revoke all on table public.perfil_permissoes from anon, authenticated;
revoke all on table public.usuarios from anon, authenticated;
revoke all on table public.usuario_permissoes from anon, authenticated;
revoke all on table public.lojas from anon, authenticated;
revoke all on table public.usuario_lojas from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select on table public.perfis to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.usuario_permissoes to authenticated;
grant select on table public.usuario_lojas to authenticated;
grant select, insert, update, delete on table public.lojas to authenticated;
grant select on table public.modulos to authenticated;
grant select on table public.acoes to authenticated;
grant select on table public.permissoes to authenticated;
grant select on table public.perfil_permissoes to authenticated;
grant select on table public.audit_logs to authenticated;
grant usage, select on sequence public.loja_codigo_seq to authenticated;

grant all on table public.modulos to service_role;
grant all on table public.acoes to service_role;
grant all on table public.permissoes to service_role;
grant all on table public.perfis to service_role;
grant all on table public.perfil_permissoes to service_role;
grant all on table public.usuarios to service_role;
grant all on table public.usuario_permissoes to service_role;
grant all on table public.lojas to service_role;
grant all on table public.usuario_lojas to service_role;
grant all on table public.audit_logs to service_role;
grant all on sequence public.usuario_codigo_seq to service_role;
grant all on sequence public.loja_codigo_seq to service_role;
