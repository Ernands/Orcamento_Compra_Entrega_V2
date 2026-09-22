import { describe, expect, it } from 'vitest';
import { plannedBudgetByStore } from '../domain/planned-budget-calculations';
import type { PlannedBudgetItem } from '../domain/planned-budget-types';

const item: PlannedBudgetItem = {
  id: 'budget-1',
  supplyItemId: 'item-1',
  segmentId: 'segment-1',
  unitPrice: '100.00',
  active: true,
  notes: null,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:00Z',
  item: {
    id: 'item-1',
    code: 'ITM-001',
    name: 'Item teste',
    description: null,
    category: 'Equipamentos',
    subcategory: null,
    groupName: 'Equipamentos',
    areaName: null,
    financialGroup: 'equipment',
    type: 'product',
    defaultUnit: 'un',
    defaultQuantity: null,
    brandReference: null,
    technicalSpecification: null,
    productLink: null,
    active: true,
    createdAt: '2026-09-22T00:00:00Z',
    updatedAt: '2026-09-22T00:00:00Z',
  },
  segment: {
    id: 'segment-1',
    supplyItemId: 'item-1',
    name: 'Todas as lojas',
    active: true,
    notes: null,
    createdAt: '2026-09-22T00:00:00Z',
    updatedAt: '2026-09-22T00:00:00Z',
    item: {
      id: 'item-1',
      code: 'ITM-001',
      name: 'Item teste',
      description: null,
      category: 'Equipamentos',
      subcategory: null,
      groupName: 'Equipamentos',
      areaName: null,
      financialGroup: 'equipment',
      type: 'product',
      defaultUnit: 'un',
      defaultQuantity: null,
      brandReference: null,
      technicalSpecification: null,
      productLink: null,
      active: true,
      createdAt: '2026-09-22T00:00:00Z',
      updatedAt: '2026-09-22T00:00:00Z',
    },
    stores: [
      {
        id: 'link-1',
        storeId: 'store-1',
        quantity: '1',
        storeCode: 'LOJ-001',
        storeName: 'Loja 1',
        storeCity: 'Natal',
        storeState: 'RN',
      },
      {
        id: 'link-2',
        storeId: 'store-2',
        quantity: '2',
        storeCode: 'LOJ-002',
        storeName: 'Loja 2',
        storeCity: 'Parnamirim',
        storeState: 'RN',
      },
    ],
  },
};

describe('planned budget totals by store', () => {
  it('uses the store-specific quantity instead of splitting the global total', () => {
    const totals = plannedBudgetByStore([item]);
    expect(totals.get('store-1')).toBe(10000n);
    expect(totals.get('store-2')).toBe(20000n);
  });

  it('ignores inactive budget items and inactive segments', () => {
    expect(plannedBudgetByStore([{ ...item, active: false }]).size).toBe(0);
    expect(
      plannedBudgetByStore([{ ...item, segment: { ...item.segment, active: false } }]).size,
    ).toBe(0);
  });
});
