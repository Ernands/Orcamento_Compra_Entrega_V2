-- Hotfix for PostgreSQL 42703 after PR #70:
-- finance_purchase_store_ids(uuid) RETURNS SETOF uuid, not a table with a
-- named store_id column. Name the function result explicitly. Existing
-- financial locks and document audit behavior remain fully enabled.
--
-- This script is idempotent because DEV and PROD first received the fix at
-- different migration versions during the urgent production repair.
DO $financial_hotfix$
DECLARE current_fn record;
DECLARE current_definition text;
DECLARE updated_definition text;
DECLARE touched integer := 0;
DECLARE old_line text :=
 'FOR v_store IN SELECT store_id FROM private.finance_purchase_store_ids(v_parent) LOOP';
DECLARE new_line text :=
 'FOR v_store IN SELECT f.store_id FROM private.finance_purchase_store_ids(v_parent) AS f(store_id) LOOP';
BEGIN
 FOR current_fn IN
   SELECT p.oid,p.proname
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='private'
     AND p.proname IN (
       'guard_store_financial_changes',
       'guard_closed_store_document_changes',
       'audit_financial_document_append'
     )
   ORDER BY p.proname
 LOOP
   current_definition:=pg_get_functiondef(current_fn.oid);
   IF position(old_line in current_definition)>0 THEN
     IF position(new_line in current_definition)>0 THEN
       RAISE EXCEPTION 'Ambiguous partially patched function: %',current_fn.proname;
     END IF;
     updated_definition:=replace(current_definition,old_line,new_line);
     EXECUTE updated_definition;
   ELSIF position(new_line in current_definition)=0 THEN
     RAISE EXCEPTION 'Unknown function version, refusing unsafe hotfix: %',current_fn.proname;
   END IF;
   touched:=touched+1;
 END LOOP;
 IF touched<>3 THEN
   RAISE EXCEPTION 'Expected three financial closure functions; found %',touched;
 END IF;
END $financial_hotfix$;