import { describe, expect, it } from 'vitest';
import migration from '../../supabase/migrations/20260921144845_works_service_components_fk_indexes.sql?raw';

describe('works service component audit indexes', () => {
  it('indexes both audit foreign keys', () => {
    expect(migration).toContain('works_service_components_created_by_idx');
    expect(migration).toContain('on public.works_service_components(created_by)');
    expect(migration).toContain('works_service_components_updated_by_idx');
    expect(migration).toContain('on public.works_service_components(updated_by)');
  });
});
