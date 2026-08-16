create table private.login_rate_limits (
  subject_kind text not null check (subject_kind in ('cpf', 'ip')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  primary key (subject_kind, subject_hash)
);

create index login_rate_limits_locked_idx
on private.login_rate_limits(locked_until)
where locked_until is not null;

grant all on table private.auth_identities to service_role;
grant all on table private.login_rate_limits to service_role;

create or replace function private.consume_login_attempt(
  p_subject_kind text,
  p_subject_hash text
)
returns table (allowed boolean, blocked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_locked_until timestamptz;
begin
  if p_subject_kind not in ('cpf', 'ip') or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate limit subject';
  end if;

  insert into private.login_rate_limits as limits (
    subject_kind,
    subject_hash,
    attempt_count,
    window_started_at,
    locked_until,
    last_attempt_at
  ) values (
    p_subject_kind,
    p_subject_hash,
    1,
    now(),
    null,
    now()
  )
  on conflict (subject_kind, subject_hash) do update set
    attempt_count = case
      when limits.window_started_at <= now() - interval '15 minutes'
        or (limits.locked_until is not null and limits.locked_until <= now())
      then 1
      else limits.attempt_count + 1
    end,
    window_started_at = case
      when limits.window_started_at <= now() - interval '15 minutes'
        or (limits.locked_until is not null and limits.locked_until <= now())
      then now()
      else limits.window_started_at
    end,
    locked_until = case
      when limits.locked_until is not null and limits.locked_until > now()
      then limits.locked_until
      when limits.window_started_at <= now() - interval '15 minutes'
        or (limits.locked_until is not null and limits.locked_until <= now())
      then null
      when limits.attempt_count + 1 > 5
      then now() + interval '15 minutes'
      else limits.locked_until
    end,
    last_attempt_at = now()
  returning limits.attempt_count, limits.locked_until
  into v_count, v_locked_until;

  return query select (v_count <= 5 and (v_locked_until is null or v_locked_until <= now())), v_locked_until;
end;
$$;

revoke all on function private.consume_login_attempt(text, text) from public, anon, authenticated;
grant execute on function private.consume_login_attempt(text, text) to service_role;

create or replace function public.auth_begin_login_attempt(
  p_cpf_lookup text,
  p_ip_hash text
)
returns table (
  allowed boolean,
  technical_email text,
  auth_user_id uuid,
  account_status public.user_status,
  blocked_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cpf_allowed boolean;
  v_ip_allowed boolean;
  v_cpf_blocked_until timestamptz;
  v_ip_blocked_until timestamptz;
  v_technical_email text;
  v_auth_user_id uuid;
  v_status public.user_status;
begin
  if p_cpf_lookup !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid login lookup';
  end if;

  select consumed.allowed, consumed.blocked_until
  into v_cpf_allowed, v_cpf_blocked_until
  from private.consume_login_attempt('cpf', p_cpf_lookup) consumed;

  select consumed.allowed, consumed.blocked_until
  into v_ip_allowed, v_ip_blocked_until
  from private.consume_login_attempt('ip', p_ip_hash) consumed;

  select identity.technical_email, identity.auth_user_id, users.status
  into v_technical_email, v_auth_user_id, v_status
  from private.auth_identities identity
  join public.usuarios users on users.id = identity.usuario_id
  where identity.cpf_lookup = p_cpf_lookup;

  return query select
    v_cpf_allowed and v_ip_allowed,
    v_technical_email,
    v_auth_user_id,
    v_status,
    greatest(v_cpf_blocked_until, v_ip_blocked_until);
end;
$$;

create or replace function public.auth_finish_login_attempt(
  p_cpf_lookup text,
  p_ip_hash text,
  p_success boolean,
  p_auth_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  if p_cpf_lookup !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid login lookup';
  end if;

  if not p_success then
    return;
  end if;

  delete from private.login_rate_limits
  where (subject_kind = 'cpf' and subject_hash = p_cpf_lookup)
     or (subject_kind = 'ip' and subject_hash = p_ip_hash);

  update public.usuarios
  set last_login_at = now()
  where auth_user_id = p_auth_user_id
    and status = 'active'
  returning id into v_usuario_id;

  if v_usuario_id is not null then
    insert into public.audit_logs (
      actor_usuario_id,
      action,
      entity_type,
      entity_id,
      after_json,
      origin,
      ip_hash
    ) values (
      v_usuario_id,
      'auth.login_succeeded',
      'usuario',
      v_usuario_id,
      jsonb_build_object('result', 'success'),
      'edge',
      p_ip_hash
    );
  end if;
end;
$$;

create or replace function public.get_auth_context_for_service(p_auth_user_id uuid)
returns table (
  usuario_id uuid,
  mapped_auth_user_id uuid,
  technical_email text,
  account_status public.user_status,
  must_change_password boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, i.auth_user_id, i.technical_email, u.status, u.must_change_password
  from public.usuarios u
  join private.auth_identities i on i.usuario_id = u.id
  where u.auth_user_id = p_auth_user_id;
$$;

create or replace function public.admin_create_user_record(
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid,
  p_technical_email text,
  p_cpf_lookup text,
  p_cpf_last4 text,
  p_name text,
  p_profile_id uuid,
  p_store_ids uuid[],
  p_all_stores boolean,
  p_status public.user_status,
  p_origin text default 'edge'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_user_id uuid;
  v_profile_key text;
begin
  if p_auth_user_id is null
    or p_technical_email is null
    or p_technical_email <> lower(p_technical_email)
    or p_cpf_lookup !~ '^[0-9a-f]{64}$'
    or p_cpf_last4 !~ '^[0-9]{4}$'
    or length(trim(p_name)) not between 2 and 160
  then
    raise exception 'invalid user input';
  end if;

  select id into v_actor_id
  from public.usuarios
  where auth_user_id = p_actor_auth_user_id
    and status = 'active';

  if p_actor_auth_user_id is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('implanta27.bootstrap_admin', 0)
    );
    if exists (select 1 from public.usuarios) then
      raise exception 'bootstrap already completed';
    end if;
    select chave into v_profile_key from public.perfis where id = p_profile_id and ativo;
    if v_profile_key is distinct from 'administrator' then
      raise exception 'bootstrap requires administrator profile';
    end if;
  elsif not private.can_as(p_actor_auth_user_id, 'access', 'create') then
    raise exception 'insufficient capability';
  end if;

  if not exists (
    select 1 from public.perfis
    where id = p_profile_id and ativo
  ) then
    raise exception 'invalid active profile';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_store_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.lojas where lojas.id = requested.id)
  ) then
    raise exception 'invalid store scope';
  end if;

  insert into public.usuarios (
    auth_user_id,
    perfil_id,
    nome,
    cpf_last4,
    status,
    must_change_password,
    all_stores,
    created_by,
    updated_by
  ) values (
    p_auth_user_id,
    p_profile_id,
    trim(p_name),
    p_cpf_last4,
    p_status,
    true,
    p_all_stores,
    v_actor_id,
    v_actor_id
  ) returning id into v_user_id;

  insert into private.auth_identities (usuario_id, auth_user_id, cpf_lookup, technical_email)
  values (v_user_id, p_auth_user_id, p_cpf_lookup, p_technical_email);

  if not p_all_stores then
    insert into public.usuario_lojas (usuario_id, loja_id, created_by)
    select v_user_id, requested.id, v_actor_id
    from (select distinct unnest(coalesce(p_store_ids, array[]::uuid[])) as id) requested;
  end if;

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    after_json,
    origin
  ) values (
    v_actor_id,
    'access.user_created',
    'usuario',
    v_user_id,
    jsonb_build_object(
      'name', trim(p_name),
      'profile_id', p_profile_id,
      'status', p_status,
      'all_stores', p_all_stores,
      'store_count', cardinality(coalesce(p_store_ids, array[]::uuid[]))
    ),
    case when p_origin = 'bootstrap' then 'bootstrap' else 'edge' end
  );

  return v_user_id;
end;
$$;

create or replace function public.admin_update_user_record(
  p_actor_auth_user_id uuid,
  p_user_id uuid,
  p_name text,
  p_profile_id uuid,
  p_store_ids uuid[],
  p_all_stores boolean,
  p_status public.user_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_before jsonb;
  v_previous_status public.user_status;
begin
  if not private.can_as(p_actor_auth_user_id, 'access', 'edit') then
    raise exception 'insufficient capability';
  end if;

  select id into v_actor_id from public.usuarios where auth_user_id = p_actor_auth_user_id;
  select status, jsonb_build_object(
    'name', nome,
    'profile_id', perfil_id,
    'status', status,
    'all_stores', all_stores
  ) into v_previous_status, v_before
  from public.usuarios
  where id = p_user_id
  for update;

  if v_before is null then
    raise exception 'user not found';
  end if;
  if p_user_id = v_actor_id and p_status <> 'active' then
    raise exception 'cannot disable own access';
  end if;
  if v_previous_status is distinct from p_status
    and not private.can_as(p_actor_auth_user_id, 'access', 'disable')
  then
    raise exception 'insufficient capability to change status';
  end if;
  if not exists (
    select 1 from public.perfis
    where id = p_profile_id and ativo
  ) then
    raise exception 'invalid active profile';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_store_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.lojas where lojas.id = requested.id)
  ) then
    raise exception 'invalid store scope';
  end if;

  update public.usuarios
  set nome = trim(p_name),
      perfil_id = p_profile_id,
      all_stores = p_all_stores,
      status = p_status,
      updated_by = v_actor_id
  where id = p_user_id;

  delete from public.usuario_lojas where usuario_id = p_user_id;
  if not p_all_stores then
    insert into public.usuario_lojas (usuario_id, loja_id, created_by)
    select p_user_id, requested.id, v_actor_id
    from (select distinct unnest(coalesce(p_store_ids, array[]::uuid[])) as id) requested;
  end if;

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
    'access.user_updated',
    'usuario',
    p_user_id,
    v_before,
    jsonb_build_object(
      'name', trim(p_name),
      'profile_id', p_profile_id,
      'status', p_status,
      'all_stores', p_all_stores,
      'store_count', cardinality(coalesce(p_store_ids, array[]::uuid[]))
    ),
    'edge'
  );
end;
$$;

create or replace function public.admin_mark_password_reset(
  p_actor_auth_user_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  if not private.can_as(p_actor_auth_user_id, 'access', 'reset_password') then
    raise exception 'insufficient capability';
  end if;
  select id into v_actor_id from public.usuarios where auth_user_id = p_actor_auth_user_id;

  update public.usuarios
  set must_change_password = true,
      updated_by = v_actor_id
  where id = p_user_id;

  if not found then raise exception 'user not found'; end if;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor_id,
    'access.password_reset',
    'usuario',
    p_user_id,
    jsonb_build_object('must_change_password', true),
    'edge'
  );
end;
$$;

create or replace function public.record_own_password_change(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  update public.usuarios
  set must_change_password = false,
      password_changed_at = now(),
      updated_at = now()
  where auth_user_id = p_auth_user_id
    and status = 'active'
  returning id into v_user_id;

  if v_user_id is null then raise exception 'active user not found'; end if;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_user_id,
    'auth.password_changed',
    'usuario',
    v_user_id,
    jsonb_build_object('must_change_password', false),
    'edge'
  );
end;
$$;

revoke all on function public.auth_begin_login_attempt(text, text) from public, anon, authenticated;
revoke all on function public.auth_finish_login_attempt(text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.get_auth_context_for_service(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_user_record(uuid, uuid, text, text, text, text, uuid, uuid[], boolean, public.user_status, text) from public, anon, authenticated;
revoke all on function public.admin_update_user_record(uuid, uuid, text, uuid, uuid[], boolean, public.user_status) from public, anon, authenticated;
revoke all on function public.admin_mark_password_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_own_password_change(uuid) from public, anon, authenticated;

grant execute on function public.auth_begin_login_attempt(text, text) to service_role;
grant execute on function public.auth_finish_login_attempt(text, text, boolean, uuid) to service_role;
grant execute on function public.get_auth_context_for_service(uuid) to service_role;
grant execute on function public.admin_create_user_record(uuid, uuid, text, text, text, text, uuid, uuid[], boolean, public.user_status, text) to service_role;
grant execute on function public.admin_update_user_record(uuid, uuid, text, uuid, uuid[], boolean, public.user_status) to service_role;
grant execute on function public.admin_mark_password_reset(uuid, uuid) to service_role;
grant execute on function public.record_own_password_change(uuid) to service_role;
