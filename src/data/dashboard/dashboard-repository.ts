import { isSupplyQuoteEligibleForComparison } from '../../domain/supply-quote-status';
import type {
  ImplementationDashboard,
  ImplementationDashboardBreakdown,
  ImplementationDashboardStore,
  ImplementationItemStatus,
  ImplementationStatus,
  NeedPriority,
  Store,
  SupplyDashboard,
  SupplyDashboardBreakdown,
  SupplyItem,
  SupplyNeed,
  SupplyQuote,
} from '../../domain/types';
import { supabase } from '../supabase/client';
import { listStores } from '../stores/stores-repository';
import {
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../supplies/supplies-repository';

export interface DashboardImplementationInput {
  id: string;
  storeId: string;
  status: ImplementationStatus;
  createdAt: string;
}

export interface DashboardImplementationItemInput {
  implementationId: string;
  title: string;
  status: ImplementationItemStatus;
  priority: NeedPriority;
  dueDate: string | null;
}

function average(values: number[]) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function groupImplementationStores(
  stores: ImplementationDashboardStore[],
  labelFor: (store: ImplementationDashboardStore) => string,
): ImplementationDashboardBreakdown[] {
  const groups = new Map<string, ImplementationDashboardStore[]>();
  stores.forEach((store) => {
    const label = labelFor(store);
    groups.set(label, [...(groups.get(label) || []), store]);
  });
  return [...groups.entries()]
    .map(([label, groupedStores]) => ({
      label,
      storeCount: groupedStores.length,
      averageProgress: average(groupedStores.map((store) => store.progress)),
      overdueStores: groupedStores.filter((store) => store.overdueCount > 0).length,
      pendingActivities: groupedStores.reduce((sum, store) => sum + store.pendingCount, 0),
    }))
    .sort((a, b) => b.storeCount - a.storeCount || a.label.localeCompare(b.label, 'pt-BR'));
}

export function buildImplementationDashboard(
  stores: Store[],
  implementations: DashboardImplementationInput[],
  items: DashboardImplementationItemInput[],
  today: string,
): ImplementationDashboard {
  const latestByStore = new Map<string, DashboardImplementationInput>();
  [...implementations]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((implementation) => {
      if (!latestByStore.has(implementation.storeId))
        latestByStore.set(implementation.storeId, implementation);
    });

  const itemsByImplementation = new Map<string, DashboardImplementationItemInput[]>();
  items.forEach((item) => {
    itemsByImplementation.set(item.implementationId, [
      ...(itemsByImplementation.get(item.implementationId) || []),
      item,
    ]);
  });

  const dashboardStores = stores.map<ImplementationDashboardStore>((store) => {
    const implementation = latestByStore.get(store.id);
    const implementationItems = implementation
      ? itemsByImplementation.get(implementation.id) || []
      : [];
    const relevant = implementationItems.filter((item) => item.status !== 'not_applicable');
    const incomplete = relevant.filter((item) => item.status !== 'completed');
    const completed = relevant.length - incomplete.length;
    const overdue = incomplete.filter((item) => item.dueDate && item.dueDate < today);
    const critical = incomplete.filter((item) => item.priority === 'critical');
    const next = incomplete
      .filter((item) => item.dueDate)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
    const status =
      !implementation || implementation.status === 'cancelled'
        ? 'not_started'
        : implementation.status;

    return {
      id: store.id,
      code: store.code,
      name: store.name,
      city: store.city,
      state: store.state,
      responsibleName: store.responsibleName,
      plannedOpeningDate: store.plannedOpeningDate,
      status,
      progress: relevant.length ? Math.round((completed / relevant.length) * 100) : 0,
      pendingCount: incomplete.length,
      overdueCount: overdue.length,
      criticalCount: critical.length,
      nextDueDate: next?.dueDate || null,
      nextDueTitle: next?.title || null,
    };
  });

  dashboardStores.sort(
    (a, b) =>
      Number(b.overdueCount > 0) - Number(a.overdueCount > 0) ||
      b.pendingCount - a.pendingCount ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );

  return {
    totalStores: dashboardStores.length,
    notStartedStores: dashboardStores.filter((store) => store.status === 'not_started').length,
    inProgressStores: dashboardStores.filter((store) => store.status === 'in_progress').length,
    readyStores: dashboardStores.filter((store) => store.status === 'completed').length,
    overdueStores: dashboardStores.filter((store) => store.overdueCount > 0).length,
    pendingActivities: dashboardStores.reduce((sum, store) => sum + store.pendingCount, 0),
    criticalActivities: dashboardStores.reduce((sum, store) => sum + store.criticalCount, 0),
    stores: dashboardStores,
    byState: groupImplementationStores(dashboardStores, (store) => store.state),
    byResponsible: groupImplementationStores(
      dashboardStores,
      (store) => store.responsibleName || 'Nao definido',
    ),
    upcomingOpenings: dashboardStores
      .filter((store) => store.plannedOpeningDate && store.plannedOpeningDate >= today)
      .sort((a, b) => String(a.plannedOpeningDate).localeCompare(String(b.plannedOpeningDate)))
      .slice(0, 6),
  };
}

function topBreakdown(groups: Map<string, { count: number; secondaryValue: number }>) {
  return [...groups.entries()]
    .map<SupplyDashboardBreakdown>(([label, values]) => ({ label, ...values }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 6);
}

export function buildSupplyDashboard(
  items: SupplyItem[],
  needs: SupplyNeed[],
  activeSuppliers: number,
  quotes: SupplyQuote[],
  today: string,
): SupplyDashboard {
  const openNeeds = needs.filter((need) => !['resolved', 'cancelled'].includes(need.status));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const needsByStore = new Map<string, { count: number; secondaryValue: number }>();
  const recurringItems = new Map<string, { count: number; secondaryValue: number }>();
  const quotesByStore = new Map<string, { count: number; secondaryValue: number }>();
  const quotesByItemSets = new Map<string, Set<string>>();

  openNeeds.forEach((need) => {
    const storeLabel = `${need.storeCode} - ${need.storeName}`;
    const storeGroup = needsByStore.get(storeLabel) || { count: 0, secondaryValue: 0 };
    storeGroup.count += 1;
    storeGroup.secondaryValue += need.quantity;
    needsByStore.set(storeLabel, storeGroup);

    if (need.supplyItemId) {
      const item = itemById.get(need.supplyItemId);
      const itemLabel = item ? `${item.code} - ${item.name}` : 'Item indisponivel';
      const itemGroup = recurringItems.get(itemLabel) || { count: 0, secondaryValue: 0 };
      itemGroup.count += 1;
      itemGroup.secondaryValue += need.quantity;
      recurringItems.set(itemLabel, itemGroup);
    }
  });

  quotes.forEach((quote) => {
    quote.stores.forEach((store) => {
      const label = `${store.code} - ${store.name}`;
      const group = quotesByStore.get(label) || { count: 0, secondaryValue: 0 };
      group.count += 1;
      quotesByStore.set(label, group);
    });
    quote.items.forEach((line) => {
      const item = itemById.get(line.supplyItemId);
      const label = item ? `${item.code} - ${item.name}` : line.itemName;
      const ids = quotesByItemSets.get(label) || new Set<string>();
      ids.add(quote.id);
      quotesByItemSets.set(label, ids);
    });
  });

  const quoteItemGroups = new Map(
    [...quotesByItemSets].map(([label, quoteIds]) => [
      label,
      { count: quoteIds.size, secondaryValue: 0 },
    ]),
  );
  const statusLabels: Record<string, string> = {
    identified: 'Identificadas',
    under_review: 'Em analise',
    resolved: 'Resolvidas',
    cancelled: 'Canceladas',
  };
  const statusGroups = new Map<string, { count: number; secondaryValue: number }>();
  needs.forEach((need) => {
    const label = statusLabels[need.status] || need.status;
    const group = statusGroups.get(label) || { count: 0, secondaryValue: 0 };
    group.count += 1;
    statusGroups.set(label, group);
  });

  return {
    activeItems: items.filter((item) => item.active).length,
    openNeeds: openNeeds.length,
    unlinkedNeeds: openNeeds.filter((need) => !need.supplyItemId).length,
    activeSuppliers,
    totalQuotes: quotes.length,
    receivedQuotes: quotes.filter((quote) => quote.status === 'received').length,
    comparableQuotes: quotes.filter((quote) => isSupplyQuoteEligibleForComparison(quote, today))
      .length,
    needsByStatus: topBreakdown(statusGroups),
    needsByStore: topBreakdown(needsByStore),
    recurringItems: topBreakdown(recurringItems),
    quotesByStore: topBreakdown(quotesByStore),
    quotesByItem: topBreakdown(quoteItemGroups),
  };
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadImplementationDashboard(): Promise<ImplementationDashboard> {
  const [stores, implementationsResult, itemsResult] = await Promise.all([
    listStores(),
    supabase.from('store_implementations').select('id, store_id, status, created_at'),
    supabase
      .from('store_implementation_items')
      .select('implementation_id, title_snapshot, status, priority_snapshot, due_date'),
  ]);
  if (implementationsResult.error) throw implementationsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  return buildImplementationDashboard(
    stores,
    implementationsResult.data.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      status: row.status,
      createdAt: row.created_at,
    })),
    itemsResult.data.map((row) => ({
      implementationId: row.implementation_id,
      title: row.title_snapshot,
      status: row.status,
      priority: row.priority_snapshot,
      dueDate: row.due_date,
    })),
    localDate(),
  );
}

export async function loadSupplyDashboard(): Promise<SupplyDashboard> {
  const [items, needs, quotes, suppliersResult] = await Promise.all([
    listSupplyItems(),
    listSupplyNeeds(),
    listSupplyQuotes(),
    supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('active', true),
  ]);
  if (suppliersResult.error) throw suppliersResult.error;
  return buildSupplyDashboard(items, needs, suppliersResult.count || 0, quotes, localDate());
}
