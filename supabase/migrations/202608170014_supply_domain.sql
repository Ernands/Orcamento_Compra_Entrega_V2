create type public.supply_item_type as enum ('product', 'service');
create type public.supplier_person_type as enum ('legal', 'individual');
create type public.supplier_channel_type as enum (
  'local_city', 'state_capital', 'regional', 'national', 'ecommerce'
);
create type public.supply_quote_status as enum ('draft', 'received', 'expired', 'cancelled');
create type public.supply_quote_context as enum ('store', 'consolidated');
create type public.supply_shipping_type as enum ('free', 'informed', 'pending');

create sequence public.supply_item_codigo_seq start with 1 increment by 1;
create sequence public.supplier_codigo_seq start with 1 increment by 1;
create sequence public.supply_quote_codigo_seq start with 1 increment by 1;

create table public.supply_items (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('ITM-' || lpad(nextval('public.supply_item_codigo_seq')::text, 4, '0'))
    check (codigo_negocio ~ '^ITM-[0-9]{4,}$'),
  name text not null check (length(trim(name)) between 2 and 180),
  description text check (description is null or length(description) <= 3000),
  category text not null check (length(trim(category)) between 2 and 100),
  subcategory text check (subcategory is null or length(trim(subcategory)) between 2 and 100),
  item_type public.supply_item_type not null,
  default_unit text not null check (length(trim(default_unit)) between 1 and 40),
  brand_reference text check (brand_reference is null or length(brand_reference) <= 180),
  technical_specification text check (
    technical_specification is null or length(technical_specification) <= 5000
  ),
  active boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('FOR-' || lpad(nextval('public.supplier_codigo_seq')::text, 4, '0'))
    check (codigo_negocio ~ '^FOR-[0-9]{4,}$'),
  trade_name text not null check (length(trim(trade_name)) between 2 and 180),
  legal_name text check (legal_name is null or length(trim(legal_name)) between 2 and 220),
  person_type public.supplier_person_type not null default 'legal',
  document text check (document is null or length(document) between 5 and 30),
  contact_name text check (contact_name is null or length(contact_name) <= 160),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 254),
  website text check (website is null or length(website) <= 1000),
  city text check (city is null or length(trim(city)) between 2 and 120),
  state text check (
    state is null or state in (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
      'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )
  ),
  address text check (address is null or length(address) <= 1000),
  notes text check (notes is null or length(notes) <= 3000),
  active boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_document_unique_idx
on public.suppliers(document)
where document is not null;

create table public.supplier_channels (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  channel_type public.supplier_channel_type not null,
  label text check (label is null or length(trim(label)) between 2 and 120),
  city text check (city is null or length(trim(city)) between 2 and 120),
  state text check (
    state is null or state in (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
      'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )
  ),
  serves_nationally boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (supplier_id, channel_type, city, state),
  unique (id, supplier_id)
);

create table public.supply_quotes (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('COT-' || lpad(nextval('public.supply_quote_codigo_seq')::text, 5, '0'))
    check (codigo_negocio ~ '^COT-[0-9]{5,}$'),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_channel_id uuid not null,
  supplier_name_snapshot text not null check (length(trim(supplier_name_snapshot)) between 2 and 180),
  channel_snapshot public.supplier_channel_type not null,
  origin_city_snapshot text,
  origin_state_snapshot text,
  quote_date date not null,
  valid_until date,
  contact_snapshot text check (contact_snapshot is null or length(contact_snapshot) <= 300),
  context_type public.supply_quote_context not null,
  status public.supply_quote_status not null default 'draft',
  notes text check (notes is null or length(notes) <= 3000),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (supplier_channel_id, supplier_id)
    references public.supplier_channels(id, supplier_id) on delete restrict,
  check (valid_until is null or valid_until >= quote_date),
  check (origin_state_snapshot is null or origin_state_snapshot ~ '^[A-Z]{2}$')
);

create table public.supply_quote_stores (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supply_quotes(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quote_id, store_id)
);

create table public.supply_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supply_quotes(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  store_need_id uuid references public.store_needs(id) on delete restrict,
  store_id uuid references public.lojas(id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 40),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  shipping_type public.supply_shipping_type not null default 'pending',
  shipping_amount numeric(14, 2),
  other_costs numeric(14, 2) not null default 0 check (other_costs >= 0),
  delivery_days integer check (delivery_days is null or delivery_days >= 0),
  minimum_quantity numeric(14, 3) check (minimum_quantity is null or minimum_quantity > 0),
  offered_brand_model text check (offered_brand_model is null or length(offered_brand_model) <= 300),
  notes text check (notes is null or length(notes) <= 3000),
  product_url text check (product_url is null or product_url ~* '^https?://'),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount <= round(quantity * unit_price, 2)),
  check (
    (shipping_type = 'free' and shipping_amount = 0)
    or (shipping_type = 'informed' and shipping_amount is not null and shipping_amount >= 0)
    or (shipping_type = 'pending' and shipping_amount is null)
  ),
  check (store_need_id is null or store_id is not null)
);

alter table public.store_needs
add column supply_item_id uuid references public.supply_items(id) on delete restrict;

create index supply_items_category_active_idx on public.supply_items(category, active, name);
create index supply_items_type_idx on public.supply_items(item_type, active);
create index suppliers_location_active_idx on public.suppliers(state, city, active);
create index supplier_channels_supplier_idx on public.supplier_channels(supplier_id, active);
create index supplier_channels_type_idx on public.supplier_channels(channel_type, active);
create index supply_quotes_supplier_date_idx on public.supply_quotes(supplier_id, quote_date desc);
create index supply_quotes_status_date_idx on public.supply_quotes(status, quote_date desc);
create index supply_quotes_channel_idx on public.supply_quotes(channel_snapshot, quote_date desc);
create index supply_quote_stores_store_idx on public.supply_quote_stores(store_id, quote_id);
create index supply_quote_items_quote_idx on public.supply_quote_items(quote_id, created_at);
create index supply_quote_items_item_idx on public.supply_quote_items(supply_item_id, quote_id);
create index supply_quote_items_store_idx on public.supply_quote_items(store_id, supply_item_id)
where store_id is not null;
create index supply_quote_items_need_idx on public.supply_quote_items(store_need_id)
where store_need_id is not null;
create index store_needs_supply_item_idx on public.store_needs(supply_item_id, store_id)
where supply_item_id is not null;

create trigger supply_items_set_updated_at before update on public.supply_items
for each row execute function app.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function app.set_updated_at();
create trigger supplier_channels_set_updated_at before update on public.supplier_channels
for each row execute function app.set_updated_at();
create trigger supply_quotes_set_updated_at before update on public.supply_quotes
for each row execute function app.set_updated_at();
create trigger supply_quote_items_set_updated_at before update on public.supply_quote_items
for each row execute function app.set_updated_at();

alter table public.supply_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_channels enable row level security;
alter table public.supply_quotes enable row level security;
alter table public.supply_quote_stores enable row level security;
alter table public.supply_quote_items enable row level security;
