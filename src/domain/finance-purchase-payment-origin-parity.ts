import type { UnifiedFinancePaymentRow } from './finance-payments';
import type { FinancePurchaseOriginPage, FinancePurchaseOriginEvent } from '../data/finance/finance-purchase-payment-origins-repository';

/**
 * Per-event comparison after the legacy domain has optionally combined
 * CMP events. Full coverage is required; no group may hide a missing event.
 */
export function assertPurchasePaymentOriginParity(
  canonicalRows: UnifiedFinancePaymentRow[],
  totals: Pick<FinancePurchaseOriginPage, 'isComplete' | 'totalCount'>,
  projected: FinancePurchaseOriginEvent[],
): void {
  if (!totals.isComplete) {
    throw new Error('Rateio SQL de origens financeiras exclui compras.');
  }
  if (projected.length !== totals.totalCount) {
    throw new Error('Rateio de origens com páginas faltantes.');
  }
  const projectedById = new Map(projected.map((e) => [e.id, e]));
  if (projectedById.size !== projected.length) {
    throw new Error('Pagamento duplicado na classificação SQL por origem.');
  }
  const canonical = canonicalRows.filter((row) =>
    row.workServiceId === null && row.status !== 'unscheduled');
  const covered = new Set<string>();
  for (const row of canonical) {
    const ids = row.id.startsWith('combined:')
      ? row.id.slice('combined:'.length).split('|') : [row.id];
    let amount = 0n;
    let equipment = 0n;
    let furniture = 0n;
    let works = 0n;
    for (const id of ids) {
      if (covered.has(id)) {
        throw new Error('Pagamento duplicado em grupos da origem SQL: '+id);
      }
      covered.add(id);
      const event = projectedById.get(id);
      if (!event || event.status !== row.status || event.date !== row.date) {
        throw new Error('Evento não conciliado entre classificação SQL e Financeiro: '+id);
      }
      if (!row.purchaseIds.includes(event.purchaseId) ||
          !row.referenceCodes.includes(event.referenceCode) ||
          (event.orderId !== null && !row.purchaseOrderIds.includes(event.orderId))) {
        throw new Error('Vínculo CMP/pedido divergente na classificação SQL: '+id);
      }
      if (event.unallocatedOriginCents < 0n ||
          event.amountCents !== event.equipmentCents + event.furnitureCents +
            event.worksCents + event.unallocatedOriginCents) {
        throw new Error('Conservação de centavos por origem inválida: '+id);
      }
      amount += event.amountCents;
      equipment += event.equipmentCents;
      furniture += event.furnitureCents;
      works += event.worksCents;
    }
    if (row.amountCents !== amount ||
        row.originAllocations.equipment !== equipment ||
        row.originAllocations.furniture !== furniture ||
        row.originAllocations.works !== works) {
      throw new Error('Classificação por origem financeira diverge em centavos: '+row.id);
    }
  }
  if (covered.size !== projectedById.size) {
    throw new Error('Eventos SQL de origem financeira não usados no cálculo atual.');
  }
}
