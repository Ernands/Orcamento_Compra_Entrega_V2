import type { SupplyQuoteItem, SupplyQuoteItemValues } from './types';

type DecimalInput = string | number;

function normalizeDecimal(value: DecimalInput): string {
  const raw = String(value).trim().replace(/\s/g, '');
  if (!raw) return '0';
  if (raw.includes(',') && raw.includes('.')) return raw.replace(/\./g, '').replace(',', '.');
  return raw.replace(',', '.');
}

export function decimalToScaledInteger(value: DecimalInput, scale: number): bigint {
  const normalized = normalizeDecimal(value);
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error('Valor decimal invalido');

  const [, sign, whole, fraction = ''] = match;
  const padded = `${fraction}${'0'.repeat(scale + 1)}`;
  const kept = padded.slice(0, scale);
  const nextDigit = Number(padded[scale] || '0');
  let result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(kept || '0');
  if (nextDigit >= 5) result += 1n;
  return sign ? -result : result;
}

export function moneyToCents(value: DecimalInput): bigint {
  return decimalToScaledInteger(value, 2);
}

export function quantityToThousandths(value: DecimalInput): bigint {
  return decimalToScaledInteger(value, 3);
}

function roundedDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

export interface QuoteLineCalculation {
  subtotalCents: bigint;
  shippingCents: bigint | null;
  otherCostsCents: bigint;
  discountCents: bigint;
  totalCents: bigint;
  shippingPending: boolean;
}

type CalculableLine = Pick<
  SupplyQuoteItem | SupplyQuoteItemValues,
  'quantity' | 'unitPrice' | 'discountAmount' | 'shippingType' | 'shippingAmount' | 'otherCosts'
>;

export function calculateQuoteLine(line: CalculableLine): QuoteLineCalculation {
  const subtotalCents = roundedDivide(
    quantityToThousandths(line.quantity) * moneyToCents(line.unitPrice),
    1000n,
  );
  const shippingPending = line.shippingType === 'pending';
  const shippingCents = shippingPending
    ? null
    : line.shippingType === 'free'
      ? 0n
      : moneyToCents(line.shippingAmount || 0);
  const otherCostsCents = moneyToCents(line.otherCosts || 0);
  const discountCents = moneyToCents(line.discountAmount || 0);

  return {
    subtotalCents,
    shippingCents,
    otherCostsCents,
    discountCents,
    totalCents: subtotalCents + (shippingCents || 0n) + otherCostsCents - discountCents,
    shippingPending,
  };
}

export function calculateQuoteTotals(lines: CalculableLine[]) {
  return lines.reduce(
    (totals, line) => {
      const current = calculateQuoteLine(line);
      return {
        itemsCents: totals.itemsCents + current.subtotalCents,
        shippingCents: totals.shippingCents + (current.shippingCents || 0n),
        otherCostsCents: totals.otherCostsCents + current.otherCostsCents,
        discountCents: totals.discountCents + current.discountCents,
        totalCents: totals.totalCents + current.totalCents,
        shippingPending: totals.shippingPending || current.shippingPending,
      };
    },
    {
      itemsCents: 0n,
      shippingCents: 0n,
      otherCostsCents: 0n,
      discountCents: 0n,
      totalCents: 0n,
      shippingPending: false,
    },
  );
}

export function formatBRL(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${grouped},${fraction}`;
}
