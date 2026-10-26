import { describe, expect, it } from 'vitest';
import migration from '../../supabase/migrations/20261026161420_fix_financial_lock_setof_uuid_alias.sql?raw';

describe('Financial closure SETOF uuid hotfix', () => {
  it('names the scalar result of the store lookup in all three guards', () => {
    expect(migration).toContain('guard_store_financial_changes');
    expect(migration).toContain('guard_closed_store_document_changes');
    expect(migration).toContain('audit_financial_document_append');
    expect(migration).toContain(
      'FOR v_store IN SELECT f.store_id FROM private.finance_purchase_store_ids(v_parent) AS f(store_id) LOOP',
    );
    expect(migration).toContain('EXECUTE updated_definition');
    expect(migration).toContain('IF touched<>3 THEN');
  });
  it('preserves the existing closures and refuses unknown function versions', () => {
    expect(migration).toContain("n.nspname='private'");
    expect(migration).toContain('Unknown function version, refusing unsafe hotfix');
    expect(migration).not.toContain('DROP TRIGGER');
    expect(migration).not.toContain('DISABLE TRIGGER');
    expect(migration).not.toContain('DROP FUNCTION');
  });
});
