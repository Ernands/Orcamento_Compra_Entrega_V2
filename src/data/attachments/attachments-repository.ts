import type { AttachmentCategory, StoreAttachment } from '../../domain/types';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/database.types';

const BUCKET = 'store-attachments';

type AttachmentRow = Database['public']['Tables']['store_attachments']['Row'];

function mapAttachment(row: AttachmentRow): StoreAttachment {
  return {
    id: row.id,
    storeId: row.store_id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    category: row.category as AttachmentCategory,
    description: row.description,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function listStoreAttachments(storeId: string): Promise<StoreAttachment[]> {
  const { data, error } = await supabase
    .from('store_attachments')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapAttachment);
}

function safeFileName(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

export async function uploadStoreAttachment(
  storeId: string,
  file: File,
  category: AttachmentCategory,
  description: string,
): Promise<void> {
  const attachmentId = crypto.randomUUID();
  const path = `lojas/${storeId}/loja/${attachmentId}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc('register_store_attachment', {
    p_store_id: storeId,
    p_original_name: file.name,
    p_storage_path: path,
    p_category: category,
    p_description: description.trim(),
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function createAttachmentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStoreAttachment(attachmentId: string): Promise<void> {
  const { data: path, error } = await supabase.rpc('delete_store_attachment', {
    p_attachment_id: attachmentId,
  });
  if (error) throw error;
  if (!path) throw new Error('Storage path ausente para o anexo.');
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
  if (storageError) throw storageError;
}
