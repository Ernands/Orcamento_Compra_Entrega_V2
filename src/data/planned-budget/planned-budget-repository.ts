import type {
  PlannedBudgetData,
  PlannedBudgetItem,
  PlannedBudgetItemValues,
  PlannedBudgetSegment,
  PlannedBudgetSegmentValues,
} from '../../domain/planned-budget-types';
import { moneyToCents, quantityToThousandths } from '../../domain/supply-calculations';
import type { Store, SupplyItem } from '../../domain/types';
import { supabase } from '../supabase/client';
import type { Database, Json } from '../supabase/database.types';
import { listSupplyItems } from '../supplies/supplies-repository';

type SegmentRow = Database['public']['Tables']['supply_budget_segments']['Row'];
type SegmentStoreRow = Database['public']['Tables']['supply_budget_segment_stores']['Row'];
type BudgetItemRow = Database['public']['Tables']['supply_budget_items']['Row'];

type StoreLite = {
  id: string;
  codigo_negocio: string;
  nome: string;
  cidade: string;
  uf: string;
};

function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function itemMap(items: SupplyItem[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export async function collectPaginatedRows<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function listAllSegmentStores(): Promise<SegmentStoreRow[]> {
  return collectPaginatedRows(async (from, to) => {
    const { data, error } = await supabase
      .from('supply_budget_segment_stores')
      .select('*')
      .order('created_at')
      .order('id')
      .range(from, to);
    if (error) throw error;
    return data as SegmentStoreRow[];
  });
}

export async function listPlannedBudget(): Promise<PlannedBudgetData> {
  const [items, storesResult, segmentsResult, segmentStores, budgetItemsResult] =
    await Promise.all([
      listSupplyItems(),
      supabase
        .from('lojas')
        .select('id,codigo_negocio,nome,cidade,uf')
        .order('codigo_negocio'),
      supabase.from('supply_budget_segments').select('*').order('name'),
      listAllSegmentStores(),
      supabase.from('supply_budget_items').select('*').order('created_at'),
    ]);

  const error =
    storesResult.error ||
    segmentsResult.error ||
    budgetItemsResult.error;
  if (error) throw error;

  const itemsById = itemMap(items);
  const storesById = new Map(
    (storesResult.data as StoreLite[]).map((store) => [store.id, store]),
  );
  const storesBySegment = new Map<string, SegmentStoreRow[]>();
  segmentStores.forEach((row) => {
    const current = storesBySegment.get(row.segment_id) || [];
    current.push(row);
    storesBySegment.set(row.segment_id, current);
  });

  const segments = (segmentsResult.data as SegmentRow[]).flatMap(
    (row): PlannedBudgetSegment[] => {
      const item = itemsById.get(row.supply_item_id);
      if (!item) return [];
      return [
        {
          id: row.id,
          supplyItemId: row.supply_item_id,
          item,
          name: row.name,
          active: row.active,
          notes: row.notes,
          stores: (storesBySegment.get(row.id) || []).flatMap((storeRow) => {
            const store = storesById.get(storeRow.store_id);
            if (!store) return [];
            return [
              {
                id: storeRow.id,
                storeId: storeRow.store_id,
                storeCode: store.codigo_negocio,
                storeName: store.nome,
                storeCity: store.cidade,
                storeState: store.uf,
                quantity: String(storeRow.quantity),
              },
            ];
          }),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      ];
    },
  );
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));

  const budgetItems = (budgetItemsResult.data as BudgetItemRow[]).flatMap(
    (row): PlannedBudgetItem[] => {
      const item = itemsById.get(row.supply_item_id);
      const segment = segmentsById.get(row.segment_id);
      if (!item || !segment) return [];
      return [
        {
          id: row.id,
          supplyItemId: row.supply_item_id,
          item,
          segmentId: row.segment_id,
          segment,
          unitPrice: String(row.unit_price),
          active: row.active,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      ];
    },
  );

  return { segments, items: budgetItems };
}

export async function savePlannedBudgetSegment(
  values: PlannedBudgetSegmentValues,
): Promise<string> {
  const stores = values.stores.map((store) => ({
    storeId: store.storeId,
    quantity: scaledToDecimal(quantityToThousandths(store.quantity), 3),
  })) as Json;

  const common = {
    p_supply_item_id: values.supplyItemId,
    p_name: values.name.trim(),
    p_active: values.active,
    p_notes: values.notes.trim(),
    p_stores: stores,
  };

  const result = values.id
    ? await supabase.rpc('update_supply_budget_segment', {
        p_segment_id: values.id,
        ...common,
      })
    : await supabase.rpc('create_supply_budget_segment', common);

  if (result.error) throw result.error;
  return result.data;
}

function budgetItemPayload(values: PlannedBudgetItemValues) {
  return {
    supply_item_id: values.supplyItemId,
    segment_id: values.segmentId,
    unit_price: Number(scaledToDecimal(moneyToCents(values.unitPrice), 2)),
    active: values.active,
    notes: values.notes.trim() || null,
  };
}

export async function savePlannedBudgetItem(
  values: PlannedBudgetItemValues,
): Promise<string> {
  if (values.id) {
    const { data, error } = await supabase
      .from('supply_budget_items')
      .update(budgetItemPayload(values))
      .eq('id', values.id)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from('supply_budget_items')
    .insert(budgetItemPayload(values))
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function setPlannedBudgetItemActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('supply_budget_items')
    .update({ active })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePlannedBudgetItem(id: string): Promise<void> {
  const { error } = await supabase.from('supply_budget_items').delete().eq('id', id);
  if (error) throw error;
}

export async function setPlannedBudgetSegmentActive(
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('supply_budget_segments')
    .update({ active })
    .eq('id', id);
  if (error) throw error;
}


export async function listPlannedBudgetStores(): Promise<
  Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>[]
> {
  const { data, error } = await supabase
    .from('lojas')
    .select('id,codigo_negocio,nome,cidade,uf')
    .order('codigo_negocio');
  if (error) throw error;
  return data.map((store) => ({
    id: store.id,
    code: store.codigo_negocio,
    name: store.nome,
    city: store.cidade,
    state: store.uf,
  }));
}
