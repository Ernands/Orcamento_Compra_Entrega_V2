-- Preview #85: coverage manifest for a manual Supabase Free backup.
-- READ ONLY. Includes only aggregate counters and bucket IDs, no filenames,
-- file bytes, authentication secrets, emails, CPFs, or customer data.
-- Does NOT export data, verify physical objects, or prove restore capability.
-- Compare at a controlled release freeze and afterwards; live data can change.
WITH bucket_counts AS (
  SELECT b.id AS bucket_id,
         count(o.id) AS object_count,
         count(o.id) FILTER (WHERE o.metadata->>'size' ~ '^[0-9]+$')
           AS objects_with_numeric_size,
         coalesce(sum(CASE
           WHEN o.metadata->>'size' ~ '^[0-9]+$'
             THEN (o.metadata->>'size')::bigint
           ELSE 0
         END), 0) AS declared_size_bytes
  FROM storage.buckets b
  LEFT JOIN storage.objects o ON o.bucket_id = b.id
  GROUP BY b.id
)
SELECT jsonb_build_object(
  'auth_user_count', (SELECT count(*) FROM auth.users),
  'app_user_count', (SELECT count(*) FROM public.usuarios),
  'storage_bucket_count', (SELECT count(*) FROM bucket_counts),
  'total_storage_object_metadata', (SELECT coalesce(sum(object_count), 0) FROM bucket_counts),
  'total_size_bytes_reported', (SELECT coalesce(sum(declared_size_bytes), 0) FROM bucket_counts),
  'objects_with_numeric_size', (SELECT coalesce(sum(objects_with_numeric_size), 0) FROM bucket_counts),
  'buckets', (SELECT coalesce(jsonb_agg(
    jsonb_build_object('bucket_id', bucket_id, 'objects', object_count,
      'size_bytes_reported', declared_size_bytes) ORDER BY bucket_id),
    '[]'::jsonb) FROM bucket_counts)
) AS readonly_backup_coverage_manifest;
