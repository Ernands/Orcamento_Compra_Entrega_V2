import { supabase } from '../supabase/client';
import { moneyToCents } from '../../domain/supply-calculations';
import type {
  FinanceAccountAttachment,
  FinanceAccountDayRecord,
  FinanceAccountEntryType,
  FinanceAccountManualEntry,
} from '../../domain/finance-account-reconciliation';

const BUCKET = 'finance-reconciliation';
const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

type Numeric = string | number;
type DayRow = {
  id: string;
  reconciliation_date: string;
  bank_payments_amount: Numeric | null;
  bank_balance: Numeric | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type EntryRow = {
  id: string;
  entry_date: string;
  entry_type: FinanceAccountEntryType;
  amount: Numeric;
  reason: string;
  notes: string | null;
  status: 'active' | 'cancelled';
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
type AttachmentRow = {
  id: string;
  entry_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

function cents(value: Numeric | null): bigint | null {
  if (value === null) return null;
  return moneyToCents(String(value));
}

function decimalMoney(value: string): string {
  const parsed = moneyToCents(value);
  const sign = parsed < 0n ? '-' : '';
  const absolute = parsed < 0n ? -parsed : parsed;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

function validateFile(file: File): void {
  const type = file.type.trim().toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(type)) {
    throw new Error('Formato de arquivo não permitido. Use PDF, JPG, PNG ou WEBP.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Cada arquivo deve ter no máximo 25 MB.');
  }
}

function mapAttachment(row: AttachmentRow): FinanceAccountAttachment {
  return {
    id: row.id,
    entryId: row.entry_id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function listFinanceAccountDays(): Promise<FinanceAccountDayRecord[]> {
  const { data, error } = await supabase
    .from('finance_account_days' as never)
    .select('*')
    .order('reconciliation_date', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as DayRow[]).map((row) => ({
    id: row.id,
    date: row.reconciliation_date,
    bankPaymentsCents: cents(row.bank_payments_amount),
    bankBalanceCents: cents(row.bank_balance),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listFinanceAccountEntries(): Promise<FinanceAccountManualEntry[]> {
  const [entryResult, attachmentResult] = await Promise.all([
    supabase
      .from('finance_account_entries' as never)
      .select('*')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('finance_account_entry_attachments' as never)
      .select('*')
      .order('created_at', { ascending: true }),
  ]);
  if (entryResult.error) throw entryResult.error;
  if (attachmentResult.error) throw attachmentResult.error;

  const attachments = (attachmentResult.data || []) as unknown as AttachmentRow[];
  return ((entryResult.data || []) as unknown as EntryRow[]).map((row) => ({
    id: row.id,
    date: row.entry_date,
    type: row.entry_type,
    amountCents: cents(row.amount) || 0n,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: attachments.filter((attachment) => attachment.entry_id === row.id).map(mapAttachment),
  }));
}

export async function saveFinanceAccountDay(input: {
  date: string;
  bankPayments: string;
  bankBalance: string;
  notes: string;
}): Promise<void> {
  const payload = {
    reconciliation_date: input.date,
    bank_payments_amount: input.bankPayments.trim() ? decimalMoney(input.bankPayments) : null,
    bank_balance: input.bankBalance.trim() ? decimalMoney(input.bankBalance) : null,
    notes: input.notes.trim() || null,
  };
  const { error } = await supabase
    .from('finance_account_days' as never)
    .upsert(payload as never, { onConflict: 'reconciliation_date' });
  if (error) throw error;
}

async function uploadEntryFiles(entryId: string, files: File[]): Promise<void> {
  for (const file of files) {
    validateFile(file);
    const attachmentId = crypto.randomUUID();
    const type = file.type.trim().toLowerCase();
    const path = `lancamentos/${entryId}/${attachmentId}/${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: metadataError } = await supabase
      .from('finance_account_entry_attachments' as never)
      .insert({
        id: attachmentId,
        entry_id: entryId,
        original_name: file.name,
        storage_path: path,
        mime_type: type,
        size_bytes: file.size,
      } as never);
    if (metadataError) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw metadataError;
    }
  }
}

export async function createFinanceAccountEntry(input: {
  date: string;
  type: FinanceAccountEntryType;
  amount: string;
  reason: string;
  notes: string;
  files: File[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('finance_account_entries' as never)
    .insert({
      entry_date: input.date,
      entry_type: input.type,
      amount: decimalMoney(input.amount),
      reason: input.reason.trim(),
      notes: input.notes.trim() || null,
    } as never)
    .select('id')
    .single();
  if (error) throw error;
  const entryId = (data as unknown as { id: string }).id;
  await uploadEntryFiles(entryId, input.files);
  return entryId;
}

export async function cancelFinanceAccountEntry(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('finance_account_entries' as never)
    .update({
      status: 'cancelled',
      cancellation_reason: reason.trim(),
      cancelled_at: new Date().toISOString(),
    } as never)
    .eq('id', entryId);
  if (error) throw error;
}

export async function createFinanceAccountAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 15 * 60);
  if (error) throw error;
  return data.signedUrl;
}
