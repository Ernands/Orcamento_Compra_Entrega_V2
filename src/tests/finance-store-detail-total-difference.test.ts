import { describe, expect, it } from 'vitest';
import storeDetail from '../pages/finance-store-detail-page.tsx?raw';

describe('Financeiro > Visão por Loja > Total da loja', () => {
  const totalRow = storeDetail
    .split('<tr className="finance-store-detail__composition-total">')[1]
    ?.split('</tr>')[0];

  it('calcula a diferença do total realizado contra o orçado, sem usar verba BB', () => {
    expect(storeDetail).toContain(
      'const executionDifferenceCents = overview.realizedTotalCents - overview.budgetTotalCents;',
    );
    expect(totalRow).toContain('{formatBRL(executionDifferenceCents)}');
    expect(totalRow).not.toContain('realizedVarianceToBbCents');
    expect(totalRow).toContain('title="Total realizado menos total orçado"');
  });

  it('mostra R$ 1.280,64 de diferença em vez de -R$ 15.567,95 para o exemplo informado', () => {
    const budgetBbCents = 5_000_000n;
    const realizedCents = 6_556_795n;
    const budgetCents = 6_428_731n;
    expect(budgetBbCents - realizedCents).toBe(-1_556_795n);
    expect(realizedCents - budgetCents).toBe(128_064n);
  });

  it('sinaliza valor acima do orçamento com a classe de ultrapassagem', () => {
    expect(totalRow).toContain("executionDifferenceCents > 0n ? 'value-negative' : 'value-positive'");
  });
});
