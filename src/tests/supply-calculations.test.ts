import { describe, expect, it } from 'vitest';
import {
  calculateQuoteLine,
  calculateQuoteTotals,
  formatBRL,
  moneyToCents,
} from '../domain/supply-calculations';

const baseLine = {
  quantity: '3',
  unitPrice: '10.50',
  discountAmount: '0',
  shippingType: 'informed' as const,
  shippingAmount: '5.25',
  otherCosts: '0',
};

describe('calculos de cotacao', () => {
  it('calcula quantidade, subtotal, frete, desconto e total em centavos', () => {
    const result = calculateQuoteLine({ ...baseLine, discountAmount: '1.25', otherCosts: '2' });
    expect(result.subtotalCents).toBe(3150n);
    expect(result.shippingCents).toBe(525n);
    expect(result.totalCents).toBe(3750n);
  });

  it('diferencia frete gratis de frete a consultar', () => {
    expect(
      calculateQuoteLine({ ...baseLine, shippingType: 'free', shippingAmount: '' }),
    ).toMatchObject({
      shippingCents: 0n,
      shippingPending: false,
    });
    expect(
      calculateQuoteLine({ ...baseLine, shippingType: 'pending', shippingAmount: '' }),
    ).toMatchObject({
      shippingCents: null,
      shippingPending: true,
    });
  });

  it('arredonda casas decimais e soma multiplos itens sem ponto flutuante', () => {
    const result = calculateQuoteTotals([
      {
        ...baseLine,
        quantity: '1.005',
        unitPrice: '10.01',
        shippingType: 'free',
        shippingAmount: '',
      },
      { ...baseLine, quantity: '2', unitPrice: '0.10', shippingType: 'free', shippingAmount: '' },
    ]);
    expect(result.itemsCents).toBe(1026n);
    expect(result.totalCents).toBe(1026n);
    expect(formatBRL(result.totalCents)).toBe('R$ 10,26');
  });

  it('aceita formatos monetarios usados em Obras e Servicos', () => {
    expect(moneyToCents('1234,56')).toBe(123456n);
    expect(moneyToCents('1234.56')).toBe(123456n);
    expect(moneyToCents('1.234,56')).toBe(123456n);
    expect(moneyToCents('1,234.56')).toBe(123456n);
    expect(moneyToCents('R$ 1.234,56')).toBe(123456n);
    expect(moneyToCents('12.345.678,90')).toBe(1234567890n);
    expect(moneyToCents('1.234.567')).toBe(123456700n);
  });

  it('mantem ponto decimal em valores monetarios simples', () => {
    expect(moneyToCents('10.50')).toBe(1050n);
    expect(moneyToCents('0.125')).toBe(13n);
  });
});
