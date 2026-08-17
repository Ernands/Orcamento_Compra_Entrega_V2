import type { StoreNeed, StoreNeedValues } from '../../domain/types';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/database.types';

type NeedRow = Database['public']['Tables']['store_needs']['Row'];

function mapNeed(row: NeedRow): StoreNeed {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    description: row.description,
    category: row.category,
    quantity: Number(row.quantity),
    unit: row.unit,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    origin: row.origin,
    sourceImplementationItemId: row.source_implementation_item_id,
    createdAt: row.created_at,
  };
}

function needPayload(storeId: string, values: StoreNeedValues) {
  return {
    store_id: storeId,
    title: values.title.trim(),
    description: values.description.trim() || null,
    category: values.category.trim(),
    quantity: values.quantity,
    unit: values.unit.trim() || null,
    priority: values.priority,
    status: values.status,
    notes: values.notes.trim() || null,
    origin: 'manual' as const,
  };
}

export async function listStoreNeeds(storeId: string): Promise<StoreNeed[]> {
  const { data, error } = await supabase
    .from('store_needs')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapNeed);
}

export async function createStoreNeed(storeId: string, values: StoreNeedValues): Promise<void> {
  const { error } = await supabase.from('store_needs').insert(needPayload(storeId, values));
  if (error) throw error;
}

export async function updateStoreNeed(
  needId: string,
  storeId: string,
  values: StoreNeedValues,
): Promise<void> {
  const { error } = await supabase
    .from('store_needs')
    .update(needPayload(storeId, values))
    .eq('id', needId);
  if (error) throw error;
}
