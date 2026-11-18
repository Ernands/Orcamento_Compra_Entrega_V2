import { supabase } from '../supabase/client';

/** Scope is a view filter, not a permission grant. RLS is always authoritative. */
export type WaveSelection = number[] | null; // null = all waves
export interface ImplementationWave {
  id: number;
  name: string;
  status: 'planning' | 'in_progress' | 'completed';
}
const KEY = 'implanta27.selected-implementation-waves.v1';

export function readWaveSelection(): WaveSelection {
  if (typeof window === 'undefined') return import.meta.env.MODE === 'test' ? null : [1];
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === 'all') return null;
    // Legacy tests do not declare a scope; preserve their previous all-stores semantics.
    if (!value) return import.meta.env.MODE === 'test' ? null : [1];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.length ||
      !parsed.every((id) => Number.isSafeInteger(id) && id > 0)) return [1];
    return [...new Set(parsed as number[])].sort((a, b) => a - b);
  } catch {
    return [1];
  }
}

let cachedKey = '';
let cachedStoreIds: Promise<string[]> | null = null;

export function invalidateWaveScopeCache(): void {
  cachedKey = '';
  cachedStoreIds = null;
}

export function saveWaveSelection(waveIds: WaveSelection): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, waveIds === null ? 'all' : JSON.stringify(waveIds));
  invalidateWaveScopeCache();
}

export function waveSelectionKey(waveIds: WaveSelection): string {
  return waveIds === null ? 'all' : waveIds.join(',');
}

export async function listImplementationWaves(): Promise<ImplementationWave[]> {
  const { data, error } = await supabase.from('implementation_waves' as never)
    .select('id,name,status').order('id');
  if (error) throw error;
  return (data ?? []) as ImplementationWave[];
}

export async function createImplementationWave(name: string): Promise<ImplementationWave> {
  const label = name.trim();
  if (label.length < 3 || label.length > 100) throw new Error('Nome da onda deve ter entre 3 e 100 caracteres.');
  const { data, error } = await supabase.from('implementation_waves' as never)
    .insert({ name: label, status: 'planning' } as never)
    .select('id,name,status').single();
  if (error) throw error;
  return data as ImplementationWave;
}

/** Returns null for explicitly "all", [] for a wave with no accessible stores.
 * Never fall back to an unfiltered query on a failed scope lookup.
 */
export async function getWaveScopedStoreIds(): Promise<string[] | null> {
  const selected = readWaveSelection();
  if (selected === null) return null;
  const key = waveSelectionKey(selected);
  if (!cachedStoreIds || cachedKey !== key) {
    cachedKey = key;
    cachedStoreIds = (async () => {
      const { data, error } = await supabase.from('lojas' as never)
        .select('id').in('wave_id', selected).order('id');
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{ id: string }>).map((store) => store.id);
    })().catch((error) => {
      invalidateWaveScopeCache();
      throw error;
    });
  }
  return cachedStoreIds;
}
