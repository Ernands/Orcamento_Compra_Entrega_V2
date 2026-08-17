create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_entity_id uuid;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id := (v_row ->> 'id')::uuid;
  v_action := case
    when tg_op = 'INSERT' then tg_argv[0] || '.created'
    when tg_op = 'UPDATE' then tg_argv[0] || '.updated'
    else tg_argv[0] || '.deleted'
  end;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    app.current_usuario_id(),
    v_action,
    tg_argv[0],
    v_entity_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    'database'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger lojas_audit_changes
after insert or update on public.lojas
for each row execute function private.audit_business_change('store');
create trigger checklist_versions_audit_changes
after insert or update or delete on public.checklist_master_versions
for each row execute function private.audit_business_change('checklist.version');
create trigger checklist_items_audit_changes
after insert or update or delete on public.checklist_master_items
for each row execute function private.audit_business_change('checklist.item');
create trigger store_needs_audit_changes
after insert or update on public.store_needs
for each row execute function private.audit_business_change('need');

revoke all on function private.audit_business_change() from public, anon, authenticated;

create or replace function public.create_checklist_version(
  p_name text,
  p_notes text default null,
  p_source_version_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can('checklists', 'manage') then
    raise exception 'permission denied';
  end if;

  if length(trim(p_name)) < 2 then
    raise exception 'version name is required';
  end if;

  if p_source_version_id is not null and not exists (
    select 1 from public.checklist_master_versions where id = p_source_version_id
  ) then
    raise exception 'source checklist version not found';
  end if;

  insert into public.checklist_master_versions (name, notes, created_by)
  values (trim(p_name), nullif(trim(p_notes), ''), v_actor)
  returning id into v_version_id;

  if p_source_version_id is not null then
    insert into public.checklist_master_items (
      version_id, title, description, category, position, is_required, is_active,
      relative_due_days, guidance, responsibility_type, evidence_required, priority
    )
    select
      v_version_id, title, description, category, position, is_required, is_active,
      relative_due_days, guidance, responsibility_type, evidence_required, priority
    from public.checklist_master_items
    where version_id = p_source_version_id
    order by position, created_at;
  end if;

  return v_version_id;
end;
$$;

create or replace function public.publish_checklist_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can('checklists', 'manage') then
    raise exception 'permission denied';
  end if;

  if not exists (
    select 1 from public.checklist_master_versions
    where id = p_version_id and status = 'draft'
  ) then
    raise exception 'draft checklist version not found';
  end if;

  if not exists (
    select 1 from public.checklist_master_items
    where version_id = p_version_id and is_active
  ) then
    raise exception 'a checklist version requires at least one active item';
  end if;

  update public.checklist_master_versions
  set status = 'archived'
  where status = 'published' and id <> p_version_id;

  update public.checklist_master_versions
  set status = 'published', published_at = now(), published_by = v_actor
  where id = p_version_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor, 'checklist.version_published', 'checklist.version', p_version_id,
    jsonb_build_object('published_at', now()), 'database'
  );
end;
$$;

create or replace function public.start_store_implementation(
  p_store_id uuid,
  p_checklist_version_id uuid default null,
  p_base_date date default current_date,
  p_coordinator_usuario_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_implementation_id uuid;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can_store('implementation', 'edit', p_store_id) then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.lojas where id = p_store_id) then
    raise exception 'store not found';
  end if;

  if exists (
    select 1 from public.store_implementations
    where store_id = p_store_id and status in ('not_started', 'in_progress')
  ) then
    raise exception 'store already has an active implementation';
  end if;

  select version.id into v_version_id
  from public.checklist_master_versions version
  where version.status = 'published'
    and (p_checklist_version_id is null or version.id = p_checklist_version_id)
  order by version.version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'published checklist version not found';
  end if;

  insert into public.store_implementations (
    store_id, checklist_version_id, status, coordinator_usuario_id, base_date,
    started_at, created_by, updated_by
  ) values (
    p_store_id, v_version_id, 'in_progress', p_coordinator_usuario_id,
    coalesce(p_base_date, current_date), now(), v_actor, v_actor
  ) returning id into v_implementation_id;

  insert into public.store_implementation_items (
    implementation_id, master_item_id, title_snapshot, description_snapshot,
    category_snapshot, guidance_snapshot, responsibility_type_snapshot,
    evidence_required_snapshot, priority_snapshot, position, is_required,
    status, due_date, updated_by
  )
  select
    v_implementation_id, item.id, item.title, item.description, item.category,
    item.guidance, item.responsibility_type, item.evidence_required, item.priority,
    item.position, item.is_required, 'pending',
    case
      when item.relative_due_days is null then null
      else coalesce(p_base_date, current_date) + item.relative_due_days
    end,
    v_actor
  from public.checklist_master_items item
  where item.version_id = v_version_id and item.is_active
  order by item.position, item.created_at;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor, 'implementation.started', 'implementation', v_implementation_id,
    jsonb_build_object('store_id', p_store_id, 'checklist_version_id', v_version_id),
    'database'
  );

  return v_implementation_id;
end;
$$;

create or replace function public.update_store_implementation_item(
  p_item_id uuid,
  p_status public.implementation_item_status,
  p_responsible_usuario_id uuid default null,
  p_due_date date default null,
  p_notes text default null
)
returns public.store_implementation_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_implementation_id uuid;
  v_before public.store_implementation_items;
  v_after public.store_implementation_items;
  v_actor uuid := app.current_usuario_id();
  v_previous_implementation_status public.implementation_status;
begin
  select item.*
  into v_before
  from public.store_implementation_items item
  where item.id = p_item_id;

  if v_before.id is not null then
    select implementation.store_id, implementation.id
    into v_store_id, v_implementation_id
    from public.store_implementations implementation
    where implementation.id = v_before.implementation_id;
  end if;

  if v_store_id is null or not app.can_store('implementation', 'edit', v_store_id) then
    raise exception 'permission denied';
  end if;

  select status into v_previous_implementation_status
  from public.store_implementations where id = v_implementation_id;

  if v_previous_implementation_status in ('completed', 'cancelled') then
    raise exception 'implementation is closed';
  end if;

  update public.store_implementation_items
  set
    status = p_status,
    responsible_usuario_id = p_responsible_usuario_id,
    due_date = p_due_date,
    notes = nullif(trim(p_notes), ''),
    completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end,
    updated_by = v_actor
  where id = p_item_id
  returning * into v_after;

  update public.store_implementations
  set
    status = case
      when not exists (
        select 1 from public.store_implementation_items item
        where item.implementation_id = v_implementation_id
          and item.status not in ('completed', 'not_applicable')
      ) then 'completed'::public.implementation_status
      else 'in_progress'::public.implementation_status
    end,
    completed_at = case
      when not exists (
        select 1 from public.store_implementation_items item
        where item.implementation_id = v_implementation_id
          and item.status not in ('completed', 'not_applicable')
      ) then coalesce(completed_at, now())
      else null
    end,
    updated_by = v_actor
  where id = v_implementation_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor, 'implementation.item_updated', 'implementation_item', p_item_id,
    to_jsonb(v_before), to_jsonb(v_after), 'database'
  );

  if v_previous_implementation_status <> 'completed' and not exists (
    select 1 from public.store_implementation_items item
    where item.implementation_id = v_implementation_id
      and item.status not in ('completed', 'not_applicable')
  ) then
    insert into public.audit_logs (
      actor_usuario_id, action, entity_type, entity_id, after_json, origin
    ) values (
      v_actor, 'implementation.completed', 'implementation', v_implementation_id,
      jsonb_build_object('store_id', v_store_id), 'database'
    );
  end if;

  return v_after;
end;
$$;

create or replace function public.register_store_attachment(
  p_store_id uuid,
  p_original_name text,
  p_storage_path text,
  p_category text,
  p_description text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.store_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.store_attachments;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can_store('attachments', 'create', p_store_id) then
    raise exception 'permission denied';
  end if;

  if p_storage_path not like 'lojas/' || p_store_id::text || '/%' then
    raise exception 'invalid storage path';
  end if;

  insert into public.store_attachments (
    store_id, original_name, storage_path, category, description, mime_type, size_bytes, created_by
  ) values (
    p_store_id, p_original_name, p_storage_path, p_category,
    nullif(trim(p_description), ''), p_mime_type, p_size_bytes, v_actor
  ) returning * into v_attachment;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor, 'attachment.uploaded', 'attachment', v_attachment.id,
    jsonb_build_object('store_id', p_store_id, 'category', p_category, 'size_bytes', p_size_bytes),
    'database'
  );

  return v_attachment;
end;
$$;

create or replace function public.delete_store_attachment(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_storage_path text;
  v_actor uuid := app.current_usuario_id();
begin
  select store_id, storage_path into v_store_id, v_storage_path
  from public.store_attachments
  where id = p_attachment_id and deleted_at is null;

  if v_store_id is null or not app.can_store('attachments', 'delete', v_store_id) then
    raise exception 'permission denied';
  end if;

  update public.store_attachments
  set deleted_at = now(), deleted_by = v_actor
  where id = p_attachment_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor, 'attachment.deleted', 'attachment', p_attachment_id,
    jsonb_build_object('store_id', v_store_id), 'database'
  );

  return v_storage_path;
end;
$$;

revoke all on function public.create_checklist_version(text, text, uuid) from public, anon;
revoke all on function public.publish_checklist_version(uuid) from public, anon;
revoke all on function public.start_store_implementation(uuid, uuid, date, uuid) from public, anon;
revoke all on function public.update_store_implementation_item(uuid, public.implementation_item_status, uuid, date, text) from public, anon;
revoke all on function public.register_store_attachment(uuid, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.delete_store_attachment(uuid) from public, anon;

grant execute on function public.create_checklist_version(text, text, uuid) to authenticated, service_role;
grant execute on function public.publish_checklist_version(uuid) to authenticated, service_role;
grant execute on function public.start_store_implementation(uuid, uuid, date, uuid) to authenticated, service_role;
grant execute on function public.update_store_implementation_item(uuid, public.implementation_item_status, uuid, date, text) to authenticated, service_role;
grant execute on function public.register_store_attachment(uuid, text, text, text, text, text, bigint) to authenticated, service_role;
grant execute on function public.delete_store_attachment(uuid) to authenticated, service_role;
