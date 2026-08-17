export type UserStatus = 'active' | 'inactive' | 'blocked';
export type StoreStatus = 'planning' | 'active' | 'inactive';
export type ChecklistVersionStatus = 'draft' | 'published' | 'archived';
export type ImplementationStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';
export type ImplementationItemStatus =
  'pending' | 'in_progress' | 'completed' | 'blocked' | 'not_applicable';
export type NeedPriority = 'low' | 'normal' | 'high' | 'critical';
export type NeedStatus = 'identified' | 'under_review' | 'resolved' | 'cancelled';
export type NeedOrigin = 'manual' | 'implementation';
export type AttachmentCategory =
  'project' | 'construction' | 'document' | 'photo' | 'contract' | 'quote' | 'receipt' | 'other';
export type SupplyItemType = 'product' | 'service';
export type SupplierPersonType = 'legal' | 'individual';
export type SupplierChannelType =
  'local_city' | 'state_capital' | 'regional' | 'national' | 'ecommerce';
export type SupplyQuoteStatus = 'draft' | 'received' | 'expired' | 'cancelled';
export type SupplyQuoteContext = 'store' | 'consolidated';
export type SupplyShippingType = 'free' | 'informed' | 'pending';

export type Capability =
  | 'stores.view'
  | 'stores.create'
  | 'stores.edit'
  | 'stores.delete'
  | 'access.view'
  | 'access.create'
  | 'access.edit'
  | 'access.disable'
  | 'access.reset_password'
  | 'checklists.view'
  | 'checklists.manage'
  | 'implementation.view'
  | 'implementation.edit'
  | 'needs.view'
  | 'needs.create'
  | 'needs.edit'
  | 'attachments.view'
  | 'attachments.create'
  | 'attachments.delete'
  | 'items.view'
  | 'items.manage'
  | 'suppliers.view'
  | 'suppliers.manage'
  | 'quotes.view'
  | 'quotes.create'
  | 'quotes.edit';

export interface Profile {
  id: string;
  key: string;
  name: string;
}

export interface Viewer {
  id: string;
  authUserId: string;
  name: string;
  status: UserStatus;
  mustChangePassword: boolean;
  allStores: boolean;
  profile: Profile;
  capabilities: Capability[];
}

export interface Store {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  status: StoreStatus;
  plannedOpeningDate: string | null;
  notes: string | null;
}

export interface StoreFormValues {
  name: string;
  city: string;
  state: string;
  address: string;
  responsibleUserId: string;
  status: StoreStatus;
  plannedOpeningDate: string;
  notes: string;
}

export interface ResponsibleUser {
  id: string;
  name: string;
}

export interface ChecklistVersion {
  id: string;
  versionNumber: number;
  name: string;
  status: ChecklistVersionStatus;
  notes: string | null;
  publishedAt: string | null;
  createdAt: string;
  itemCount: number;
}

export interface ChecklistItem {
  id: string;
  versionId: string;
  title: string;
  description: string | null;
  category: string;
  position: number;
  isRequired: boolean;
  isActive: boolean;
  relativeDueDays: number | null;
  guidance: string | null;
  responsibilityType: string | null;
  evidenceRequired: boolean;
  priority: NeedPriority;
}

export type ChecklistItemValues = Omit<ChecklistItem, 'id' | 'versionId'>;

export interface StoreImplementation {
  id: string;
  storeId: string;
  checklistVersionId: string;
  checklistVersionName: string;
  status: ImplementationStatus;
  coordinatorUserId: string | null;
  coordinatorName: string | null;
  baseDate: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ImplementationItem {
  id: string;
  implementationId: string;
  title: string;
  description: string | null;
  category: string;
  guidance: string | null;
  responsibilityType: string | null;
  evidenceRequired: boolean;
  priority: NeedPriority;
  position: number;
  isRequired: boolean;
  status: ImplementationItemStatus;
  responsibleUserId: string | null;
  responsibleName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
}

export interface ImplementationProgress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  overdue: number;
  percentage: number;
}

export interface PendingImplementationItem extends ImplementationItem {
  storeId: string;
  storeCode: string;
  storeName: string;
  overdueDays: number;
}

export interface StoreNeed {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  category: string;
  quantity: number;
  unit: string | null;
  priority: NeedPriority;
  status: NeedStatus;
  notes: string | null;
  origin: NeedOrigin;
  sourceImplementationItemId: string | null;
  supplyItemId: string | null;
  createdAt: string;
}

export interface StoreNeedValues {
  title: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  priority: NeedPriority;
  status: NeedStatus;
  notes: string;
}

export interface StoreAttachment {
  id: string;
  storeId: string;
  originalName: string;
  storagePath: string;
  category: AttachmentCategory;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SupplyItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  type: SupplyItemType;
  defaultUnit: string;
  brandReference: string | null;
  technicalSpecification: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplyItemValues {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  type: SupplyItemType;
  defaultUnit: string;
  brandReference: string;
  technicalSpecification: string;
  active: boolean;
}

export interface SupplyNeed extends StoreNeed {
  storeCode: string;
  storeName: string;
  storeCity: string;
  storeState: string;
}

export interface SupplierChannel {
  id: string;
  supplierId: string;
  type: SupplierChannelType;
  label: string | null;
  city: string | null;
  state: string | null;
  servesNationally: boolean;
  active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  tradeName: string;
  legalName: string | null;
  personType: SupplierPersonType;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  channels: SupplierChannel[];
  latestQuoteDate: string | null;
}

export interface SupplierValues {
  id: string | null;
  tradeName: string;
  legalName: string;
  personType: SupplierPersonType;
  document: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  state: string;
  address: string;
  notes: string;
  active: boolean;
  channelId: string | null;
  channelType: SupplierChannelType;
  channelLabel: string;
  channelCity: string;
  channelState: string;
  servesNationally: boolean;
  channelActive: boolean;
}

export interface SupplyQuoteItemValues {
  key: string;
  supplyItemId: string;
  storeNeedId: string;
  storeId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount: string;
  shippingType: SupplyShippingType;
  shippingAmount: string;
  otherCosts: string;
  deliveryDays: string;
  minimumQuantity: string;
  offeredBrandModel: string;
  notes: string;
  productUrl: string;
  capturedAt: string;
}

export interface SupplyQuoteValues {
  id: string | null;
  supplierId: string;
  supplierChannelId: string;
  quoteDate: string;
  validUntil: string;
  contact: string;
  contextType: SupplyQuoteContext;
  status: SupplyQuoteStatus;
  notes: string;
  storeIds: string[];
  items: SupplyQuoteItemValues[];
}

export interface SupplyQuoteItem {
  id: string;
  quoteId: string;
  supplyItemId: string;
  itemCode: string;
  itemName: string;
  storeNeedId: string | null;
  needTitle: string | null;
  storeId: string | null;
  storeCode: string | null;
  storeName: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount: string;
  shippingType: SupplyShippingType;
  shippingAmount: string | null;
  otherCosts: string;
  deliveryDays: number | null;
  minimumQuantity: string | null;
  offeredBrandModel: string | null;
  notes: string | null;
  productUrl: string | null;
  capturedAt: string | null;
}

export interface SupplyQuote {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string;
  supplierChannelId: string;
  channel: SupplierChannelType;
  originCity: string | null;
  originState: string | null;
  quoteDate: string;
  validUntil: string | null;
  contact: string | null;
  contextType: SupplyQuoteContext;
  status: SupplyQuoteStatus;
  notes: string | null;
  createdAt: string;
  stores: Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>[];
  items: SupplyQuoteItem[];
}

export interface AccessUser {
  id: string;
  code: string;
  name: string;
  cpfLast4: string;
  status: UserStatus;
  mustChangePassword: boolean;
  allStores: boolean;
  profile: Profile;
  stores: Pick<Store, 'id' | 'code' | 'name'>[];
  lastLoginAt: string | null;
}

export interface AccessFormValues {
  name: string;
  cpf?: string;
  profileId: string;
  storeIds: string[];
  allStores: boolean;
  status: UserStatus;
  initialPassword?: string;
}
