create or replace function public.admin_replace_user_permission_overrides(
  p_actor_auth_user_id uuid,
  p_user_id uuid,
  p_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_target_auth_user_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_requested_count integer;
  v_distinct_count integer;
  v_valid_count integer;
begin
  if not private.can_as(p_actor_auth_user_id, 'access', 'permissions_manage') then
    raise exception 'insufficient capability';
  end if;

  select id into v_actor_id
  from public.usuarios
  where auth_user_id = p_actor_auth_user_id
    and status = 'active';

  if v_actor_id is null then
    raise exception 'actor not found';
  end if;

  select auth_user_id into v_target_auth_user_id
  from public.usuarios
  where id = p_user_id
  for update;

  if v_target_auth_user_id is null then
    raise exception 'user not found';
  end if;

  if v_target_auth_user_id = p_actor_auth_user_id then
    raise exception 'cannot edit own permission overrides';
  end if;

  if p_overrides is null or jsonb_typeof(p_overrides) <> 'array' then
    raise exception 'invalid overrides';
  end if;

  select count(*), count(distinct entry->>'permissionId')
  into v_requested_count, v_distinct_count
  from jsonb_array_elements(p_overrides) entry;

  if v_requested_count <> v_distinct_count then
    raise exception 'duplicate permission override';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_overrides) entry
    where coalesce(entry->>'effect', '') not in ('grant', 'deny')
       or coalesce(entry->>'permissionId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid permission override';
  end if;

  select count(*)
  into v_valid_count
  from jsonb_array_elements(p_overrides) entry
  join public.permissoes permission
    on permission.id = (entry->>'permissionId')::uuid
   and permission.ativo;

  if v_valid_count <> v_requested_count then
    raise exception 'unknown or inactive permission';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'permission_id', up.permissao_id,
        'effect', up.efeito
      )
      order by up.permissao_id
    ),
    '[]'::jsonb
  )
  into v_before
  from public.usuario_permissoes up
  where up.usuario_id = p_user_id
    and up.loja_id is null
    and (up.expires_at is null or up.expires_at > now());

  delete from public.usuario_permissoes
  where usuario_id = p_user_id
    and loja_id is null;

  insert into public.usuario_permissoes (
    usuario_id,
    permissao_id,
    loja_id,
    efeito,
    expires_at,
    motivo,
    created_by
  )
  select
    p_user_id,
    (entry->>'permissionId')::uuid,
    null,
    (entry->>'effect')::public.permission_effect,
    null,
    'Ajuste administrativo de permissoes',
    v_actor_id
  from jsonb_array_elements(p_overrides) entry;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'permission_id', up.permissao_id,
        'effect', up.efeito
      )
      order by up.permissao_id
    ),
    '[]'::jsonb
  )
  into v_after
  from public.usuario_permissoes up
  where up.usuario_id = p_user_id
    and up.loja_id is null;

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    origin
  ) values (
    v_actor_id,
    'access.permissions_updated',
    'usuario',
    p_user_id,
    jsonb_build_object('overrides', v_before),
    jsonb_build_object('overrides', v_after),
    'edge'
  );
end;
$function$;

revoke all on function public.admin_replace_user_permission_overrides(uuid, uuid, jsonb) from public;
revoke all on function public.admin_replace_user_permission_overrides(uuid, uuid, jsonb) from anon;
revoke all on function public.admin_replace_user_permission_overrides(uuid, uuid, jsonb) from authenticated;
grant execute on function public.admin_replace_user_permission_overrides(uuid, uuid, jsonb) to service_role;
