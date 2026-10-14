import { describe, expect, it } from 'vitest';
import {
  financeOverviewActivityStoreIds,
  financePaymentActivityStoreIds,
  filterInactiveStoresWithoutFinancialValues,
} from '../domain/finance-store-visibility';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import type { FinanceStoreRow } from '../domain/finance-types';
import type { UnifiedFinancePaymentRow } from '../domain/finance-payments';
import type { Store } from '../domain/types';

const store = (id: string, status: Store['status']): Store => ({
  id,
  code: id,
  name: id,
  city: 'Natal',
  state: 'RN',
  address: null,
  responsibleUserId: null,
  responsibleName: null,
  plannedOpeningDate: null,
  notes: null,
  status,
});

function overview(storeId: string, values: Partial<FinanceOverviewStoreRow> = {}): FinanceOverviewStoreRow {
  return {
    storeId,
    code: storeId,
    name: storeId,
    city: 'Natal',
    state: 'RN',
    budgetBbCents: 0n,
    equipmentBudgetCents: 0n,
    furnitureBudgetCents: 0n,
    itemsBudgetCents: 0n,
    worksBudgetCents: 0n,
    budgetTotalCents: 0n,
    budgetVarianceToBbCents: 0n,
    equipmentRealizedCents: 0n,
    furnitureRealizedCents: 0n,
    itemsRealizedCents: 0n,
    worksContractedCents: 0n,
    realizedTotalCents: 0n,
    realizedVarianceToBbCents: 0n,
    differenceCents: 0n,
    paidCents: 0n,
    payableCents: 0n,
    worksDocumentedCents: 0n,
    worksMissingDocumentsCents: 0n,
    documentationStatus: 'none',
    ...values,
  };
}

describe('lojas inativas sem valores financeiros', () => {
  const stores = [
    store('LOJ-022', 'inactive'),
    store('LOJ-028', 'inactive'),
    store('LOJ-001', 'active'),
    store('LOJ-009', 'planning'),
    store('LOJ-012', 'inactive'),
  ];

  it('oculta somente as lojas inativas zeradas da Visão Geral, sem esconder lojas ativas zeradas', () => {
    const overviewRows = [
      overview('LOJ-022'),
      overview('LOJ-028'),
      overview('LOJ-001'),
      overview('LOJ-009'),
      overview('LOJ-012', { worksContractedCents: 1248500n }),
    ];
    const visible = filterInactiveStoresWithoutFinancialValues(
      stores,
      financeOverviewActivityStoreIds(overviewRows, []),
    );
    expect(visible.map((row) => row.id)).toEqual(['LOJ-001', 'LOJ-009', 'LOJ-012']);
    expect(overviewRows).toHaveLength(5); // the data is not deleted or mutated
  });

  it.each([
    ['verba BB', { budgetBbCents: 5000000n }],
    ['orçamento previsto', { furnitureBudgetCents: 5000n }],
    ['realizado equipamentos', { equipmentRealizedCents: 1800n }],
    ['obra orçada', { worksBudgetCents: 100000n }],
    ['pagamento', { paidCents: 200n }],
  ] as const)('mantém loja inativa com %s registrado', (_, values) => {
    const ids = financeOverviewActivityStoreIds([overview('LOJ-022', values)], []);
    expect(filterInactiveStoresWithoutFinancialValues(stores, ids).some((s) => s.id === 'LOJ-022'))
      .toBe(true);
  });

  it('mantém loja inativa se houver reembolso mesmo com Visão Geral zerada', () => {
    const purchaseStoreRows = [{
      storeId: 'LOJ-022',
      requestedCents: 100n,
      receivedCents: 0n,
      realizedCents: 0n,
      paidCents: 0n,
      plannedCents: 0n,
      approvedCents: 0n,
    }] as FinanceStoreRow[];
    const ids = financeOverviewActivityStoreIds([overview('LOJ-022')], purchaseStoreRows);
    expect(ids.has('LOJ-022')).toBe(true);
  });

  it('retira lojas inativas sem pagamentos do filtro de Pagamentos, mas preserva histórico', () => {
    const rows = [{
      storeIds: ['LOJ-012'],
      storeAllocations: [{ storeId: 'LOJ-012', amountCents: 12500n }],
      unallocatedCents: 0n,
    }] as UnifiedFinancePaymentRow[];
    const visible = filterInactiveStoresWithoutFinancialValues(
      stores,
      financePaymentActivityStoreIds(rows),
    );
    expect(visible.map((s) => s.id)).toEqual(['LOJ-001', 'LOJ-009', 'LOJ-012']);
    expect(rows).toHaveLength(1);
  });

  it('não exibe loja inativa com rateio zerado; mantém despesa ainda não rateada', () => {
    const rows = [
      { storeIds: ['LOJ-022'], storeAllocations: [{ storeId: 'LOJ-022', amountCents: 0n }], unallocatedCents: 0n },
      { storeIds: ['LOJ-028'], storeAllocations: [], unallocatedCents: 900n },
    ] as UnifiedFinancePaymentRow[];
    const ids = financePaymentActivityStoreIds(rows);
    expect(ids.has('LOJ-022')).toBe(false);
    expect(ids.has('LOJ-028')).toBe(true);
  });
});
