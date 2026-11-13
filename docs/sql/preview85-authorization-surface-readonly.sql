-- Preview #85 — auditável, somente leitura, DEV/PROD.
-- Inventário de execução real (EXECUTE + USAGE do schema), RLS e grants.
-- Não modifica políticas, permissões, funções, documentos nem registros.
-- Os resultados NÃO demonstram equivalência de autorização entre usuários reais.
-- Para uso em pré/pós-release aprovado, capturar a saída fora do GitHub.
WITH expected_functions(qualified_name) AS (
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
),
function_inventory AS (
  SELECT e.qualified_name,
         split_part(e.qualified_name, '.', 1) AS schema_name,
         p.oid,
         coalesce(p.prosecdef, false) AS is_definer,
         coalesce(has_schema_privilege('anon', n.oid, 'USAGE')
           AND has_function_privilege('anon', p.oid, 'EXECUTE'), false) AS anon_callable,
         coalesce(has_schema_privilege('authenticated', n.oid, 'USAGE')
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) AS authenticated_callable
  FROM expected_functions e
  LEFT JOIN pg_namespace n ON n.nspname = split_part(e.qualified_name, '.', 1)
  LEFT JOIN pg_proc p ON p.pronamespace = n.oid
                     AND p.proname = split_part(e.qualified_name, '.', 2)
),
expected_tables(table_name) AS (
  VALUES
    ('supply_purchases'), ('supply_purchase_stores'), ('supply_purchase_items'),
    ('supply_purchase_destinations'), ('supply_purchase_destination_stores'),
    ('supply_purchase_orders'), ('supply_purchase_order_items'),
    ('supply_purchase_order_line_stores'), ('supply_purchase_payments'),
    ('supply_purchase_payment_occurrences'), ('supply_purchase_attachments'),
    ('supply_purchase_attachment_stores'), ('supply_purchase_partial_adjustments'),
    ('supply_items')
),
table_inventory AS (
  SELECT e.table_name,
         coalesce(c.relrowsecurity, false) AS rls_enabled,
         coalesce(has_table_privilege('anon', c.oid, 'SELECT'), false) AS anon_select_grant,
         (SELECT count(*)
          FROM pg_policies pol
          WHERE pol.schemaname = 'public' AND pol.tablename = e.table_name) AS policy_count
  FROM expected_tables e
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
),
existing_public_definer AS (
  SELECT count(*) AS n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_schema_privilege('authenticated', n.oid, 'USAGE')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
)
SELECT jsonb_build_object(
  'required_functions', (SELECT count(*) FROM expected_functions),
  'installed_functions', (SELECT count(DISTINCT qualified_name) FROM function_inventory WHERE oid IS NOT NULL),
  'missing_functions', (SELECT coalesce(jsonb_agg(qualified_name ORDER BY qualified_name), '[]'::jsonb) FROM function_inventory WHERE oid IS NULL),
  'expected_anon_callable', (SELECT coalesce(jsonb_agg(qualified_name ORDER BY qualified_name), '[]'::jsonb) FROM function_inventory WHERE anon_callable),
  'expected_public_definer', (SELECT coalesce(jsonb_agg(qualified_name ORDER BY qualified_name), '[]'::jsonb) FROM function_inventory WHERE schema_name = 'public' AND is_definer),
  'expected_private_auth_callable', (SELECT coalesce(jsonb_agg(qualified_name ORDER BY qualified_name), '[]'::jsonb) FROM function_inventory WHERE schema_name = 'private' AND authenticated_callable),
  'expected_public_auth_not_callable', (SELECT coalesce(jsonb_agg(qualified_name ORDER BY qualified_name), '[]'::jsonb) FROM function_inventory WHERE schema_name = 'public' AND oid IS NOT NULL AND NOT authenticated_callable),
  'inspected_tables', (SELECT count(*) FROM expected_tables),
  'tables_without_rls', (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb) FROM table_inventory WHERE NOT rls_enabled),
  'tables_with_anon_select_grant', (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb) FROM table_inventory WHERE anon_select_grant),
  'tables_without_any_policy', (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb) FROM table_inventory WHERE policy_count = 0),
  'existing_public_authenticated_definer_count', (SELECT n FROM existing_public_definer)
) AS authorization_preflight;
