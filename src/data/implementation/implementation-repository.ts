import type {
  ImplementationItem,
  ImplementationItemStatus,
  ImplementationProgress,
  PendingImplementationItem,
  StoreImplementation,
} from '../../domain/types';
import { supabase } from '../supabase/client';

type ItemRow = Awaited<ReturnType<typeof implementationItemRows>>[number];

async function implementationRows() {
  const { data, error } = await supabase.from('store_implementations').select('*');
  if (error) throw error;
  return data;
}

async function implementationItemRows() {
  const { data, error } = await supabase.from('store_implementation_items').select('*');
  if (error) throw error;
  return data;
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome')
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  return new Map(data.map((user) => [user.id, user.nome]));
}

function mapItem(row: ItemRow, names: Map<string, string>): ImplementationItem {
  return {
    id: row.id,
    implementationId: row.implementation_id,
    title: row.title_snapshot,
    description: row.description_snapshot,
    category: row.category_snapshot,
    guidance: row.guidance_snapshot,
    responsibilityType: row.responsibility_type_snapshot,
    evidenceRequired: row.evidence_required_snapshot,
    priority: row.priority_snapshot,
    position: row.position,
    isRequired: row.is_required,
    status: row.status,
    responsibleUserId: row.responsible_usuario_id,
    responsibleName: row.responsible_usuario_id
      ? names.get(row.responsible_usuario_id) || null
      : null,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    notes: row.notes,
  };
}

export async function getStoreImplementation(
  storeId: string,
): Promise<{ implementation: StoreImplementation; items: ImplementationItem[] } | null> {
  const { data: implementation, error } = await supabase
    .from('store_implementations')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!implementation) return null;

  const { data: items, error: itemsError } = await supabase
    .from('store_implementation_items')
    .select('*')
    .eq('implementation_id', implementation.id)
    .order('position')
    .order('created_at');
  if (itemsError) throw itemsError;

  const ids = [
    implementation.coordinator_usuario_id,
    ...items.map((item) => item.responsible_usuario_id),
  ].filter((id): id is string => Boolean(id));
  const names = await userNames(ids);
  const { data: version, error: versionError } = await supabase
    .from('checklist_master_versions')
    .select('name')
    .eq('id', implementation.checklist_version_id)
    .single();
  if (versionError) throw versionError;

  return {
    implementation: {
      id: implementation.id,
      storeId: implementation.store_id,
      checklistVersionId: implementation.checklist_version_id,
      checklistVersionName: version.name,
      status: implementation.status,
      coordinatorUserId: implementation.coordinator_usuario_id,
      coordinatorName: implementation.coordinator_usuario_id
        ? names.get(implementation.coordinator_usuario_id) || null
        : null,
      baseDate: implementation.base_date,
      startedAt: implementation.started_at,
      completedAt: implementation.completed_at,
    },
    items: items.map((item) => mapItem(item, names)),
  };
}

export async function startStoreImplementation(
  storeId: string,
  versionId: string,
  baseDate: string,
  coordinatorUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('start_store_implementation', {
    p_store_id: storeId,
    p_checklist_version_id: versionId,
    p_base_date: baseDate,
    ...(coordinatorUserId ? { p_coordinator_usuario_id: coordinatorUserId } : {}),
  });
  if (error) throw error;
  if (!data) throw new Error('A implantacao nao foi criada.');
  return data;
}

export async function updateImplementationItem(
  itemId: string,
  values: {
    status: ImplementationItemStatus;
    responsibleUserId: string;
    dueDate: string;
    notes: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc('update_store_implementation_item', {
    p_item_id: itemId,
    p_status: values.status,
    ...(values.responsibleUserId ? { p_responsible_usuario_id: values.responsibleUserId } : {}),
    ...(values.dueDate ? { p_due_date: values.dueDate } : {}),
    ...(values.notes ? { p_notes: values.notes } : {}),
  });
  if (error) throw error;
}

export function calculateProgress(items: ImplementationItem[]): ImplementationProgress {
  const relevant = items.filter((item) => item.status !== 'not_applicable');
  const today = new Date().toISOString().slice(0, 10);
  const completed = relevant.filter((item) => item.status === 'completed').length;
  return {
    total: relevant.length,
    completed,
    inProgress: relevant.filter((item) => item.status === 'in_progress').length,
    pending: relevant.filter((item) => item.status === 'pending').length,
    blocked: relevant.filter((item) => item.status === 'blocked').length,
    overdue: relevant.filter(
      (item) => item.dueDate && item.dueDate < today && item.status !== 'completed',
    ).length,
    percentage: relevant.length ? Math.round((completed / relevant.length) * 100) : 0,
  };
}

export async function listPendingImplementationItems(): Promise<PendingImplementationItem[]> {
  const [implementations, allItems, storesResult] = await Promise.all([
    implementationRows(),
    implementationItemRows(),
    supabase.from('lojas').select('id, codigo_negocio, nome'),
  ]);
  if (storesResult.error) throw storesResult.error;

  const implementationById = new Map(implementations.map((item) => [item.id, item]));
  const storeById = new Map(storesResult.data.map((store) => [store.id, store]));
  const pending = allItems.filter((item) => !['completed', 'not_applicable'].includes(item.status));
  const names = await userNames(
    pending.map((item) => item.responsible_usuario_id).filter((id): id is string => Boolean(id)),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return pending
    .flatMap((row) => {
      const implementation = implementationById.get(row.implementation_id);
      const store = implementation ? storeById.get(implementation.store_id) : null;
      if (!implementation || !store) return [];
      const due = row.due_date ? new Date(`${row.due_date}T00:00:00`) : null;
      const overdueDays =
        due && due < today ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0;
      return [
        {
          ...mapItem(row, names),
          storeId: store.id,
          storeCode: store.codigo_negocio,
          storeName: store.nome,
          overdueDays,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.overdueDays - a.overdueDays || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    );
}
