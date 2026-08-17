import type { SupplyQuote, SupplyQuoteStatus } from './types';

function localCivilDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getEffectiveSupplyQuoteStatus(
  quote: Pick<SupplyQuote, 'status' | 'validUntil'>,
  today = localCivilDate(new Date()),
): SupplyQuoteStatus {
  if (quote.status === 'received' && quote.validUntil && quote.validUntil < today) return 'expired';
  return quote.status;
}

export function isSupplyQuoteEligibleForComparison(
  quote: Pick<SupplyQuote, 'status' | 'validUntil'>,
  today?: string,
): boolean {
  return getEffectiveSupplyQuoteStatus(quote, today) === 'received';
}
