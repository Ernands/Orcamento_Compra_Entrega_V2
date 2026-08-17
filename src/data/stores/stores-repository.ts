import type { ResponsibleUser, Store, StoreFormValues } from '../../domain/types';
import { supabase } from '../supabase/client';

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
  };
}

async function responsibleNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.from('usuarios').select('id, nome').in('id', ids);

  if (error) {
    throw error;
  }

  return new Map(data.map((user) => [user.id, user.nome]));
}

export async function listStores(): Promise<Store[]> {
  const { data, error } = await supabase
    .from('lojas')
    .select(
      'id, codigo_negocio, nome, cidade, uf, endereco, status, data_inauguracao_planejada, observacoes, responsavel_usuario_id',
    )
    .order('nome');

  if (error) {
    throw error;
  }

  const ids = [...new Set(data.flatMap((store) => store.responsavel_usuario_id || []))];
  const names = await responsibleNames(ids);

  return data.map((store) =>
    mapStore(
      store,
      store.responsavel_usuario_id ? names.get(store.responsavel_usuario_id) || null : null,
    ),
  );
}

export async function getStore(id: string): Promise<Store> {
  const { data, error } = await supabase
    .from('lojas')
    .select(
      'id, codigo_negocio, nome, cidade, uf, endereco, status, data_inauguracao_planejada, observacoes, responsavel_usuario_id',
    )
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  const names = await responsibleNames(
    data.responsavel_usuario_id ? [data.responsavel_usuario_id] : [],
  );
  return mapStore(
    data,
    data.responsavel_usuario_id ? names.get(data.responsavel_usuario_id) || null : null,
  );
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
  return getStore(data.id);
}

export async function updateStore(id: string, values: StoreFormValues): Promise<Store> {
  const { error } = await supabase.from('lojas').update(storePayload(values)).eq('id', id);
  if (error) throw error;
  return getStore(id);
}
