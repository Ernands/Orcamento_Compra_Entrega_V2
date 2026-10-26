import { formatBRL } from '../domain/supply-calculations';
import './finance-amount.css';

type FinanceAmountProps = { cents: bigint };

/** Non-wrapping, lossless BRL amount; keeps the official currency format for negatives. */
export function FinanceAmount({ cents }: FinanceAmountProps) {
  const formatted = formatBRL(cents);
  const negative = cents < 0n;
  const digits = formatted.replace(/^-?R\$\s*/, '');
  return (
    <strong className="finance-amount" title={formatted}>
      <span className="finance-amount__currency">{negative ? '-R$' : 'R$'}</span>
      <span className="finance-amount__digits">{digits}</span>
    </strong>
  );
}
