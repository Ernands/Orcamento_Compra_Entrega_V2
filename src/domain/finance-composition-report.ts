import { buildFinanceStoreCompositionRows, buildFinanceStoreItemRows, financeItemCompositionGroup,
  type FinanceOverviewStoreRow, type FinanceStoreCompositionKey, type FinanceStoreCompositionRow,
} from './finance-overview';
import { purchaseOrderStoreCosts } from './purchase-v2-calculations';
import type { FinanceStoreRow } from './finance-types';
import type { PlannedBudgetItem } from './planned-budget-types';
import type { PurchaseV2 } from './purchase-v2-types';
import type { Store } from './types';
import type { WorkService } from './works-types';
import { serviceTotals } from './works-calculations';

export interface CompositionLine {
  id: string;
  storeId: string;
  storeLabel: string;
  storeCode: string;
  storeCity: string;
  storeState: string;
  kind: 'item' | 'work';
  group: FinanceStoreCompositionKey;
  reference: string;
  name: string;
  origin: string;
  status: 'Orçado' | 'Pago' | 'A pagar' | 'Parcialmente pago' | 'Não individualizado';
  budgetCents: bigint;
  realizedCents: bigint;
  paidCents: bigint | null;
  payableCents: bigint | null;
  paymentAllocationNote: string;
  purchaseCode?: string;
  supplierName?: string;
  quantityApproved?: bigint;
  quantityPurchased?: bigint;
  unit?: string;
  workStatus?: WorkService['status'];
  progressPercent?: number;
  documentCount: number;
  supplyItemId?: string;
  workServiceId?: string;
}
export type CompositionReportGroup = Pick<FinanceStoreCompositionRow,
  'key' | 'label' | 'budgetCents' | 'realizedCents' | 'differenceCents' | 'paidCents' | 'payableCents'>;
export interface CompositionReportTotals {
  budgetBbCents: bigint;
  budgetTotalCents: bigint;
  realizedTotalCents: bigint;
  realizedVarianceToBbCents: bigint;
  paidCents: bigint;
  payableCents: bigint;
  executionDifferenceCents: bigint;
}
export interface CompositionReport {
  totals: CompositionReportTotals;
  groups: CompositionReportGroup[];
  lines: CompositionLine[];
  storesCount: number;
  reconciliation: { budget: boolean; realized: boolean; paid: boolean; payable: boolean };
}

const sum = (items: bigint[]) => items.reduce((total, value) => total + value, 0n);
function emptyGroup(key: FinanceStoreCompositionKey, label: string): CompositionReportGroup {
  return { key, label, budgetCents: 0n, realizedCents: 0n,
    differenceCents: 0n, paidCents: 0n, payableCents: 0n };
}
const emptyGroups = (): CompositionReportGroup[] => [
  emptyGroup('equipment', 'Equipamentos'),
  emptyGroup('furniture', 'Mobiliário'),
  emptyGroup('works', 'Obras e Serviços'),
];
const payableStatus = (realized: bigint, paid: bigint): CompositionLine['status'] =>
  realized <= 0n ? 'Orçado' :
    paid >= realized ? 'Pago' : paid > 0n ? 'Parcialmente pago' : 'A pagar';

export function buildFinancialCompositionReport(input: {
  stores: Store[];
  selectedStoreId: string;
  overviewRows: FinanceOverviewStoreRow[];
  purchaseStoreRows: FinanceStoreRow[];
  purchases: PurchaseV2[];
  plannedBudgetItems: PlannedBudgetItem[];
  works: WorkService[];
}): CompositionReport {
  const selectedStores = input.selectedStoreId
    ? input.stores.filter((store) => store.id === input.selectedStoreId)
    : input.stores;
  const ids = new Set(selectedStores.map((store) => store.id));
  const overviews = input.overviewRows.filter((row) => ids.has(row.storeId));
  const totals: CompositionReportTotals = {
    budgetBbCents: sum(overviews.map((row) => row.budgetBbCents)),
    budgetTotalCents: sum(overviews.map((row) => row.budgetTotalCents)),
    realizedTotalCents: sum(overviews.map((row) => row.realizedTotalCents)),
    realizedVarianceToBbCents: sum(overviews.map((row) => row.realizedVarianceToBbCents)),
    paidCents: sum(overviews.map((row) => row.paidCents)),
    payableCents: sum(overviews.map((row) => row.payableCents)),
    executionDifferenceCents: 0n,
  };
  totals.executionDifferenceCents = totals.realizedTotalCents - totals.budgetTotalCents;
  const groups = emptyGroups();
  const lines: CompositionLine[] = [];
  const purchaseByStore = new Map(input.purchaseStoreRows.map((row) => [row.storeId, row]));
  const worksByStore = new Map<string, WorkService[]>();
  input.works.filter((work) => work.status !== 'cancelled' && ids.has(work.storeId))
    .forEach((work) => {
      const current = worksByStore.get(work.storeId) || [];
      current.push(work);
      worksByStore.set(work.storeId, current);
    });

  selectedStores.forEach((store) => {
    const label = `${store.code} · ${store.city}/${store.state}`;
    const storeWorks = worksByStore.get(store.id) || [];
    const financialStore = purchaseByStore.get(store.id);

    // A shared accounting source: exactly the same per-store grouping as Detalhe da Loja.
    buildFinanceStoreCompositionRows({
      storeId: store.id,
      purchases: input.purchases,
      plannedBudgetItems: input.plannedBudgetItems,
      purchaseStoreRows: input.purchaseStoreRows,
      works: input.works,
    }).forEach((row) => {
      const target = groups.find((group) => group.key === row.key)!;
      target.budgetCents += row.budgetCents;
      target.realizedCents += row.realizedCents;
      target.differenceCents += row.differenceCents;
      target.paidCents += row.paidCents;
      target.payableCents += row.payableCents;
    });

    // Paid amounts in multi-item purchase orders have a store-level allocation,
    // but no directly recorded per-item split. Only attribute a payment to an
    // item if that store/order contains exactly one uniquely identified item.
    const exactPaidByItem = new Map<string, bigint>();
    const exactRealizedByItem = new Map<string, bigint>();
    financialStore?.purchases.forEach((purchaseRow) => {
      const order = purchaseRow.purchase.orders.find((candidate) =>
        candidate.id === purchaseRow.purchaseOrderId && candidate.status === 'active');
      if (!order) return;
      const storeCosts = purchaseOrderStoreCosts(order).rows.find((cost) =>
        cost.storeId === store.id);
      if (!storeCosts || !storeCosts.lines.length) return;
      const candidateIds = storeCosts.lines.map((costLine) => {
        const orderLine = order.lines.find((line) => line.id === costLine.lineId);
        return purchaseRow.purchase.items.find((item) => item.id === orderLine?.purchaseItemId)?.supplyItemId;
      });
      if (candidateIds.some((candidate) => !candidate)) return;
      const only = [...new Set(candidateIds)][0];
      if (!only || new Set(candidateIds).size !== 1) return;
      exactPaidByItem.set(only, (exactPaidByItem.get(only) || 0n) + purchaseRow.paidCents);
      exactRealizedByItem.set(only, (exactRealizedByItem.get(only) || 0n) + purchaseRow.realizedCents);
    });

    buildFinanceStoreItemRows(input.purchases, input.plannedBudgetItems, store.id)
      .forEach((item) => {
        const group = financeItemCompositionGroup(item.itemCategory, item.itemSubcategory,
          item.itemGroupName, item.itemName, item.itemFinancialGroup || null);
        const uniquelyAttributed = item.realizedCents === 0n ||
          (exactRealizedByItem.get(item.supplyItemId) || 0n) === item.realizedCents;
        const paidCents = item.realizedCents === 0n ? 0n :
          uniquelyAttributed ? exactPaidByItem.get(item.supplyItemId) || 0n : null;
        const payableCents = paidCents === null ? null :
          item.realizedCents > paidCents ? item.realizedCents - paidCents : 0n;
        // A purchase attachment is associated with a purchase or order and
        // may be shared by multiple items; counts are deliberately not inferred.
        lines.push({
          id: `item:${store.id}:${item.supplyItemId}`,
          storeId: store.id, storeLabel: label, storeCode: store.code,
          storeCity: store.city, storeState: store.state,
          kind: 'item', group, reference: item.itemCode, name: item.itemName,
          origin: [item.purchaseCode, item.supplierName].filter(Boolean).join(' · ') || 'Orçamento previsto',
          budgetCents: item.budgetCents, realizedCents: item.realizedCents,
          paidCents, payableCents,
          status: paidCents === null ? 'Não individualizado' : payableStatus(item.realizedCents, paidCents),
          paymentAllocationNote: paidCents === null
            ? 'Pagamento registrado por compra/pedido com vários itens, sem divisão individual comprovada.'
            : 'Pagamento identificado sem divisão presumida entre itens.',
          purchaseCode: item.purchaseCode, supplierName: item.supplierName,
          quantityApproved: item.approvedQuantity, quantityPurchased: item.purchasedQuantity,
          unit: item.unit, documentCount: 0, supplyItemId: item.supplyItemId,
        });
      });

    storeWorks.forEach((work) => {
      const values = serviceTotals(work);
      lines.push({
        id: `work:${work.id}`,
        storeId: store.id, storeLabel: label, storeCode: store.code,
        storeCity: store.city, storeState: store.state, kind: 'work', group: 'works',
        reference: work.code, name: `${work.category} · ${work.description}`,
        origin: work.providerName || 'Prestador não informado',
        budgetCents: values.budgetCents, realizedCents: values.contractedCents,
        paidCents: values.paidCents, payableCents: values.payableCents,
        status: payableStatus(values.contractedCents, values.paidCents),
        paymentAllocationNote: 'Valores originados diretamente dos pagamentos deste serviço.',
        workStatus: work.status, progressPercent: work.progressPercent,
        documentCount: work.documents.length, workServiceId: work.id,
      });
    });
  });
  lines.sort((a,b) => a.group.localeCompare(b.group) ||
    a.storeCode.localeCompare(b.storeCode, 'pt-BR') || a.reference.localeCompare(b.reference,'pt-BR'));

  return {
    totals, groups, lines, storesCount: selectedStores.length,
    reconciliation: {
      budget: sum(groups.map((group) => group.budgetCents)) === totals.budgetTotalCents,
      realized: sum(groups.map((group) => group.realizedCents)) === totals.realizedTotalCents,
      paid: sum(groups.map((group) => group.paidCents)) === totals.paidCents,
      // The existing group-level payable formula is applied before summation.
      // A store-level payable is calculated after summation, so the two may
      // differ in overpayment cases. Never overwrite either source value.
      payable: sum(groups.map((group) => group.payableCents)) === totals.payableCents,
    },
  };
}
