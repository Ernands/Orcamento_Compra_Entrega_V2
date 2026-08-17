drop policy if exists checklist_versions_read_capability
on public.checklist_master_versions;

create policy checklist_versions_read_capability
on public.checklist_master_versions for select to authenticated
using (
  app.can('checklists', 'view')
  or (
    app.can('implementation', 'view')
    and (
      status = 'published'
      or (
        status = 'archived'
        and exists (
          select 1
          from public.store_implementations implementation
          where implementation.checklist_version_id = checklist_master_versions.id
            and app.can_store('implementation', 'view', implementation.store_id)
        )
      )
    )
  )
);

create or replace function app.can_read_store_attachment_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_attachments attachment
    where attachment.storage_path = p_object_name
      and attachment.deleted_at is null
      and attachment.store_id = app.storage_store_id(p_object_name)
      and app.can_store('attachments', 'view', attachment.store_id)
  );
$$;

revoke all on function app.can_read_store_attachment_object(text) from public, anon, authenticated;
grant execute on function app.can_read_store_attachment_object(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Storage schema unavailable; object read policy skipped in this environment';
    return;
  end if;

  execute 'drop policy if exists store_attachments_objects_read on storage.objects';

  execute $policy$
    create policy store_attachments_objects_read
    on storage.objects for select to authenticated
    using (
      bucket_id = 'store-attachments'
      and app.can_read_store_attachment_object(name)
    )
  $policy$;
end;
$$;
