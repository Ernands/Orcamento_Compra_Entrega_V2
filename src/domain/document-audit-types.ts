import type { ReimbursementFiscalDocument } from './finance-reimbursement';

export interface AuditDocumentLink {
  recordId: string;
  reference: string;
  supplier: string;
  storeIds: string[];
  explicitStores: boolean;
  orderId: string | null;
}

export interface AuditDocument extends ReimbursementFiscalDocument {
  key: string;
  mimeType: string | null;
  registeredAmount: string | null;
  links: AuditDocumentLink[];
  possibleLinks?: AuditDocumentLink[];
}

export interface AuditSystemItem {
  id: string;
  recordId: string;
  orderId: string | null;
  code: string | null;
  description: string;
  quantity: string | null;
  storeQuantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  subtotalCents: bigint | null;
  freightCents: bigint | null;
  discountCents: bigint | null;
  otherCents: bigint | null;
  totalCents: bigint | null;
  storeCents: bigint | null;
  storeIds: string[];
  included: boolean;
  stage: string;
}

export interface AuditRecord {
  id: string;
  reference: string;
  source: 'purchase' | 'work';
  supplier: string;
  description: string;
  status: string;
  active: boolean;
  storeIds: string[];
  totalCents: bigint | null;
  storeCents: bigint | null;
  budgetCents: bigint;
  items: AuditSystemItem[];
  documents: AuditDocument[];
}

export interface FiscalParty {
  name: string | null;
  taxId: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
}

export interface FiscalItem {
  id: string;
  code: string | null;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  productCents: bigint | null;
  freightCents: bigint | null;
  insuranceCents: bigint | null;
  discountCents: bigint | null;
  otherCents: bigint | null;
  ipiCents: bigint | null;
  stCents: bigint | null;
  includedInTotal: boolean | null;
  evidence: string;
}

export interface FiscalReading {
  source: 'xml' | 'pdf_text' | 'ocr' | 'unavailable' | 'unsupported';
  status: 'complete' | 'incomplete' | 'unreadable' | 'failed';
  model: string | null;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  issueDate: string | null;
  issuer: FiscalParty;
  recipient: FiscalParty;
  delivery: FiscalParty;
  items: FiscalItem[];
  totals: Record<string, bigint | null>;
  totalCents: bigint | null;
  warnings: string[];
  evidence: string;
  // Only a supported, complete structured document can establish exact matches.
  reliable: boolean;
  cancelled: boolean;
}

export interface AuditFile {
  document: AuditDocument;
  path: string | null;
  hash: string | null;
  duplicateOf: string | null;
  error: string | null;
  reading: FiscalReading;
}

export interface FiscalRecipient {
  name: string;
  taxId: string | null;
  storeId?: string;
}

export interface AuditFinding {
  recordIds: string[];
  references: string[];
  category: string;
  status:
    | 'Conferido'
    | 'Divergência'
    | 'Revisão manual'
    | 'Não verificável'
    | 'Sem nota ou recibo'
    | 'Documentado por recibo';
  systemItem: string | null;
  fiscalItem: string | null;
  fileKeys: string[];
  systemQuantity: string | null;
  fiscalQuantity: string | null;
  systemCents: bigint | null;
  fiscalCents: bigint | null;
  differenceCents: bigint | null;
  explanation: string;
  evidence: string;
}
