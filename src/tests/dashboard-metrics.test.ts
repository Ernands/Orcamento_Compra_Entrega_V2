import { describe, expect, it } from 'vitest';
import {
  buildImplementationDashboard,
  buildSupplyDashboard,
} from '../data/dashboard/dashboard-repository';
import type { Store, SupplyItem, SupplyNeed, SupplyQuote, SupplyQuoteItem } from '../domain/types';

const stores: Store[] = [
  {
    id: 'store-1',
    code: 'LOJ-001',
    name: 'Loja Campinas',
    city: 'Campinas',
    state: 'SP',
    address: null,
    responsibleUserId: 'user-1',
    responsibleName: 'Ana',
    status: 'planning',
    plannedOpeningDate: '2026-09-01',
    notes: null,
  },
  {
    id: 'store-2',
    code: 'LOJ-002',
    name: 'Loja Niteroi',
    city: 'Niteroi',
    state: 'RJ',
    address: null,
    responsibleUserId: null,
    responsibleName: null,
    status: 'planning',
    plannedOpeningDate: null,
    notes: null,
  },
  {
    id: 'store-3',
    code: 'LOJ-003',
    name: 'Loja Santos',
    city: 'Santos',
    state: 'SP',
    address: null,
    responsibleUserId: 'user-2',
    responsibleName: 'Bruno',
    status: 'active',
    plannedOpeningDate: '2026-08-01',
    notes: null,
  },
];

const catalogItem: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira',
  description: null,
  category: 'Mobiliario',
  subcategory: null,
  groupName: null,
  areaName: null,
  type: 'product',
  defaultUnit: 'un',
  defaultQuantity: null,
  brandReference: null,
  technicalSpecification: null,
  productLink: null,
  active: true,
  createdAt: '',
  updatedAt: '',
};

function need(
  id: string,
  storeIndex: number,
  status: SupplyNeed['status'],
  supplyItemId: string | null,
  quantity: number,
): SupplyNeed {
  const store = stores[storeIndex];
  return {
    id,
    storeId: store.id,
    storeCode: store.code,
    storeName: store.name,
    storeCity: store.city,
    storeState: store.state,
    title: `Necessidade ${id}`,
    description: null,
    category: 'Mobiliario',
    quantity,
    unit: 'un',
    priority: 'normal',
    status,
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId,
    createdAt: '',
  };
}

function quote(id: string, validUntil: string): SupplyQuote {
  const line: SupplyQuoteItem = {
    id: `line-${id}`,
    quoteId: id,
    supplyItemId: catalogItem.id,
    itemCode: catalogItem.code,
    itemName: catalogItem.name,
    storeNeedId: null,
    needTitle: null,
    storeId: stores[0].id,
    storeCode: stores[0].code,
    storeName: stores[0].name,
    quantity: '2',
    unit: 'un',
    unitPrice: '100',
    discountAmount: '0',
    shippingType: 'free',
    shippingAmount: null,
    otherCosts: '0',
    deliveryDays: 5,
    minimumQuantity: null,
    offeredBrandModel: null,
    notes: null,
    productUrl: null,
    capturedAt: null,
  };
  return {
    id,
    code: `COT-${id}`,
    supplierId: `supplier-${id}`,
    supplierName: `Fornecedor ${id}`,
    supplierChannelId: `channel-${id}`,
    channel: 'ecommerce',
    originCity: null,
    originState: null,
    quoteDate: '2026-08-10',
    validUntil,
    contact: null,
    contextType: 'store',
    status: 'received',
    notes: null,
    createdAt: '',
    stores: [stores[0]],
    items: [line],
  };
}

describe('dashboard metrics', () => {
  it('calcula implantacao com a versao mais recente e o escopo recebido', () => {
    const dashboard = buildImplementationDashboard(
      stores,
      [
        { id: 'old-1', storeId: 'store-1', status: 'completed', createdAt: '2026-07-01' },
        { id: 'impl-1', storeId: 'store-1', status: 'in_progress', createdAt: '2026-08-01' },
        { id: 'impl-3', storeId: 'store-3', status: 'completed', createdAt: '2026-08-02' },
      ],
      [
        {
          implementationId: 'impl-1',
          title: 'Concluida',
          status: 'completed',
          priority: 'normal',
          dueDate: '2026-08-10',
        },
        {
          implementationId: 'impl-1',
          title: 'Atrasada',
          status: 'pending',
          priority: 'critical',
          dueDate: '2026-08-15',
        },
        {
          implementationId: 'impl-1',
          title: 'Futura',
          status: 'in_progress',
          priority: 'high',
          dueDate: '2026-08-25',
        },
        {
          implementationId: 'impl-3',
          title: 'Finalizada',
          status: 'completed',
          priority: 'normal',
          dueDate: null,
        },
      ],
      '2026-08-17',
    );

    expect(dashboard).toMatchObject({
      totalStores: 3,
      notStartedStores: 1,
      inProgressStores: 1,
      readyStores: 1,
      overdueStores: 1,
      pendingActivities: 2,
      criticalActivities: 1,
    });
    expect(dashboard.stores[0]).toMatchObject({
      id: 'store-1',
      progress: 33,
      overdueCount: 1,
      nextDueTitle: 'Atrasada',
    });
    expect(dashboard.byState.find((row) => row.label === 'SP')).toMatchObject({
      storeCount: 2,
      averageProgress: 67,
    });
    expect(dashboard.upcomingOpenings.map((store) => store.id)).toEqual(['store-1']);
  });

  it('calcula suprimentos, recorrencia e validade das cotacoes', () => {
    const dashboard = buildSupplyDashboard(
      [catalogItem, { ...catalogItem, id: 'item-2', code: 'ITM-0002', active: false }],
      [
        need('need-1', 0, 'identified', catalogItem.id, 2),
        need('need-2', 1, 'under_review', catalogItem.id, 3),
        need('need-3', 1, 'identified', null, 1),
        need('need-4', 2, 'resolved', null, 5),
      ],
      5,
      [quote('quote-1', '2026-08-31'), quote('quote-2', '2026-08-16')],
      '2026-08-17',
    );

    expect(dashboard).toMatchObject({
      activeItems: 1,
      openNeeds: 3,
      unlinkedNeeds: 1,
      activeSuppliers: 5,
      totalQuotes: 2,
      receivedQuotes: 2,
      comparableQuotes: 1,
    });
    expect(dashboard.recurringItems[0]).toMatchObject({
      label: 'ITM-0001 - Cadeira',
      count: 2,
      secondaryValue: 5,
    });
    expect(dashboard.quotesByItem[0]).toMatchObject({ count: 2 });
  });
});
