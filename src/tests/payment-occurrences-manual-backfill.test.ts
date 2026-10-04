import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('manual proof backfill', () => {
  it('não altera valores oficiais e exige correspondência exata dos comprovantes', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'supabase/manual/20261004_purchase_payment_occurrences_proof_backfill.sql'),
      'utf8',
    );
    expect(script).toContain('attachment.original_name = source.attachment_name');
    expect(script).toContain("payment.status = 'paid'");
    expect(script).toContain("occurrence.source = 'manual'");
    expect(script).toContain("occurrence.source in ('payment_record', 'proof_backfill')");
    expect(script).not.toMatch(/update\s+public\.supply_purchase_payments/i);
    expect(script).not.toMatch(/update\s+public\.supply_purchases/i);
    expect(script).toContain("('CMP-00043', 'Comprovante_Extintor - PE (2).pdf'");
    expect(script).not.toContain("('CMP-00054',");
  });
});
