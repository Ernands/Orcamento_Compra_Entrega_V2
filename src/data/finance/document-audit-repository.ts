import { supabase } from '../supabase/client';
import { fetchAllPages } from '../supabase/pagination';
import type { Store } from '../../domain/types';

/** No closure/responsible-user lookups are necessary for a read-only document export. */
export async function listAuditStores(): Promise<Store[]> {
  const stores = await fetchAllPages((from, to) =>
    supabase
      .from('lojas')
      .select('id,codigo_negocio,nome,cidade,uf,endereco,status')
      .order('codigo_negocio')
      .order('id')
      .range(from, to),
  );
  return stores.map((store) => ({
    id: store.id,
    code: store.codigo_negocio,
    name: store.nome,
    city: store.cidade,
    state: store.uf,
    address: store.endereco,
    status: store.status,
    responsibleUserId: null,
    responsibleName: null,
    plannedOpeningDate: null,
    notes: null,
  }));
}
