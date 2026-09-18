import type { Database } from '../supabase/database.types';
import { supabase } from '../supabase/client';
import type {
  FinanceStoreBudget,
  WorkDocumentValues,
  WorkPaymentValues,
  WorkService,
  WorkServiceDocument,
  WorkServicePayment,
  WorkServiceValues,
} from '../../domain/works-types';

const WORKS_BUCKET = 'works-documents';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type WorkServiceRow = Database['public']['Tables']['works_services']['Row'];
type WorkPaymentRow = Database['public']['Tables']['works_service_payments']['Row'];
type WorkDocumentRow = Database['public']['Tables']['works_service_documents']['Row'];
type BudgetRow = Database['public']['Tables']['finance_store_budgets']['Row'];

function stringValue(value: number | string | null | undefined): string {
  return value === null || value === undefined ? '0' : String(value);
}

function nullableStringValue(value: number | string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapPayment(row: WorkPaymentRow): WorkServicePayment {
  return {
    id: row.id,
    serviceId: row.service_id,
    storeId: row.store_id,
    label: row.label,
    paymentMethod: row.payment_method,
    sourceLabel: row.source_label,
    dueDate: row.due_date,
    amount: stringValue(row.amount),
    status: row.status as WorkServicePayment['status'],
    paidAt: row.paid_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: WorkDocumentRow): WorkServiceDocument {
  return {
    id: row.id,
    serviceId: row.service_id,
    storeId: row.store_id,
    paymentId: row.payment_id,
    documentType: row.document_type as WorkServiceDocument['documentType'],
    documentNumber: row.document_number,
    documentDate: row.document_date,
    documentAmount: nullableStringValue(row.document_amount),
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status as WorkServiceDocument['status'],
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapService(
  row: WorkServiceRow,
  payments: WorkPaymentRow[],
  documents: WorkDocumentRow[],
): WorkService {
  return {
    id: row.id,
    code: row.codigo_negocio,
    storeId: row.store_id,
    storeCode: row.store_code_snapshot,
    storeName: row.store_name_snapshot,
    storeCity: row.store_city_snapshot,
    storeState: row.store_state_snapshot,
    category: row.category,
    description: row.description,
    providerName: row.provider_name,
    providerTaxId: row.provider_tax_id,
    providerPhone: row.provider_phone,
    budgetAmount: stringValue(row.budget_amount),
    contractedAmount: stringValue(row.contracted_amount),
    status: row.status as WorkService['status'],
    progressPercent: row.progress_percent,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payments: payments
      .filter((payment) => payment.service_id === row.id)
      .map(mapPayment)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.createdAt.localeCompare(b.createdAt)),
    documents: documents
      .filter((document) => document.service_id === row.id)
      .map(mapDocument)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function listWorkServices(): Promise<WorkService[]> {
  const [servicesResult, paymentsResult, documentsResult] = await Promise.all([
    supabase.from('works_services').select('*').order('updated_at', { ascending: false }),
    supabase
      .from('works_service_payments')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('works_service_documents')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);

  const error =
    servicesResult.error || paymentsResult.error || documentsResult.error;
  if (error) throw error;

  const payments = paymentsResult.data || [];
  const documents = documentsResult.data || [];
  return (servicesResult.data || []).map((service) => mapService(service, payments, documents));
}

export async function saveWorkService(values: WorkServiceValues): Promise<string> {
  const payload = {
    store_id: values.storeId,
    store_code_snapshot: '-',
    store_name_snapshot: '-',
    store_city_snapshot: '-',
    store_state_snapshot: '-',
    category: values.category.trim(),
    description: values.description.trim(),
    provider_name: values.providerName.trim() || null,
    provider_tax_id: values.providerTaxId.trim() || null,
    provider_phone: values.providerPhone.trim() || null,
    budget_amount: values.budgetAmount || '0',
    contracted_amount: values.contractedAmount || '0',
    status: values.status,
    progress_percent: values.progressPercent,
    planned_start_date: values.plannedStartDate || null,
    planned_end_date: values.plannedEndDate || null,
    notes: values.notes.trim() || null,
  };

  if (values.id) {
    const { error } = await supabase.from('works_services').update(payload).eq('id', values.id);
    if (error) throw error;
    return values.id;
  }

  const { data, error } = await supabase
    .from('works_services')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function saveWorkPayment(values: WorkPaymentValues): Promise<string> {
  const payload = {
    service_id: values.serviceId,
    store_id: values.storeId,
    label: values.label.trim(),
    payment_method: values.paymentMethod.trim(),
    source_label: values.sourceLabel.trim() || null,
    due_date: values.dueDate || null,
    amount: values.amount,
    status: values.status,
    paid_at: values.status === 'paid' ? values.paidAt || new Date().toISOString() : null,
    notes: values.notes.trim() || null,
  };

  if (values.id) {
    const { error } = await supabase
      .from('works_service_payments')
      .update(payload)
      .eq('id', values.id);
    if (error) throw error;
    return values.id;
  }

  const { data, error } = await supabase
    .from('works_service_payments')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

function mimeType(file: File): string {
  return file.type.trim().toLowerCase();
}

function validateFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.has(mimeType(file))) {
    throw new Error('Formato de arquivo nao permitido.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('O arquivo deve ter no maximo 25 MB.');
  }
}

export async function saveWorkDocument(values: WorkDocumentValues): Promise<string> {
  let uploadedPath: string | null = null;
  let originalName: string | null = null;
  let type: string | null = null;
  let size: number | null = null;

  if (values.file) {
    validateFile(values.file);
    const documentId = crypto.randomUUID();
    uploadedPath = `obras/${values.storeId}/${values.serviceId}/${documentId}/${safeFileName(values.file.name)}`;
    originalName = values.file.name;
    type = mimeType(values.file);
    size = values.file.size;

    const { error: uploadError } = await supabase.storage
      .from(WORKS_BUCKET)
      .upload(uploadedPath, values.file, { contentType: type, upsert: false });
    if (uploadError) throw uploadError;
  }

  const { data, error } = await supabase
    .from('works_service_documents')
    .insert({
      service_id: values.serviceId,
      store_id: values.storeId,
      payment_id: values.paymentId || null,
      document_type: values.documentType,
      document_number: values.documentNumber.trim() || null,
      document_date: values.documentDate || null,
      document_amount: values.documentAmount.trim() || null,
      original_name: originalName,
      storage_path: uploadedPath,
      mime_type: type,
      size_bytes: size,
      status: values.status,
      notes: values.notes.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    if (uploadedPath) {
      await supabase.storage.from(WORKS_BUCKET).remove([uploadedPath]);
    }
    throw error;
  }

  return data.id;
}

export async function createWorkDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(WORKS_BUCKET)
    .createSignedUrl(storagePath, 15 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function listFinanceStoreBudgets(): Promise<FinanceStoreBudget[]> {
  const { data, error } = await supabase
    .from('finance_store_budgets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row: BudgetRow) => ({
    storeId: row.store_id,
    budgetAmount: stringValue(row.budget_amount),
    notes: row.notes,
    updatedAt: row.updated_at,
  }));
}

export async function saveFinanceStoreBudget(
  storeId: string,
  budgetAmount: string,
  notes = '',
): Promise<void> {
  const { error } = await supabase.from('finance_store_budgets').upsert(
    {
      store_id: storeId,
      budget_amount: budgetAmount || '0',
      notes: notes.trim() || null,
    },
    { onConflict: 'store_id' },
  );
  if (error) throw error;
}
