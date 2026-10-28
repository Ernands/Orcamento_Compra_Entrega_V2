import { describe, expect, it } from 'vitest';
import { prorateFreightReduction, parseRefundBRL } from '../domain/purchase-freight-proration';

describe('rateio proporcional de frete em centavos', () => {
  it('distribui centavos restantes pelas maiores sobras e ID estável', () => {
    const lines = [
      { id: 'a', code: 'A', description: 'A', shippingCents: 100, totalCents: 200 },
      { id: 'b', code: 'B', description: 'B', shippingCents: 100, totalCents: 200 },
      { id: 'c', code: 'C', description: 'C', shippingCents: 100, totalCents: 200 },
    ];
    const result = prorateFreightReduction(lines, 101);
    expect(result.map((x) => x.reductionCents)).toEqual([34,34,33]);
    expect(result.map((x) => x.adjustedFreightCents)).toEqual([66,66,67]);
    expect(result.reduce((sum,x) => sum+x.reductionCents,0)).toBe(101);
    expect(result.reduce((sum,x) => sum+x.adjustedTotalCents,0)).toBe(499);
  });

  it('comportamento de frete zero, rateio integral e limite máximo', () => {
    const lines = [
      { id:'sem-frete',code:'A',description:'A',shippingCents:0,totalCents:30 },
      { id:'com-frete',code:'B',description:'B',shippingCents:100,totalCents:200 },
    ];
    const all=prorateFreightReduction(lines,100);
    expect(all[0].reductionCents).toBe(0);
    expect(all[1].adjustedFreightCents).toBe(0);
    expect(() => prorateFreightReduction(lines,101)).toThrow('supera o frete');
    expect(() => prorateFreightReduction(lines,-1)).toThrow('não negativo');
  });

  it('aceita números em centavos em formato brasileiro', () => {
    expect(parseRefundBRL('651,99')).toBe(65199);
    expect(parseRefundBRL('1.220,40')).toBe(122040);
    expect(parseRefundBRL('568,41')).toBe(56841);
    expect(parseRefundBRL('568,4')).toBe(56840);
    expect(parseRefundBRL('651,999')).toBeNull();
    expect(parseRefundBRL('R$ 500')).toBeNull();
  });
});
