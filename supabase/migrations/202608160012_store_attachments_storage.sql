create or replace function app.storage_store_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_object_name ~ '^lojas/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      then split_part(p_object_name, '/', 2)::uuid
    else null
  end;
$$;

revoke all on function app.storage_store_id(text) from public, anon;
grant execute on function app.storage_store_id(text) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage schema unavailable; bucket and object policies skipped in this environment';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'store-attachments',
    'store-attachments',
    false,
    15728640,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $policy$
    create policy store_attachments_objects_read
    on storage.objects for select to authenticated
    using (
      bucket_id = 'store-attachments'
      and app.can_store('attachments', 'view', app.storage_store_id(name))
    )
  $policy$;

  execute $policy$
    create policy store_attachments_objects_create
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'store-attachments'
      and app.can_store('attachments', 'create', app.storage_store_id(name))
    )
  $policy$;

  execute $policy$
    create policy store_attachments_objects_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'store-attachments'
      and app.can_store('attachments', 'delete', app.storage_store_id(name))
    )
  $policy$;
end;
$$;
