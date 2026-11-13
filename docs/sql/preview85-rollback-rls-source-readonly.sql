-- Preview #85 — PRE-RELEASE capture of the CURRENT RLS configuration.
-- READ-ONLY. Execute on PROD immediately before an APPROVED deployment.
-- Export the result securely, outside the repository/PR and away from logs.
-- It includes access-control expressions and one existing helper definition.
-- It is source material for DBA recovery, NOT executable rollback SQL.
-- Losing this output makes a safe restore of old policies more difficult.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH policy_source AS (
  SELECT
    'policy'::text AS object_kind,
    p.schemaname || '.' || p.tablename || '.' || p.policyname AS object_key,
    to_jsonb(p)::text AS definition
  FROM pg_policies AS p
  WHERE p.schemaname = 'public'
    AND p.tablename IN (
      'supply_purchases', 'supply_purchase_stores', 'supply_purchase_items',
      'supply_purchase_destinations', 'supply_purchase_destination_stores',
      'supply_purchase_orders', 'supply_purchase_order_items',
      'supply_purchase_order_line_stores', 'supply_purchase_payments',
      'supply_purchase_payment_occurrences', 'supply_purchase_attachments',
      'supply_purchase_attachment_stores', 'supply_purchase_partial_adjustments',
      'supply_items'
    )
), function_source AS (
  SELECT
    'function'::text AS object_kind,
    n.nspname || '.' || p.proname || '(' ||
      pg_get_function_identity_arguments(p.oid) || ')' AS object_key,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app'
    AND p.proname = 'readable_supply_purchase_ids'
)
SELECT object_kind, object_key, md5(definition) AS checksum,
       definition AS original_definition
FROM policy_source
UNION ALL
SELECT object_kind, object_key, md5(definition), definition
FROM function_source
ORDER BY object_kind, object_key;

COMMIT;
