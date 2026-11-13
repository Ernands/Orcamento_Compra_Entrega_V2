import type { PurchaseV2 } from './purchase-v2-types';
import { purchaseOrderStoreCosts, purchaseOrderTotalCents } from './purchase-v2-calculations';
import type {
  FinancePurchaseOrderCostPage, FinancePurchaseOrderCostRow,
} from '../data/finance/finance-purchase-store-costs-repository';

/**
 * Compare the entire SQL read model with the existing per-order store-cost
 * algorithm. Approval requires every order and every store, including
 * explicitly unallocated money; not just matching the grand total.
 */
export function assertPurchaseStoreCostParity(
  purchases: PurchaseV2[],
  totals: Pick<FinancePurchaseOrderCostPage,
    'isComplete' | 'totalCount' | 'totalContractedCents' | 'totalAllocatedCents'>,
  rows: FinancePurchaseOrderCostRow[],
): void {
  if (!totals.isComplete) {
    throw new Error('Rateio SQL excluiu compras e não permite aprovar a migração.');
  }
  if (rows.length !== totals.totalCount) {
    throw new Error('A leitura SQL do rateio não contém todas as páginas.');
  }
  const orders = new Map(purchases
    .filter((p) => p.status !== 'cancelled' && p.status !== 'returned')
    .flatMap((p) => p.orders.filter((o) => o.status === 'active')
      .map((o) => [o.id, { purchase: p, order: o }] as const)));
  if (orders.size !== rows.length) {
    throw new Error('Quantidade de pedidos SQL difere do domínio de Compras.');
  }
  const seen = new Set<string>();
  let contracted = 0n;
  let allocated = 0n;
  for (const row of rows) {
    if (seen.has(row.orderId)) throw new Error('Pedido SQL repetido: ' + row.orderId);
    seen.add(row.orderId);
    const entry = orders.get(row.orderId);
    if (!entry || entry.purchase.id !== row.purchaseId ||
        entry.purchase.code !== row.referenceCode) {
      throw new Error('Pedido do rateio não encontrado no cálculo atual: ' + row.orderId);
    }
    const expected = purchaseOrderStoreCosts(entry.order);
    const cost = purchaseOrderTotalCents(entry.order);
    if (cost === null || cost !== row.contractedCents ||
        expected.unallocatedCents !== row.unallocatedCents ||
        expected.rows.length !== row.stores.length) {
      throw new Error('Contratação ou custo não alocado divergente: ' + row.orderId);
    }
    const sourceStores = new Map(expected.rows.map((s) => [s.storeId, s.costCents]));
    const compared = new Set<string>();
    for (const store of row.stores) {
      if (compared.has(store.storeId) ||
          sourceStores.get(store.storeId) !== store.costCents) {
        throw new Error('Rateio de centavos por loja divergente: ' + row.orderId +
          ' / ' + store.storeId);
      }
      compared.add(store.storeId);
    }
    if (row.allocatedCents !== row.stores.reduce((sum, s) => sum + s.costCents, 0n) ||
        row.allocatedCents + row.unallocatedCents !== row.contractedCents) {
      throw new Error('Soma dos rateios diverge do pedido: ' + row.orderId);
    }
    contracted += row.contractedCents;
    allocated += row.allocatedCents;
  }
  if (contracted !== totals.totalContractedCents ||
      allocated !== totals.totalAllocatedCents) {
    throw new Error('Totais SQL de custo por loja não conciliam em centavos.');
  }
}
