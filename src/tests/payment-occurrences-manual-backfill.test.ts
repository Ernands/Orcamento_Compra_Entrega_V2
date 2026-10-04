import { describe, expect, it } from 'vitest';
import backfillScript from '../../supabase/manual/20261004_purchase_payment_occurrences_proof_backfill.sql?raw';

describe('manual proof backfill', () => {
  it('não altera valores oficiais e exige correspondência exata dos comprovantes', () => {
    expect(backfillScript).toContain('attachment.original_name = source.attachment_name');
    expect(backfillScript).toContain("payment.status = 'paid'");
    expect(backfillScript).toContain("occurrence.source = 'manual'");
    expect(backfillScript).toContain("occurrence.source in ('payment_record', 'proof_backfill')");
    expect(backfillScript).not.toMatch(/update\s+public\.supply_purchase_payments/i);
    expect(backfillScript).not.toMatch(/update\s+public\.supply_purchases/i);
    expect(backfillScript).toContain("('CMP-00043', 'Comprovante_Extintor - PE (2).pdf'");
    expect(backfillScript).not.toContain("('CMP-00054',");
  });
});
