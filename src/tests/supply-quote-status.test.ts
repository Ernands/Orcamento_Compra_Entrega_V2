import { describe, expect, it } from 'vitest';
import {
  getEffectiveSupplyQuoteStatus,
  isSupplyQuoteEligibleForComparison,
} from '../domain/supply-quote-status';

describe('supply quote effective status', () => {
  it('trata validade como data civil e expira somente depois do dia limite', () => {
    expect(
      getEffectiveSupplyQuoteStatus({ status: 'received', validUntil: '2026-08-16' }, '2026-08-17'),
    ).toBe('expired');
    expect(
      getEffectiveSupplyQuoteStatus({ status: 'received', validUntil: '2026-08-17' }, '2026-08-17'),
    ).toBe('received');
  });

  it('mantem recebida sem validade elegivel e respeita status terminal persistido', () => {
    expect(
      isSupplyQuoteEligibleForComparison({ status: 'received', validUntil: null }, '2026-08-17'),
    ).toBe(true);
    expect(
      isSupplyQuoteEligibleForComparison(
        { status: 'expired', validUntil: '2099-12-31' },
        '2026-08-17',
      ),
    ).toBe(false);
    expect(
      isSupplyQuoteEligibleForComparison({ status: 'cancelled', validUntil: null }, '2026-08-17'),
    ).toBe(false);
    expect(
      isSupplyQuoteEligibleForComparison({ status: 'draft', validUntil: null }, '2026-08-17'),
    ).toBe(false);
  });
});
