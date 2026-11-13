-- Preview #85: safe preflight inventory of required functions and purchase RLS.
-- READ-ONLY on DEV or PROD. Result means "objects installed", NOT authorization
-- or data parity. Do not deploy migrations or change privileges based on this alone.
-- Function names are taken from the FINAL state of PR #85's migration sequence:
-- intentionally dropped temporary app.readable_store_ids_for is excluded.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH expected(name) AS (
  VALUES
    ('app.readable_supply_purchase_ids'),
    ('app.readable_supply_purchase_attachment_ids'),
    ('private.readable_supply_purchase_ids_for'),
    ('app.readable_supply_purchase_audit_ids'),
    ('private.readable_store_ids_for'),
    ('app.readable_purchase_store_ids'),
    ('app.readable_order_line_store_ids'),
    ('app.readable_attachment_store_ids'),
    ('app.readable_audit_store_ids'),
    ('public.dashboard_implementation_store_metrics_v1'),
    ('public.dashboard_supply_metrics_v1'),
    ('public.finance_payment_sources_page_v1'),
    ('public.finance_work_commitments_page_v1'),
    ('public.finance_purchase_events_page_v1'),
    ('public.finance_purchase_adjustment_reconciliation_v1'),
    ('public.finance_purchase_events_page_v2'),
    ('public.finance_purchase_unscheduled_page_v1'),
    ('public.finance_purchase_store_costs_page_v1'),
    ('public.finance_purchase_combined_groups_page_v1'),
    ('public.finance_purchase_payment_origins_page_v1'),
    ('public.finance_purchase_store_origin_weights_page_v1'),
    ('public.finance_purchase_payment_store_origins_page_v1'),
    ('public.finance_document_audit_fiscal_candidates_v1')
), funcs AS (
  SELECT n.nspname || '.' || p.proname AS name,
         bool_or(p.prosecdef) AS is_security_definer,
         bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_can_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  GROUP BY 1
), missing AS (
  SELECT e.name FROM expected e LEFT JOIN funcs f ON f.name = e.name
  WHERE f.name IS NULL
), rls AS (
  SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p')
    AND c.relname IN (
      'supply_purchases','supply_purchase_stores','supply_purchase_items',
      'supply_purchase_destinations','supply_purchase_destination_stores',
      'supply_purchase_orders','supply_purchase_order_items',
      'supply_purchase_order_line_stores','supply_purchase_payments',
      'supply_purchase_payment_occurrences','supply_purchase_attachments',
      'supply_purchase_attachment_stores','supply_purchase_partial_adjustments',
      'supply_items'
    )
), policies AS (
  SELECT count(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN (SELECT table_name FROM rls)
)
SELECT jsonb_build_object(
  'required_final_functions', (SELECT count(*) FROM expected),
  'functions_not_installed', (SELECT count(*) FROM missing),
  'missing_function_names', (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) FROM missing),
  'purchase_tables_inspected', (SELECT count(*) FROM rls),
  'tables_without_rls', (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
                         FROM rls WHERE NOT rls_enabled),
  'purchase_policy_count', (SELECT policy_count FROM policies)
) AS preflight_readonly;
COMMIT;
