import { describe, expect, it } from 'vitest';
import { plannedBudgetAllocations, plannedBudgetByStore } from '../domain/planned-budget-calculations';
import type { PlannedBudgetItem } from '../domain/planned-budget-types';

function item(values?: { active?: boolean; segmentActive?: boolean }): PlannedBudgetItem {
  const catalog = {
    id: 'item-1',
    code: 'ITM-0001',
    name: 'Notebook',
    description: null,
    category: 'Equipamentos',
    subcategory: 'Equipamentos',
    groupName: 'Tecnologia',
    areaName: null,
    financialGroup: 'equipment' as const,
    type: 'product' as const,
    defaultUnit: 'un',
    defaultQuantity: null,
    brandReference: null,
    technicalSpecification: null,
    productLink: null,
    active: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
  const segment = {
    id: 'segment-1',
    supplyItemId: catalog.id,
    item: catalog,
    name: 'Segmento 1',
    active: values?.segmentActive ?? true,
    notes: null,
    stores: [
      {
        id: 'ss-1',
        storeId: 'store-1',
        storeCode: 'LOJ-001',
        storeName: 'Loja 1',
        storeCity: 'Natal',
        storeState: 'RN',
        quantity: '3',
      },
      {
        id: 'ss-2',
        storeId: 'store-2',
        storeCode: 'LOJ-002',
        storeName: 'Loja 2',
        storeCity: 'Natal',
        storeState: 'RN',
        quantity: '2',
      },
    ],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
  return {
    id: 'budget-1',
    supplyItemId: catalog.id,
    item: catalog,
    segmentId: segment.id,
    segment,
    unitPrice: '100.00',
    active: values?.active ?? true,
    notes: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

describe('planned budget calculations', () => {
  it('calcula o valor previsto por loja a partir da quantidade do segmento', () => {
    const allocations = plannedBudgetAllocations([item()]);
    expect(allocations).toHaveLength(2);
    expect(allocations.find((row) => row.storeId === 'store-1')?.totalCents).toBe(30000n);
    expect(allocations.find((row) => row.storeId === 'store-2')?.totalCents).toBe(20000n);

    const totals = plannedBudgetByStore([item()]);
    expect(totals.get('store-1')).toBe(30000n);
    expect(totals.get('store-2')).toBe(20000n);
  });

  it('ignora item inativo', () => {
    expect(plannedBudgetAllocations([item({ active: false })])).toEqual([]);
  });

  it('ignora segmento inativo', () => {
    expect(plannedBudgetAllocations([item({ segmentActive: false })])).toEqual([]);
  });
});
