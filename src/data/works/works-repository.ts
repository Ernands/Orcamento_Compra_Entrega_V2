import type { Database, Json } from '../supabase/database.types';
import { supabase } from '../supabase/client';
import { moneyToCents } from '../../domain/supply-calculations';
import type {
  FinanceStoreBudget,
  WorkDocumentValues,
  WorkPaymentValues,
  WorkService,
  WorkServiceComponent,
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
type WorkComponentRow = Database['public']['Tables']['works_service_components']['Row'];
type WorkPaymentRow = Database['public']['Tables']['works_service_payments']['Row'];
type WorkDocumentRow = Database['public']['Tables']['works_service_documents']['Row'];
type BudgetRow = Database['public']['Tables']['finance_store_budgets']['Row'];

function numericMoney(value: string): number {
  return Number(moneyToCents(value || '0')) / 100;
}

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

function mapComponent(row: WorkComponentRow): WorkServiceComponent {
  return {
    id: row.id,
    serviceId: row.service_id,
    storeId: row.store_id,
    category: row.category,
    description: row.description,
    amount: stringValue(row.amount),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapService(
  row: WorkServiceRow,
  payments: WorkPaymentRow[],
  documents: WorkDocumentRow[],
  components: WorkComponentRow[],
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
    components: components
      .filter((component) => component.service_id === row.id)
      .map(mapComponent)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function listWorkServices(): Promise<WorkService[]> {
  const [servicesResult, paymentsResult, documentsResult, componentsResult] = await Promise.all([
    supabase.from('works_services').select('*').order('updated_at', { ascending: false }),
    supabase
      .from('works_service_payments')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('works_service_documents').select('*').order('created_at', { ascending: false }),
    supabase.from('works_service_components').select('*').order('sort_order', { ascending: true }),
  ]);

  const error =
    servicesResult.error || paymentsResult.error || documentsResult.error || componentsResult.error;
  if (error) throw error;

  const payments = paymentsResult.data || [];
  const documents = documentsResult.data || [];
  const components = componentsResult.data || [];
  return (servicesResult.data || []).map((service) =>
    mapService(service, payments, documents, components),
  );
}

export async function saveWorkService(values: WorkServiceValues): Promise<string> {
  const components = values.components.map((component) => ({
    category: component.category.trim(),
    description: component.description.trim(),
    amount: numericMoney(component.amount),
  })) as Json;
  const { data, error } = await supabase.rpc('save_work_service_v2', {
    p_service_id: (values.id || null) as unknown as string,
    p_store_id: values.storeId,
    p_category: values.category.trim(),
    p_description: values.description.trim(),
    p_provider_name: values.providerName.trim(),
    p_provider_tax_id: values.providerTaxId.trim(),
    p_provider_phone: values.providerPhone.trim(),
    p_contracted_amount: numericMoney(values.contractedAmount),
    p_budget_amount: numericMoney(values.budgetAmount),
    p_status: values.status,
    p_progress_percent: values.progressPercent,
    p_planned_start_date: (values.plannedStartDate || null) as unknown as string,
    p_planned_end_date: (values.plannedEndDate || null) as unknown as string,
    p_notes: values.notes.trim(),
    p_components: components,
  });
  if (error) throw error;
  return data;
}

export async function saveWorkPayments(values: WorkPaymentValues[]): Promise<string[]> {
  const ids = values.map((value) => value.id || crypto.randomUUID());
  const payload = values.map((value, index) => ({
    id: ids[index],
    service_id: value.serviceId,
    store_id: value.storeId,
    label: value.label.trim(),
    payment_method: value.paymentMethod.trim(),
    source_label: value.sourceLabel.trim() || null,
    due_date: value.dueDate || null,
    amount: numericMoney(value.amount),
    status: value.status,
    paid_at: value.status === 'paid' ? value.paidAt || new Date().toISOString() : null,
    notes: value.notes.trim() || null,
  }));

  const { error } = await supabase
    .from('works_service_payments')
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  return ids;
}

export async function saveWorkPayment(values: WorkPaymentValues): Promise<string> {
  const [id] = await saveWorkPayments([values]);
  return id;
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
      document_amount: values.documentAmount.trim() ? numericMoney(values.documentAmount) : null,
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
      budget_amount: numericMoney(budgetAmount),
      notes: notes.trim() || null,
    },
    { onConflict: 'store_id' },
  );
  if (error) throw error;
}
