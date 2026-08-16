export type UserStatus = 'active' | 'inactive' | 'blocked';
export type StoreStatus = 'planning' | 'active' | 'inactive';

export type Capability =
  | 'stores.view'
  | 'stores.create'
  | 'stores.edit'
  | 'stores.delete'
  | 'access.view'
  | 'access.create'
  | 'access.edit'
  | 'access.disable'
  | 'access.reset_password';

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
  responsibleName: string | null;
  status: StoreStatus;
  plannedOpeningDate: string | null;
  notes: string | null;
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
