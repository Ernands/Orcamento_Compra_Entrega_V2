import type { SupplyQuoteAttachment } from '../../domain/types';
import { supabase } from '../supabase/client';

const BUCKET = 'quote-attachments';
export const MAX_QUOTE_ATTACHMENT_SIZE = 100 * 1024 * 1024;

export type QuoteDocumentType =
  | 'quote'
  | 'invoice'
  | 'receipt'
  | 'payment_proof'
  | 'boleto'
  | 'purchase_order'
  | 'reimbursement'
  | 'photo'
  | 'other';

export const QUOTE_DOCUMENT_LABELS: Record<QuoteDocumentType, string> = {
  quote: 'Cotacao / proposta',
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  payment_proof: 'Comprovante de pagamento',
  boleto: 'Boleto',
  purchase_order: 'Pedido / ordem de compra',
  reimbursement: 'Documento de reembolso',
  photo: 'Foto / evidencia',
  other: 'Outro',
};

export type QuoteAttachment = SupplyQuoteAttachment & { documentType: QuoteDocumentType };

export const QUOTE_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const MIME_BY_EXTENSION: Record<string, (typeof QUOTE_ATTACHMENT_MIME_TYPES)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

type AttachmentRow = {
  id: string;
  quote_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  document_type?: QuoteDocumentType;
  created_at: string;
};

function mapAttachment(row: AttachmentRow): QuoteAttachment {
  return {
    id: row.id,
    quoteId: row.quote_id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    description: row.description,
    documentType: row.document_type || 'quote',
    createdAt: row.created_at,
  };
}

export function quoteAttachmentMime(file: File): string | null {
  if (QUOTE_ATTACHMENT_MIME_TYPES.includes(file.type as never)) return file.type;
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('pt-BR') || '';
  return MIME_BY_EXTENSION[extension] || null;
}

export function validateQuoteAttachment(file: File): string | null {
  if (!quoteAttachmentMime(file)) return `Formato nao permitido: ${file.name}`;
  if (file.size <= 0) return `Arquivo vazio: ${file.name}`;
  if (file.size > MAX_QUOTE_ATTACHMENT_SIZE) return `Arquivo acima de 100 MB: ${file.name}`;
  return null;
}

function safeFileName(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (
    normalized
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(-120) || 'arquivo'
  );
}

export async function listSupplyQuoteAttachments(quoteId?: string): Promise<QuoteAttachment[]> {
  let query = supabase
    .from('supply_quote_attachments')
    .select('*')
    .order('created_at', { ascending: false });
  if (quoteId) query = query.eq('quote_id', quoteId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as AttachmentRow[]).map(mapAttachment);
}

export async function uploadSupplyQuoteAttachment(
  quoteId: string,
  file: File,
  description: string,
  documentType: QuoteDocumentType = 'quote',
): Promise<void> {
  const validationError = validateQuoteAttachment(file);
  if (validationError) throw new Error(validationError);
  const mimeType = quoteAttachmentMime(file);
  if (!mimeType) throw new Error('Formato de arquivo nao permitido.');

  const attachmentId = crypto.randomUUID();
  const path = `cotacoes/${quoteId}/${attachmentId}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc('register_supply_quote_attachment_v2' as never, {
    p_quote_id: quoteId,
    p_original_name: file.name,
    p_storage_path: path,
    p_mime_type: mimeType,
    p_size_bytes: file.size,
    p_description: description.trim(),
    p_document_type: documentType,
  } as never);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function createSupplyQuoteAttachmentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteSupplyQuoteAttachment(attachmentId: string): Promise<void> {
  const { data: path, error } = await supabase.rpc('delete_supply_quote_attachment', {
    p_attachment_id: attachmentId,
  });
  if (error) throw error;
  if (!path) throw new Error('Storage path ausente para o anexo.');
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
  if (storageError) throw storageError;
}
