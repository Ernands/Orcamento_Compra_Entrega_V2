do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage schema unavailable; bucket update skipped in this environment';
    return;
  end if;

  update storage.buckets
  set
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-m4v',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  where id = 'store-attachments';

  if not found then
    raise exception 'store-attachments bucket not found';
  end if;
end;
$$;
