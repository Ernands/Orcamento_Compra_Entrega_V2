create or replace function private.can_as(
  p_auth_user_id uuid,
  p_module_key text,
  p_action_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when exists (
        select 1
        from public.usuario_permissoes up
        where up.usuario_id = u.id
          and up.permissao_id = p.id
          and up.loja_id is null
          and up.efeito = 'deny'
          and (up.expires_at is null or up.expires_at > now())
      ) then false
      else
        exists (
          select 1
          from public.perfil_permissoes pp
          where pp.perfil_id = u.perfil_id
            and pp.permissao_id = p.id
        )
        or exists (
          select 1
          from public.usuario_permissoes up
          where up.usuario_id = u.id
            and up.permissao_id = p.id
            and up.loja_id is null
            and up.efeito = 'grant'
            and (up.expires_at is null or up.expires_at > now())
        )
    end
    from public.usuarios u
    join public.permissoes p on p.chave = p_module_key || '.' || p_action_key and p.ativo
    where u.auth_user_id = p_auth_user_id
      and u.status = 'active'
  ), false);
$$;

revoke all on function private.can_as(uuid, text, text) from public, anon, authenticated;
grant execute on function private.can_as(uuid, text, text) to service_role;

create or replace function app.current_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.usuarios u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active';
$$;

create or replace function app.can(p_module_key text, p_action_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_as((select auth.uid()), p_module_key, p_action_key);
$$;

create or replace function app.has_store_access(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.all_stores or exists (
      select 1
      from public.usuario_lojas ul
      where ul.usuario_id = u.id
        and ul.loja_id = p_store_id
    )
    from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.status = 'active'
  ), false);
$$;

create or replace function app.can_store(
  p_module_key text,
  p_action_key text,
  p_store_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_store_access(p_store_id) and coalesce((
    select case
      when exists (
        select 1
        from public.usuario_permissoes up
        where up.usuario_id = u.id
          and up.permissao_id = p.id
          and (up.loja_id is null or up.loja_id = p_store_id)
          and up.efeito = 'deny'
          and (up.expires_at is null or up.expires_at > now())
      ) then false
      else
        exists (
          select 1
          from public.perfil_permissoes pp
          where pp.perfil_id = u.perfil_id
            and pp.permissao_id = p.id
        )
        or exists (
          select 1
          from public.usuario_permissoes up
          where up.usuario_id = u.id
            and up.permissao_id = p.id
            and (up.loja_id is null or up.loja_id = p_store_id)
            and up.efeito = 'grant'
            and (up.expires_at is null or up.expires_at > now())
        )
    end
    from public.usuarios u
    join public.permissoes p on p.chave = p_module_key || '.' || p_action_key and p.ativo
    where u.auth_user_id = (select auth.uid())
      and u.status = 'active'
  ), false);
$$;

create or replace function public.get_my_capabilities()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.chave order by p.chave), array[]::text[])
  from public.usuarios u
  join public.permissoes p on p.ativo
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
    and not exists (
      select 1
      from public.usuario_permissoes denied
      where denied.usuario_id = u.id
        and denied.permissao_id = p.id
        and denied.loja_id is null
        and denied.efeito = 'deny'
        and (denied.expires_at is null or denied.expires_at > now())
    )
    and (
      exists (
        select 1
        from public.perfil_permissoes pp
        where pp.perfil_id = u.perfil_id
          and pp.permissao_id = p.id
      )
      or exists (
        select 1
        from public.usuario_permissoes granted
        where granted.usuario_id = u.id
          and granted.permissao_id = p.id
          and granted.loja_id is null
          and granted.efeito = 'grant'
          and (granted.expires_at is null or granted.expires_at > now())
      )
    );
$$;

revoke all on function app.current_usuario_id() from public;
revoke all on function app.can(text, text) from public;
revoke all on function app.has_store_access(uuid) from public;
revoke all on function app.can_store(text, text, uuid) from public;
revoke all on function public.get_my_capabilities() from public;

grant execute on function app.current_usuario_id() to authenticated, service_role;
grant execute on function app.can(text, text) to authenticated, service_role;
grant execute on function app.has_store_access(uuid) to authenticated, service_role;
grant execute on function app.can_store(text, text, uuid) to authenticated, service_role;
grant execute on function public.get_my_capabilities() to authenticated, service_role;
