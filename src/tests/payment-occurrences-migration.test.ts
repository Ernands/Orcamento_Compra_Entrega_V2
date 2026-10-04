import { describe, expect, it } from 'vitest';
import occurrenceMigration from '../../supabase/migrations/20261004183315_purchase_payment_occurrences.sql?raw';
import defaultMigration from '../../supabase/migrations/20261004185423_purchase_payment_occurrence_defaults.sql?raw';

describe('purchase payment occurrences migrations', () => {
  it('mantém RLS e escrita via RPC com checagem de edição', () => {
    expect(occurrenceMigration).toContain('enable row level security');
    expect(occurrenceMigration).toContain('app.can_read_supply_purchase(payment.purchase_id)');
    expect(occurrenceMigration).toContain('app.can_edit_supply_purchase(v_purchase_id)');
    expect(occurrenceMigration).toContain('grant select on table public.supply_purchase_payment_occurrences to authenticated');
    expect(occurrenceMigration).not.toContain('grant insert on table public.supply_purchase_payment_occurrences to authenticated');
    expect(occurrenceMigration).not.toContain('grant update on table public.supply_purchase_payment_occurrences to authenticated');
    expect(occurrenceMigration).not.toContain('grant delete on table public.supply_purchase_payment_occurrences to authenticated');
  });

  it('cria ocorrência automática sem substituir detalhamento manual ou de comprovante', () => {
    expect(defaultMigration).toContain("source in ('manual', 'proof_backfill', 'payment_record')");
    expect(defaultMigration).toContain("occurrence.source in ('manual', 'proof_backfill')");
    expect(defaultMigration).toContain("source = 'payment_record'");
  });
});
