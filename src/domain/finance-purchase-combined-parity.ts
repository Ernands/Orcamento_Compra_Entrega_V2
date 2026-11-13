import type { UnifiedFinancePaymentRow } from './finance-payments';
import type { FinancePurchaseCombinedPage, FinancePurchaseCombinedGroup } from '../data/finance/finance-purchase-combined-repository';

/**
 * Exact comparison against legacy consolidatePurchaseRows(): event IDs,
 * statuses, grouping keys, references and cents must all agree.
 * All pages must be present, not merely identical grand totals.
 */
export function assertCombinedPurchaseParity(
  canonicalRows: UnifiedFinancePaymentRow[],
  totals: Pick<FinancePurchaseCombinedPage, 'totalCount'|'isComplete'|'amountCentsTotal'>,
  projected: FinancePurchaseCombinedGroup[],
): void {
  if (!totals.isComplete) {
    throw new Error('Consulta de compras combinadas incompleta.');
  }
  if (projected.length !== totals.totalCount) {
    throw new Error('Grupos de CMPs com páginas faltantes.');
  }
  const current = canonicalRows.filter((row) => row.id.startsWith('combined:') &&
    row.workServiceId === null);
  if (current.length !== projected.length) {
    throw new Error('Quantidade de grupos de CMPs difere do financeiro atual.');
  }
  const currentById = new Map(current.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let amount = 0n;
  for (const group of projected) {
    if (seen.has(group.id)) throw new Error('Grupo financeiro duplicado: '+group.id);
    seen.add(group.id);
    const row = currentById.get(group.id);
    if (!row) throw new Error('Grupo de CMPs ausente no cálculo atual: ' + group.id);
    const sourceIds = row.id.slice('combined:'.length).split('|').sort();
    const projectedIds = [...group.sourceEventIds].sort();
    const refs = [...row.referenceCodes].sort();
    if (JSON.stringify(sourceIds) !== JSON.stringify(projectedIds) ||
        JSON.stringify(refs) !== JSON.stringify([...group.referenceCodes].sort()) ||
        group.eventCount !== sourceIds.length ||
        group.purchaseCount !== row.purchaseIds.length ||
        group.status !== row.status || group.date !== row.date ||
        group.supplierName !== row.supplierName ||
        group.paymentMethod !== row.paymentMethod ||
        group.sourceLabel !== row.sourceLabel ||
        group.amountCents !== row.amountCents) {
      throw new Error('Centavos ou critérios de agrupamento divergentes: ' + group.id);
    }
    amount += group.amountCents;
  }
  if (amount !== totals.amountCentsTotal) {
    throw new Error('Total dos grupos de CMPs diverge em centavos.');
  }
}
