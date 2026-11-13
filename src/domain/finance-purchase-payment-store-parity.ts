import type { UnifiedFinancePaymentRow } from './finance-payments';
import type {
  FinancePaymentStoreOriginSqlEvent,
  FinancePaymentStoreOriginSqlPage,
} from '../data/finance/finance-purchase-payment-store-origins-repository';

type FinanceOrigin = 'equipment' | 'furniture' | 'works';
const ORIGINS: FinanceOrigin[] = ['equipment','furniture','works'];
interface Totals {
  amount: bigint;
  origins: Record<FinanceOrigin,bigint>;
}
function empty(): Totals {
  return { amount: 0n, origins: { equipment: 0n, furniture: 0n, works: 0n } };
}

/**
 * Compare the ENTIRE set of raw events to the current official financial
 * rows, including CMP consolidation and every store's origin-cent balance.
 * This audit never mutates payments, stores or documents.
 */
export function assertFinancePaymentStoreParity(
  canonicalRows: UnifiedFinancePaymentRow[],
  page: Pick<FinancePaymentStoreOriginSqlPage,'isComplete'|'totalCount'>,
  events: FinancePaymentStoreOriginSqlEvent[],
): void {
  if (!page.isComplete) throw new Error('Rateio SQL por loja/origem incompleto.');
  if (page.totalCount !== events.length) {
    throw new Error('Páginas de pagamentos por loja/origem faltantes.');
  }
  const byId = new Map(events.map(e=>[e.id,e]));
  if (byId.size !== events.length) {
    throw new Error('Evento de pagamento repetido na distribuição SQL por loja.');
  }
  const rows = canonicalRows.filter(row =>
    row.workServiceId === null && row.status !== 'unscheduled');
  const covered = new Set<string>();
  for (const row of rows) {
    const eventIds = row.id.startsWith('combined:')
      ? row.id.slice('combined:'.length).split('|') : [row.id];
    const byStore = new Map<string, Totals>();
    let amount = 0n;
    let allocated = 0n;
    let unallocated = 0n;
    for (const id of eventIds) {
      if (covered.has(id)) throw new Error('Evento SQL reutilizado por duas CMPs: '+id);
      covered.add(id);
      const e = byId.get(id);
      if (!e) throw new Error('Evento SQL não encontrado para '+id);
      if (row.status !== e.status || row.date !== e.date ||
          !row.purchaseIds.includes(e.purchaseId) ||
          !row.referenceCodes.includes(e.referenceCode) ||
          (e.orderId !== null && !row.purchaseOrderIds.includes(e.orderId))) {
        throw new Error('Vínculo de compra/pedido/status/data divergente: '+id);
      }
      amount += e.amountCents;
      allocated += e.allocatedCents;
      unallocated += e.unallocatedCents;
      for (const store of e.stores) {
        const key = store.storeId;
        const current = byStore.get(key) || empty();
        current.amount += store.amountCents;
        current.origins.equipment += store.equipmentCents;
        current.origins.furniture += store.furnitureCents;
        current.origins.works += store.worksCents;
        byStore.set(key,current);
      }
    }
    if (row.amountCents !== amount ||
        row.unallocatedCents !== unallocated ||
        row.storeAllocations.reduce((sum,s)=>sum+s.amountCents,0n) !== allocated ||
        row.storeAllocations.length !== byStore.size) {
      throw new Error('Montantes por loja ou não alocados divergentes: '+row.id);
    }
    for (const store of row.storeAllocations) {
      const projected = byStore.get(store.storeId);
      if (!projected || projected.amount !== store.amountCents ||
          ORIGINS.some(origin =>
            projected.origins[origin] !== store.originAllocations[origin])) {
        throw new Error('Rateio de pagamento por loja/origem diverge: '+row.id+'/'+store.storeId);
      }
    }
  }
  if (covered.size !== byId.size) {
    throw new Error('Eventos de pagamento SQL não utilizados pelo cálculo financeiro atual.');
  }
}
