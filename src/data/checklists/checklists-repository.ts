import type { ChecklistItem, ChecklistItemValues, ChecklistVersion } from '../../domain/types';
import { supabase } from '../supabase/client';

type ItemRow = Awaited<ReturnType<typeof itemRows>>[number];

async function itemRows() {
  const { data, error } = await supabase.from('checklist_master_items').select('*');
  if (error) throw error;
  return data;
}

function mapItem(row: ItemRow): ChecklistItem {
  return {
    id: row.id,
    versionId: row.version_id,
    title: row.title,
    description: row.description,
    category: row.category,
    position: row.position,
    isRequired: row.is_required,
    isActive: row.is_active,
    relativeDueDays: row.relative_due_days,
    guidance: row.guidance,
    responsibilityType: row.responsibility_type,
    evidenceRequired: row.evidence_required,
    priority: row.priority,
  };
}

function itemPayload(values: ChecklistItemValues) {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    category: values.category.trim(),
    position: values.position,
    is_required: values.isRequired,
    is_active: values.isActive,
    relative_due_days: values.relativeDueDays,
    guidance: values.guidance?.trim() || null,
    responsibility_type: values.responsibilityType?.trim() || null,
    evidence_required: values.evidenceRequired,
    priority: values.priority,
  };
}

export async function listChecklistVersions(): Promise<ChecklistVersion[]> {
  const [versionsResult, items] = await Promise.all([
    supabase
      .from('checklist_master_versions')
      .select('*')
      .order('version_number', { ascending: false }),
    itemRows(),
  ]);
  if (versionsResult.error) throw versionsResult.error;

  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.version_id, (counts.get(item.version_id) || 0) + 1));
  return versionsResult.data.map((version) => ({
    id: version.id,
    versionNumber: version.version_number,
    name: version.name,
    status: version.status,
    notes: version.notes,
    publishedAt: version.published_at,
    createdAt: version.created_at,
    itemCount: counts.get(version.id) || 0,
  }));
}

export async function listPublishedChecklistVersions(): Promise<ChecklistVersion[]> {
  return (await listChecklistVersions()).filter((version) => version.status === 'published');
}

export async function listChecklistItems(versionId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('checklist_master_items')
    .select('*')
    .eq('version_id', versionId)
    .order('position')
    .order('created_at');
  if (error) throw error;
  return data.map(mapItem);
}

export async function createChecklistVersion(
  name: string,
  notes: string,
  sourceVersionId?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_checklist_version', {
    p_name: name,
    ...(notes ? { p_notes: notes } : {}),
    ...(sourceVersionId ? { p_source_version_id: sourceVersionId } : {}),
  });
  if (error) throw error;
  if (!data) throw new Error('A versao nao foi criada.');
  return data;
}

export async function publishChecklistVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_checklist_version', { p_version_id: versionId });
  if (error) throw error;
}

export async function updateChecklistVersion(
  versionId: string,
  name: string,
  notes: string,
): Promise<void> {
  const { error } = await supabase
    .from('checklist_master_versions')
    .update({ name: name.trim(), notes: notes.trim() || null })
    .eq('id', versionId);
  if (error) throw error;
}

export async function createChecklistItem(
  versionId: string,
  values: ChecklistItemValues,
): Promise<void> {
  const { error } = await supabase
    .from('checklist_master_items')
    .insert({ version_id: versionId, ...itemPayload(values) });
  if (error) throw error;
}

export async function updateChecklistItem(
  itemId: string,
  values: ChecklistItemValues,
): Promise<void> {
  const { error } = await supabase
    .from('checklist_master_items')
    .update(itemPayload(values))
    .eq('id', itemId);
  if (error) throw error;
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('checklist_master_items').delete().eq('id', itemId);
  if (error) throw error;
}
