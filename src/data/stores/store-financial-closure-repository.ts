import { supabase } from '../supabase/client';

export type StoreFinancialClosureState = 'open' | 'closed' | 'unavailable';
export interface StoreFinancialClosure {
  storeId: string;
  state: StoreFinancialClosureState;
  closedAt: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}
export interface StoreFinancialClosureEvent {
  id: string;
  event: 'closed' | 'reopened' | 'document_added';
  actorName: string | null;
  occurredAt: string;
  reason: string | null;
}
const base = (storeId: string, state: StoreFinancialClosureState): StoreFinancialClosure => ({
  storeId, state, closedAt: null, closedByName: null, reopenedAt: null, reopenReason: null,
});

/** Return 'unavailable' when the preview database has not yet received the migration. */
export async function listStoreFinancialClosures(ids: string[]): Promise<Map<string, StoreFinancialClosure>> {
  const unique = [...new Set(ids)];
  const closures = new Map<string, StoreFinancialClosure>();
  if (!unique.length) return closures;
  const { data, error } = await supabase.from('store_financial_closures')
    .select('store_id,state,closed_at,closed_by_name,reopened_at,reopen_reason')
    .in('store_id', unique);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST116') {
      unique.forEach((id) => closures.set(id, base(id, 'unavailable')));
      return closures;
    }
    throw error;
  }
  unique.forEach((id) => closures.set(id, base(id, 'open')));
  (data || []).forEach((row) => closures.set(row.store_id, {
    storeId: row.store_id,
    state: row.state === 'closed' ? 'closed' : 'open',
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    reopenedAt: row.reopened_at,
    reopenReason: row.reopen_reason,
  }));
  return closures;
}

export async function listStoreFinancialClosureEvents(storeId: string): Promise<StoreFinancialClosureEvent[]> {
  const { data, error } = await supabase.from('store_financial_closure_events')
    .select('id,event,actor_name,occurred_at,reason')
    .eq('store_id', storeId)
    .order('occurred_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  return (data || []).map((row) => ({
    id: row.id, event: row.event as StoreFinancialClosureEvent['event'],
    actorName: row.actor_name, occurredAt: row.occurred_at, reason: row.reason,
  }));
}

export function financialClosureMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message) : String(error);
  if (/finalizada e não permite|loja est[aá] finalizada/i.test(message)) {
    return 'Esta loja está finalizada e não permite novas movimentações financeiras. Para realizar alterações, um administrador autorizado deve reabrir a loja.';
  }
  return message;
}

export async function changeStoreFinancialClosure(
  storeId: string, action: 'close' | 'reopen', confirmation: string, reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('change_store_financial_closure', {
    p_store_id: storeId, p_action: action, p_confirm_text: confirmation, p_reason: reason || null,
  });
  if (error) throw new Error(financialClosureMessage(error));
}
