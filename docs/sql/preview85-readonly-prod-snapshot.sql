-- Preview #85 — reproducible pre-/post-release financial and Storage baseline.
-- READ-ONLY. Run through the Supabase SQL Editor as an authorized operator
-- immediately before and after the approved deployment, with writes paused.
-- Save BOTH outputs securely outside the GitHub repository. Never put secrets,
-- CPF, customer data or raw fiscal documents in pull-request comments.
--
-- WARNING: this is NOT a backup, does NOT inspect Storage file bytes and does
-- NOT replace a documented restoration rehearsal.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database() AS database_name,
       current_timestamp AT TIME ZONE 'UTC' AS captured_utc,
       jsonb_build_object(
         'stores', (SELECT count(*) FROM public.lojas),
         'purchases', (SELECT count(*) FROM public.supply_purchases),
         'purchase_approved_total', (SELECT coalesce(sum(approved_total),0)::numeric(20,2)
                                      FROM public.supply_purchases),
         'purchase_items', (SELECT count(*) FROM public.supply_purchase_items),
         'purchase_orders', (SELECT count(*) FROM public.supply_purchase_orders),
         'purchase_order_lines', (SELECT count(*) FROM public.supply_purchase_order_items),
         'purchase_payments', (SELECT count(*) FROM public.supply_purchase_payments),
         'purchase_payment_amount', (SELECT coalesce(sum(amount),0)::numeric(20,2)
                                     FROM public.supply_purchase_payments),
         'purchase_partial_adjustments', (SELECT count(*)
                                          FROM public.supply_purchase_partial_adjustments),
         'purchase_active_attachments', (SELECT count(*)
                                         FROM public.supply_purchase_attachments
                                         WHERE deleted_at IS NULL),
         'works', (SELECT count(*) FROM public.works_services),
         'works_contracted_total', (SELECT coalesce(sum(contracted_amount),0)::numeric(20,2)
                                    FROM public.works_services),
         'work_payments', (SELECT count(*) FROM public.works_service_payments),
         'work_payment_amount', (SELECT coalesce(sum(amount),0)::numeric(20,2)
                                 FROM public.works_service_payments),
         'work_documents', (SELECT count(*) FROM public.works_service_documents),
         'storage_objects_metadata', (SELECT count(*) FROM storage.objects)
       ) AS snapshot;

-- Status changes can hide a financial discrepancy even when global sums match.
SELECT 'purchase' AS source, status::text, count(*) AS records,
       coalesce(sum(approved_total),0)::numeric(20,2) AS amount
FROM public.supply_purchases GROUP BY status
UNION ALL
SELECT 'purchase_payment', status::text, count(*),
       coalesce(sum(amount),0)::numeric(20,2)
FROM public.supply_purchase_payments GROUP BY status
UNION ALL
SELECT 'work', status::text, count(*),
       coalesce(sum(contracted_amount),0)::numeric(20,2)
FROM public.works_services GROUP BY status
UNION ALL
SELECT 'work_payment', status::text, count(*),
       coalesce(sum(amount),0)::numeric(20,2)
FROM public.works_service_payments GROUP BY status
ORDER BY source, status;

-- Metadata counts per bucket, NOT an assertion that object bytes can be restored.
SELECT bucket_id, count(*) AS object_metadata_count
FROM storage.objects
GROUP BY bucket_id ORDER BY bucket_id;

COMMIT;
