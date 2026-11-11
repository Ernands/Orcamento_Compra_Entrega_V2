begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select ok(to_regprocedure('private.readable_supply_purchase_ids_for(text[])') is not null,
  'Private purchase-scope matrix exists');
select ok(to_regprocedure('private.readable_store_ids_for(text[])') is not null,
  'Private store-scope matrix exists');
select ok(to_regprocedure('app.readable_supply_purchase_ids()') is not null,
  'Purchase row scope wrapper exists');
select ok(to_regprocedure('app.readable_supply_purchase_attachment_ids()') is not null,
  'Attachment row scope wrapper exists');
select ok(to_regprocedure('app.readable_supply_purchase_audit_ids()') is not null,
  'Audit row scope wrapper exists');
select ok(to_regprocedure('app.readable_store_ids_for(text[])') is not null,
  'Store scope wrapper exists');

select ok(has_function_privilege('authenticated', 'app.readable_supply_purchase_ids()', 'EXECUTE'),
  'Authenticated can use purchase row scope in RLS');
select ok(not has_function_privilege('anon', 'app.readable_supply_purchase_ids()', 'EXECUTE'),
  'Anonymous cannot execute purchase row scope');
select ok(has_function_privilege('authenticated', 'app.readable_supply_purchase_attachment_ids()', 'EXECUTE'),
  'Authenticated can use attachment scope in RLS');
select ok(not has_function_privilege('anon', 'app.readable_supply_purchase_attachment_ids()', 'EXECUTE'),
  'Anonymous cannot execute attachment scope');
select ok(has_function_privilege('authenticated', 'app.readable_supply_purchase_audit_ids()', 'EXECUTE'),
  'Authenticated can use audit scope in RLS');
select ok(not has_function_privilege('anon', 'app.readable_supply_purchase_audit_ids()', 'EXECUTE'),
  'Anonymous cannot execute audit scope');
select ok(has_function_privilege('authenticated', 'app.readable_store_ids_for(text[])', 'EXECUTE'),
  'Authenticated can use store scope in RLS');
select ok(not has_function_privilege('anon', 'app.readable_store_ids_for(text[])', 'EXECUTE'),
  'Anonymous cannot execute store scope');
select ok(not has_function_privilege('authenticated', 'private.readable_supply_purchase_ids_for(text[])', 'EXECUTE'),
  'Private purchase matrix is not directly executable by authenticated');
select ok(not has_function_privilege('authenticated', 'private.readable_store_ids_for(text[])', 'EXECUTE'),
  'Private store matrix is not directly executable by authenticated');

select ok((select qual like '%readable_supply_purchase_ids%'
  from pg_policies where schemaname='public' and tablename='supply_purchases'
    and policyname='supply_purchases_read_scoped'),
  'Purchase read policy uses statement-level purchase scope');
select ok((select qual like '%readable_store_ids_for%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_stores'
    and policyname='supply_purchase_stores_read_scoped'),
  'Purchase-store policy uses statement-level store scope');
select ok((select qual like '%readable_store_ids_for%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_destination_stores'
    and policyname='supply_purchase_destination_stores_read'),
  'Destination-store policy uses statement-level store scope');
select ok((select qual like '%readable_store_ids_for%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_order_line_stores'
    and policyname='supply_purchase_order_line_stores_read'),
  'Order-line-store policy uses statement-level store scope');
select ok((select qual like '%readable_store_ids_for%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_attachment_stores'
    and policyname='supply_purchase_attachment_stores_read'),
  'Attachment-store policy uses statement-level store scope');

select ok((select qual like '%readable_supply_purchase_audit_ids%'
  from pg_policies where schemaname='public' and tablename='supply_purchases'
    and policyname='audit_supply_purchases_select'),
  'Audit purchase policy uses statement-level audit scope');
select ok((select qual like '%readable_supply_purchase_audit_ids%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_attachments'
    and policyname='audit_supply_purchase_attachments_select'),
  'Audit attachment policy uses statement-level audit scope');
select ok((select qual like '%readable_store_ids_for%' and qual like '%app.can%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_stores'
    and policyname='audit_supply_purchase_stores_select'),
  'Audit store policy retains finance gate and caches store scope');
select ok((select qual like '%readable_supply_purchase_ids%'
    and qual like '%readable_supply_purchase_audit_ids%'
  from pg_policies where schemaname='public' and tablename='supply_purchase_partial_adjustments'
    and policyname='purchase_partial_adjustments_read'),
  'Partial adjustments preserve both purchase and audit access paths');

select ok(not exists (
  select 1 from pg_policies
  where schemaname='public'
    and tablename like 'supply_purchase%'
    and cmd='SELECT'
    and (qual ilike '%can_read_supply_purchase(%' or qual ilike '%can_read_supply_purchase_for(%')
), 'Purchase SELECT policies do not execute per-row purchase authorization functions');

select ok((select prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'
  from pg_proc where oid='private.readable_supply_purchase_ids_for(text[])'::regprocedure),
  'Private purchase matrix is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'
  from pg_proc where oid='private.readable_store_ids_for(text[])'::regprocedure),
  'Private store matrix is SECURITY DEFINER with empty search_path');

select ok(position('efeito' in pg_get_functiondef(
  'private.readable_supply_purchase_ids_for(text[])'::regprocedure)) > 0
  and position('deny' in pg_get_functiondef(
  'private.readable_supply_purchase_ids_for(text[])'::regprocedure)) > 0,
  'Purchase matrix preserves explicit deny overrides');
select ok(position('finance.store_detail_documents_view' in pg_get_functiondef(
  'app.readable_supply_purchase_attachment_ids()'::regprocedure)) > 0,
  'Attachment scope includes document-detail permission');
select ok(position('finance.payments_consolidated_view' in pg_get_functiondef(
  'app.readable_supply_purchase_attachment_ids()'::regprocedure)) > 0,
  'Attachment scope includes consolidated-payment permission');
select ok(position('app.can' in pg_get_functiondef(
  'app.readable_supply_purchase_audit_ids()'::regprocedure)) > 0
  and position('finance.document_audit_view' in pg_get_functiondef(
  'app.readable_supply_purchase_audit_ids()'::regprocedure)) > 0,
  'Audit scope retains global finance.view requirement');

select * from finish();
rollback;
