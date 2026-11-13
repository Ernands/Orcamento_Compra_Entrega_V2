-- PREVIEW #85 — read-only checks of attachment links to Storage metadata.
-- Matches document storage_path against storage.objects(bucket_id,name).
-- Run in DEV or PROD with an authorized SQL session. Save aggregate results
-- securely before/after release. Does NOT validate object bytes or backups.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Supabase SQL interface usually returns the last result set. Keep the
-- per-document integrity and fingerprint query LAST, after bucket counts.
SELECT bucket_id, count(*) AS object_metadata_count
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

WITH refs AS (
  SELECT 'purchase' AS document_source,
         a.id::text AS document_id,
         a.storage_path AS storage_path,
         'purchase-attachments' AS bucket_id
  FROM public.supply_purchase_attachments AS a
  WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT 'quote', a.id::text, a.storage_path, 'quote-attachments'
  FROM public.supply_quote_attachments AS a
  WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT 'work', d.id::text, d.storage_path, 'works-documents'
  FROM public.works_service_documents AS d
), link_check AS (
  SELECT
    r.document_source, r.document_id, r.storage_path,
    (r.storage_path IS NULL OR btrim(r.storage_path) = '') AS no_storage_path,
    (o.id IS NOT NULL) AS storage_metadata_found
  FROM refs AS r
  LEFT JOIN storage.objects AS o
    ON o.bucket_id = r.bucket_id AND o.name = r.storage_path
)
SELECT document_source,
       count(*) AS document_records,
       count(*) FILTER (WHERE no_storage_path) AS missing_path,
       count(*) FILTER (WHERE storage_metadata_found) AS metadata_linked,
       count(*) FILTER (WHERE NOT no_storage_path AND NOT storage_metadata_found)
         AS missing_storage_metadata,
       md5(coalesce(string_agg(
           md5(document_id || ':' || coalesce(storage_path, '<missing>')),
           '|' ORDER BY document_id), '')) AS document_link_fingerprint
FROM link_check
GROUP BY document_source
ORDER BY document_source;

-- Bucket metadata presence does not prove the physical object can be downloaded.
COMMIT;
