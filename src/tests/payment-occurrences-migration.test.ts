import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('purchase payment occurrences migrations', () => {
  it('mantém RLS e escrita via RPC com checagem de edição', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261004183315_purchase_payment_occurrences.sql'),
      'utf8',
    );
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('app.can_read_supply_purchase(payment.purchase_id)');
    expect(migration).toContain('app.can_edit_supply_purchase(v_purchase_id)');
    expect(migration).toContain('grant select on public.supply_purchase_payment_occurrences to authenticated');
    expect(migration).not.toContain('grant insert on public.supply_purchase_payment_occurrences to authenticated');
    expect(migration).not.toContain('grant update on public.supply_purchase_payment_occurrences to authenticated');
    expect(migration).not.toContain('grant delete on public.supply_purchase_payment_occurrences to authenticated');
  });

  it('cria ocorrência automática sem substituir detalhamento manual ou de comprovante', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261004185423_purchase_payment_occurrence_defaults.sql'),
      'utf8',
    );
    expect(migration).toContain("source in ('manual', 'proof_backfill', 'payment_record')");
    expect(migration).toContain("occurrence.source in ('manual', 'proof_backfill')");
    expect(migration).toContain("source = 'payment_record'");
  });
});
