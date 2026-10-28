/** Funções puras de rateio sem dados de compras nem dependência do ambiente. */
export interface FreightProrationLine {
  id: string;
  code: string;
  description: string;
  originalFreightCents: number;
  reductionCents: number;
  adjustedFreightCents: number;
  originalTotalCents: number;
  adjustedTotalCents: number;
}

/**
 * Rateio pelo método das maiores sobras, sobre os fretes de linhas mantidas.
 * Usa inteiros BigInt para que o somatório seja exatamente igual aos centavos
 * requeridos, sem frete negativo nem distorção de preço unitário.
 */
export function prorateFreightReduction(
  lines: ReadonlyArray<{ id: string; code: string; description: string; shippingCents: number; totalCents: number }>,
  reductionCents: number,
): FreightProrationLine[] {
  if (!Number.isSafeInteger(reductionCents) || reductionCents < 0) {
    throw new Error('O ajuste de frete deve ser um valor não negativo em centavos inteiros.');
  }
  const originalFreightCents = lines.reduce((sum, line) => sum + line.shippingCents, 0);
  if (lines.some((line) => !Number.isSafeInteger(line.shippingCents) || line.shippingCents < 0) ||
      !Number.isSafeInteger(originalFreightCents) || reductionCents > originalFreightCents) {
    throw new Error('O ajuste supera o frete disponível dos itens mantidos.');
  }
  if (originalFreightCents === 0) {
    if (reductionCents) throw new Error('Não há frete disponível para ratear.');
    return lines.map((line) => ({
      id: line.id, code: line.code, description: line.description,
      originalFreightCents: 0, reductionCents: 0, adjustedFreightCents: 0,
      originalTotalCents: line.totalCents, adjustedTotalCents: line.totalCents,
    }));
  }
  const total = BigInt(originalFreightCents);
  const reduction = BigInt(reductionCents);
  const provisional = lines.map((line, index) => {
    const numerator = BigInt(line.shippingCents) * reduction;
    return {
      line, index, base: Number(numerator / total), remainder: numerator % total,
    };
  });
  let centsRemaining = reductionCents - provisional.reduce((sum, item) => sum + item.base, 0);
  // Mesmo critério aplicado pelo banco: maior sobra, depois ID estável.
  const sorted = [...provisional].sort((a, b) =>
    a.remainder === b.remainder
      ? a.line.id.localeCompare(b.line.id)
      : a.remainder > b.remainder ? -1 : 1);
  const extras = new Set(sorted.slice(0, centsRemaining).map((item) => item.index));
  const result = provisional.map(({ line, index, base }) => {
    const reductionAmount = base + (extras.has(index) ? 1 : 0);
    return {
      id: line.id, code: line.code, description: line.description,
      originalFreightCents: line.shippingCents,
      reductionCents: reductionAmount,
      adjustedFreightCents: line.shippingCents - reductionAmount,
      originalTotalCents: line.totalCents,
      adjustedTotalCents: line.totalCents - reductionAmount,
    };
  });
  centsRemaining -= extras.size;
  if (centsRemaining !== 0 ||
      result.some((line) => line.adjustedFreightCents < 0) ||
      result.reduce((sum, line) => sum + line.reductionCents, 0) !== reductionCents) {
    throw new Error('Não foi possível fechar o rateio de frete por centavos.');
  }
  return result;
}


/** Aceita R$ em formato brasileiro (ex. 651,99), sem arredondar valores informados. */
export function parseRefundBRL(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) return null;
  const [reais, centavos = ''] = normalized.replace(/\./g, '').split(',');
  const cents = Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function moneyBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

