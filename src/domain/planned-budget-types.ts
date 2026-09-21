import type { SupplyItem } from './types';

export interface PlannedBudgetSegmentStore {
  id: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  storeCity: string;
  storeState: string;
  quantity: string;
}

export interface PlannedBudgetSegment {
  id: string;
  supplyItemId: string;
  item: SupplyItem;
  name: string;
  active: boolean;
  notes: string | null;
  stores: PlannedBudgetSegmentStore[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannedBudgetItem {
  id: string;
  supplyItemId: string;
  item: SupplyItem;
  segmentId: string;
  segment: PlannedBudgetSegment;
  unitPrice: string;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedBudgetData {
  segments: PlannedBudgetSegment[];
  items: PlannedBudgetItem[];
}

export interface PlannedBudgetSegmentValues {
  id: string | null;
  supplyItemId: string;
  name: string;
  active: boolean;
  notes: string;
  stores: Array<{
    storeId: string;
    quantity: string;
  }>;
}

export interface PlannedBudgetItemValues {
  id: string | null;
  supplyItemId: string;
  segmentId: string;
  unitPrice: string;
  active: boolean;
  notes: string;
}

export interface PlannedBudgetStoreAllocation {
  budgetItemId: string;
  segmentId: string;
  segmentName: string;
  supplyItemId: string;
  itemCode: string;
  itemName: string;
  itemCategory: string | null;
  itemSubcategory: string | null;
  itemGroupName: string | null;
  itemFinancialGroup: 'equipment' | 'furniture' | 'general' | null;
  unit: string;
  storeId: string;
  quantity: string;
  unitPrice: string;
  totalCents: bigint;
}
