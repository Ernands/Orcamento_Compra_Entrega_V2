import { describe, expect, it } from 'vitest';
import { calculateQuoteLine, calculateQuoteTotals, formatBRL } from '../domain/supply-calculations';

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
});
