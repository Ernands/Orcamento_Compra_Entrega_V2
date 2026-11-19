import type { ResponsibleUser, Store, StoreFormValues } from '../../domain/types';
import { supabase } from '../supabase/client';
import { fetchAllPages, fetchAllPagesForIds } from '../supabase/pagination';
import { invalidateWaveScopeCache, readWaveSelection } from '../waves/wave-scope-repository';
import { listStoreFinancialClosures } from './store-financial-closure-repository';

interface StoreRow {
  id: string;
  codigo_negocio: string;
  nome: string;
  cidade: string;
  uf: string;
  endereco: string | null;
  status: Store['status'];
  data_inauguracao_planejada: string | null;
  observacoes: string | null;
  responsavel_usuario_id: string | null;
  wave_id?: number;
}

function mapStore(row: StoreRow, responsibleName: string | null): Store {
  return {
    id: row.id,
    code: row.codigo_negocio,
    name: row.nome,
    city: row.cidade,
    state: row.uf,
    address: row.endereco,
    responsibleUserId: row.responsavel_usuario_id,
    status: row.status,
    plannedOpeningDate: row.data_inauguracao_planejada,
    notes: row.observacoes,
    responsibleName,
    waveId: Number(row.wave_id ?? 1),
  };
}

async function responsibleNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await fetchAllPagesForIds<{ id: string; nome: string }>(
    ids,
    (chunk, from, to) => supabase.from('usuarios')
      .select('id, nome').in('id', chunk).order('id').range(from, to),
  );
  return new Map(rows.map((user) => [user.id, user.nome]));
}

export async function listStores(): Promise<Store[]> {
  const waveIds = readWaveSelection();
  // Keep the wave predicate in every database page. Without pagination the
  // Data API's row cap silently hides stores in large implementation waves.
  const data = await fetchAllPages<StoreRow>((from, to) => {
    const query = supabase.from('lojas').select(
      'id, codigo_negocio, nome, cidade, uf, endereco, status, data_inauguracao_planejada, observacoes, responsavel_usuario_id, wave_id',
    );
    return (waveIds === null ? query : query.in('wave_id', waveIds))
      .order('nome').order('id').range(from, to);
  });

  const ids = [...new Set(data.flatMap((store) => store.responsavel_usuario_id || []))];
  const names = await responsibleNames(ids);

  const financialClosures = await listStoreFinancialClosures(data.map((row) => row.id));
  return data.map((store) => ({
    ...mapStore(store, store.responsavel_usuario_id ? names.get(store.responsavel_usuario_id) || null : null),
    financialClosure: financialClosures.get(store.id),
  }));
}

export async function getStore(id: string): Promise<Store> {
  const { data, error } = await supabase
    .from('lojas')
    .select(
      'id, codigo_negocio, nome, cidade, uf, endereco, status, data_inauguracao_planejada, observacoes, responsavel_usuario_id, wave_id',
    )
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  const names = await responsibleNames(
    data.responsavel_usuario_id ? [data.responsavel_usuario_id] : [],
  );
  const financialClosures = await listStoreFinancialClosures([data.id]);
  return {
    ...mapStore(data, data.responsavel_usuario_id ? names.get(data.responsavel_usuario_id) || null : null),
    financialClosure: financialClosures.get(data.id),
  };
}

export async function listResponsibleUsers(): Promise<ResponsibleUser[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome')
    .eq('status', 'active')
    .order('nome');

  if (error) throw error;
  return data.map((user) => ({ id: user.id, name: user.nome }));
}

function storePayload(values: StoreFormValues) {
  return {
    ...(values.waveId ? { wave_id: Number(values.waveId) } : {}),
    nome: values.name.trim(),
    cidade: values.city.trim(),
    uf: values.state,
    endereco: values.address.trim() || null,
    responsavel_usuario_id: values.responsibleUserId || null,
    status: values.status,
    data_inauguracao_planejada: values.plannedOpeningDate || null,
    observacoes: values.notes.trim() || null,
  };
}

export async function createStore(values: StoreFormValues): Promise<Store> {
  const { data, error } = await supabase
    .from('lojas')
    .insert(storePayload(values))
    .select('id')
    .single();

  if (error) throw error;
  invalidateWaveScopeCache();
  return getStore(data.id);
}

export async function updateStore(id: string, values: StoreFormValues): Promise<Store> {
  const { error } = await supabase.from('lojas').update(storePayload(values)).eq('id', id);
  if (error) throw error;
  invalidateWaveScopeCache();
  return getStore(id);
}
