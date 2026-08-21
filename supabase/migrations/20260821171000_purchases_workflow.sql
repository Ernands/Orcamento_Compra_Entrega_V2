-- Fluxo Cotacao -> Aprovacao -> Compra -> Pagamento/Documentos.
-- A migracao e aditiva e mantem as RPCs antigas para compatibilidade durante o deploy.

alter table public.supply_quotes
  add column if not exists payment_method text
    check (payment_method is null or payment_method in (
      'pix', 'boleto', 'bank_transfer', 'credit_card', 'debit_card', 'cash', 'invoiced', 'other'
    )),
  add column if not exists entry_amount numeric(14, 2)
    check (entry_amount is null or entry_amount >= 0),
  add column if not exists installment_count integer
    check (installment_count is null or installment_count >= 1),
  add column if not exists payment_notes text
    check (payment_notes is null or length(payment_notes) <= 2000);

create or replace function app.can_edit_supply_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('quotes', 'edit')
    and exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
    )
    and not exists (
      select 1
      from public.supply_quote_stores quote_store
      where quote_store.quote_id = p_quote_id
        and not app.can_store('quotes', 'edit', quote_store.store_id)
    );
$$;

revoke all on function app.can_edit_supply_quote(uuid) from public, anon, authenticated;
grant execute on function app.can_edit_supply_quote(uuid) to authenticated, service_role;

create table if not exists public.supply_quote_attachments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supply_quotes(id) on delete restrict,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  storage_path text not null unique check (
    storage_path ~ '^cotacoes/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  description text check (description is null or length(description) <= 1000),
  document_type text not null default 'quote',
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references public.usuarios(id) on delete set null,
  deleted_at timestamptz
);

alter table public.supply_quote_attachments
  add column if not exists document_type text not null default 'quote';

alter table public.supply_quote_attachments
  drop constraint if exists supply_quote_attachments_document_type_check;
alter table public.supply_quote_attachments
  add constraint supply_quote_attachments_document_type_check check (
    document_type in (
      'quote', 'invoice', 'receipt', 'payment_proof', 'boleto', 'purchase_order',
      'reimbursement', 'photo', 'other'
    )
  );

create index if not exists supply_quote_attachments_quote_created_idx
on public.supply_quote_attachments(quote_id, created_at desc)
where deleted_at is null;

alter table public.supply_quote_attachments enable row level security;
drop policy if exists supply_quote_attachments_read_scoped on public.supply_quote_attachments;
create policy supply_quote_attachments_read_scoped
on public.supply_quote_attachments for select to authenticated
using (deleted_at is null and app.can_read_supply_quote(quote_id));

revoke all on table public.supply_quote_attachments from anon, authenticated;
grant select on table public.supply_quote_attachments to authenticated;
grant all on table public.supply_quote_attachments to service_role;

create or replace function public.register_supply_quote_attachment_v2(
  p_quote_id uuid,
  p_original_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text,
  p_document_type text
)
returns public.supply_quote_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_quote_attachments;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can_edit_supply_quote(p_quote_id) then
    raise exception 'permission denied';
  end if;

  if p_storage_path not like 'cotacoes/' || p_quote_id::text || '/%' then
    raise exception 'invalid storage path';
  end if;

  insert into public.supply_quote_attachments (
    quote_id, original_name, storage_path, mime_type, size_bytes, description, document_type, created_by
  ) values (
    p_quote_id,
    trim(p_original_name),
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    nullif(trim(p_description), ''),
    coalesce(nullif(trim(p_document_type), ''), 'quote'),
    v_actor
  ) returning * into v_attachment;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'quote.attachment.created',
    'quote_attachment',
    v_attachment.id,
    jsonb_build_object(
      'quote_id', p_quote_id,
      'original_name', v_attachment.original_name,
      'document_type', v_attachment.document_type,
      'mime_type', v_attachment.mime_type,
      'size_bytes', v_attachment.size_bytes
    ),
    'database'
  );

  return v_attachment;
end;
$$;

create or replace function public.register_supply_quote_attachment(
  p_quote_id uuid,
  p_original_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text
)
returns public.supply_quote_attachments
language sql
security definer
set search_path = ''
as $$
  select public.register_supply_quote_attachment_v2(
    p_quote_id,
    p_original_name,
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_description,
    'quote'
  );
$$;

create or replace function public.delete_supply_quote_attachment(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_quote_attachments;
  v_actor uuid := app.current_usuario_id();
begin
  select * into v_attachment
  from public.supply_quote_attachments
  where id = p_attachment_id and deleted_at is null
  for update;

  if v_attachment.id is null or not app.can_edit_supply_quote(v_attachment.quote_id) then
    raise exception 'permission denied';
  end if;

  update public.supply_quote_attachments
  set deleted_at = now(), deleted_by = v_actor
  where id = p_attachment_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'quote.attachment.deleted',
    'quote_attachment',
    p_attachment_id,
    jsonb_build_object(
      'quote_id', v_attachment.quote_id,
      'original_name', v_attachment.original_name,
      'document_type', v_attachment.document_type
    ),
    jsonb_build_object('deleted_at', now()),
    'database'
  );

  return v_attachment.storage_path;
end;
$$;

revoke all on function public.register_supply_quote_attachment_v2(uuid, text, text, text, bigint, text, text)
from public, anon, authenticated;
revoke all on function public.register_supply_quote_attachment(uuid, text, text, text, bigint, text)
from public, anon, authenticated;
revoke all on function public.delete_supply_quote_attachment(uuid)
from public, anon, authenticated;
grant execute on function public.register_supply_quote_attachment_v2(uuid, text, text, text, bigint, text, text)
to authenticated, service_role;
grant execute on function public.register_supply_quote_attachment(uuid, text, text, text, bigint, text)
to authenticated, service_role;
grant execute on function public.delete_supply_quote_attachment(uuid)
to authenticated, service_role;

create or replace function app.storage_quote_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_object_name ~ '^cotacoes/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      then split_part(p_object_name, '/', 2)::uuid
    else null
  end;
$$;

create or replace function app.can_read_supply_quote_attachment_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.supply_quote_attachments attachment
    where attachment.storage_path = p_object_name
      and attachment.deleted_at is null
      and attachment.quote_id = app.storage_quote_id(p_object_name)
      and app.can_read_supply_quote(attachment.quote_id)
  );
$$;

revoke all on function app.storage_quote_id(text) from public, anon;
revoke all on function app.can_read_supply_quote_attachment_object(text)
from public, anon, authenticated;
grant execute on function app.storage_quote_id(text) to authenticated, service_role;
grant execute on function app.can_read_supply_quote_attachment_object(text) to authenticated;

create or replace function public.save_supply_quote_v2(
  p_quote_id uuid,
  p_supplier_id uuid,
  p_supplier_channel_id uuid,
  p_quote_date date,
  p_valid_until date,
  p_contact text,
  p_context_type public.supply_quote_context,
  p_status public.supply_quote_status,
  p_notes text,
  p_store_ids uuid[],
  p_items jsonb,
  p_payment_method text,
  p_entry_amount numeric,
  p_installment_count integer,
  p_payment_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_actor uuid := app.current_usuario_id();
begin
  v_quote_id := public.save_supply_quote(
    p_quote_id,
    p_supplier_id,
    p_supplier_channel_id,
    p_quote_date,
    p_valid_until,
    p_contact,
    p_context_type,
    p_status,
    p_notes,
    p_store_ids,
    p_items
  );

  update public.supply_quotes
  set
    payment_method = nullif(trim(p_payment_method), ''),
    entry_amount = p_entry_amount,
    installment_count = p_installment_count,
    payment_notes = nullif(trim(p_payment_notes), ''),
    updated_by = v_actor
  where id = v_quote_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'quote.payment_terms.updated',
    'supply_quote',
    v_quote_id,
    jsonb_build_object(
      'payment_method', nullif(trim(p_payment_method), ''),
      'entry_amount', p_entry_amount,
      'installment_count', p_installment_count
    ),
    'database'
  );

  return v_quote_id;
end;
$$;

revoke all on function public.save_supply_quote_v2(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb, text, numeric, integer, text
) from public, anon, authenticated;
grant execute on function public.save_supply_quote_v2(
  uuid, uuid, uuid, date, date, text, public.supply_quote_context,
  public.supply_quote_status, text, uuid[], jsonb, text, numeric, integer, text
) to authenticated, service_role;

insert into public.modulos (chave, nome)
values ('purchases', 'Compras')
on conflict (chave) do update set nome = excluded.nome;

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, permission.key, permission.description
from (values
  ('purchases', 'view', 'purchases.view', 'Visualizar compras das lojas acessiveis'),
  ('purchases', 'edit', 'purchases.edit', 'Registrar execucao, pagamentos e documentos de compras'),
  ('purchases', 'manage', 'purchases.approve', 'Aprovar cotacoes para compra e devolver para cotacao')
) as permission(module_key, action_key, key, description)
join public.modulos module on module.chave = permission.module_key
join public.acoes action on action.chave = permission.action_key
on conflict (chave) do update set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in (
  'purchases.view', 'purchases.edit', 'purchases.approve'
)
where profile.chave = 'administrator'
on conflict do nothing;

create sequence if not exists public.supply_purchase_codigo_seq start with 1 increment by 1;

create table public.supply_purchases (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('CMP-' || lpad(nextval('public.supply_purchase_codigo_seq')::text, 5, '0'))
    check (codigo_negocio ~ '^CMP-[0-9]{5,}$'),
  quote_id uuid not null unique references public.supply_quotes(id) on delete restrict,
  quote_code_snapshot text not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name_snapshot text not null,
  quote_date_snapshot date not null,
  approved_total numeric(16, 2) not null default 0 check (approved_total >= 0),
  has_pending_shipping boolean not null default false,
  payment_method_snapshot text,
  entry_amount_snapshot numeric(14, 2),
  installment_count_snapshot integer,
  payment_notes_snapshot text,
  status text not null default 'approved' check (
    status in ('approved', 'in_progress', 'partially_purchased', 'purchased', 'returned', 'cancelled')
  ),
  reimbursement_status text not null default 'not_applicable' check (
    reimbursement_status in (
      'not_applicable', 'documents_pending', 'ready', 'requested', 'reimbursed'
    )
  ),
  notes text check (notes is null or length(notes) <= 3000),
  approved_by uuid references public.usuarios(id) on delete set null,
  approved_at timestamptz not null default now(),
  returned_by uuid references public.usuarios(id) on delete set null,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supply_purchase_stores (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (purchase_id, store_id)
);

create table public.supply_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete cascade,
  source_quote_item_id uuid,
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  item_code_snapshot text not null,
  item_name_snapshot text not null,
  store_id uuid references public.lojas(id) on delete restrict,
  store_code_snapshot text,
  quantity_approved numeric(14, 3) not null check (quantity_approved > 0),
  purchased_quantity numeric(14, 3) not null default 0 check (purchased_quantity >= 0),
  unit text not null,
  quoted_unit_price numeric(14, 2) not null check (quoted_unit_price >= 0),
  quoted_discount_amount numeric(14, 2) not null default 0 check (quoted_discount_amount >= 0),
  quoted_shipping_type public.supply_shipping_type not null,
  quoted_shipping_amount numeric(14, 2),
  quoted_other_costs numeric(14, 2) not null default 0 check (quoted_other_costs >= 0),
  approved_line_total numeric(16, 2) not null check (approved_line_total >= 0),
  actual_unit_price numeric(14, 2) check (actual_unit_price is null or actual_unit_price >= 0),
  actual_discount_amount numeric(14, 2) not null default 0 check (actual_discount_amount >= 0),
  actual_shipping_amount numeric(14, 2) not null default 0 check (actual_shipping_amount >= 0),
  actual_other_costs numeric(14, 2) not null default 0 check (actual_other_costs >= 0),
  notes text check (notes is null or length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supply_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete cascade,
  payment_method text not null check (
    payment_method in (
      'pix', 'boleto', 'bank_transfer', 'credit_card', 'debit_card', 'cash', 'invoiced', 'other'
    )
  ),
  source_label text check (source_label is null or length(source_label) <= 200),
  amount numeric(16, 2) not null check (amount > 0),
  entry_amount numeric(16, 2) check (entry_amount is null or entry_amount >= 0),
  installment_count integer check (installment_count is null or installment_count >= 1),
  first_due_date date,
  status text not null default 'planned' check (status in ('planned', 'paid', 'cancelled')),
  paid_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entry_amount is null or entry_amount <= amount)
);

create table public.supply_purchase_attachments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete restrict,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  storage_path text not null unique check (
    storage_path ~ '^compras/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  description text check (description is null or length(description) <= 1000),
  document_type text not null default 'other' check (
    document_type in (
      'invoice', 'receipt', 'payment_proof', 'boleto', 'purchase_order',
      'reimbursement', 'photo', 'other'
    )
  ),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references public.usuarios(id) on delete set null,
  deleted_at timestamptz
);

create index supply_purchases_status_idx on public.supply_purchases(status, approved_at desc);
create index supply_purchase_stores_store_idx on public.supply_purchase_stores(store_id, purchase_id);
create index supply_purchase_items_purchase_idx on public.supply_purchase_items(purchase_id, created_at);
create index supply_purchase_items_item_idx on public.supply_purchase_items(supply_item_id, purchase_id);
create index supply_purchase_payments_purchase_idx on public.supply_purchase_payments(purchase_id, created_at);
create index supply_purchase_attachments_purchase_idx
on public.supply_purchase_attachments(purchase_id, created_at desc)
where deleted_at is null;

create trigger supply_purchases_set_updated_at before update on public.supply_purchases
for each row execute function app.set_updated_at();
create trigger supply_purchase_items_set_updated_at before update on public.supply_purchase_items
for each row execute function app.set_updated_at();
create trigger supply_purchase_payments_set_updated_at before update on public.supply_purchase_payments
for each row execute function app.set_updated_at();

create or replace function app.can_read_supply_purchase(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('purchases', 'view')
    and exists (
      select 1 from public.supply_purchase_stores ps where ps.purchase_id = p_purchase_id
    )
    and not exists (
      select 1
      from public.supply_purchase_stores ps
      where ps.purchase_id = p_purchase_id
        and not app.can_store('purchases', 'view', ps.store_id)
    );
$$;

create or replace function app.can_edit_supply_purchase(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can('purchases', 'edit')
    and exists (
      select 1 from public.supply_purchase_stores ps where ps.purchase_id = p_purchase_id
    )
    and not exists (
      select 1
      from public.supply_purchase_stores ps
      where ps.purchase_id = p_purchase_id
        and not app.can_store('purchases', 'edit', ps.store_id)
    );
$$;

revoke all on function app.can_read_supply_purchase(uuid) from public, anon, authenticated;
revoke all on function app.can_edit_supply_purchase(uuid) from public, anon, authenticated;
grant execute on function app.can_read_supply_purchase(uuid) to authenticated, service_role;
grant execute on function app.can_edit_supply_purchase(uuid) to authenticated, service_role;

alter table public.supply_purchases enable row level security;
alter table public.supply_purchase_stores enable row level security;
alter table public.supply_purchase_items enable row level security;
alter table public.supply_purchase_payments enable row level security;
alter table public.supply_purchase_attachments enable row level security;

create policy supply_purchases_read_scoped
on public.supply_purchases for select to authenticated
using (app.can_read_supply_purchase(id));
create policy supply_purchase_stores_read_scoped
on public.supply_purchase_stores for select to authenticated
using (app.can_read_supply_purchase(purchase_id) and app.can_store('purchases', 'view', store_id));
create policy supply_purchase_items_read_scoped
on public.supply_purchase_items for select to authenticated
using (app.can_read_supply_purchase(purchase_id));
create policy supply_purchase_payments_read_scoped
on public.supply_purchase_payments for select to authenticated
using (app.can_read_supply_purchase(purchase_id));
create policy supply_purchase_attachments_read_scoped
on public.supply_purchase_attachments for select to authenticated
using (deleted_at is null and app.can_read_supply_purchase(purchase_id));

revoke all on table public.supply_purchases from anon, authenticated;
revoke all on table public.supply_purchase_stores from anon, authenticated;
revoke all on table public.supply_purchase_items from anon, authenticated;
revoke all on table public.supply_purchase_payments from anon, authenticated;
revoke all on table public.supply_purchase_attachments from anon, authenticated;
grant select on table public.supply_purchases to authenticated;
grant select on table public.supply_purchase_stores to authenticated;
grant select on table public.supply_purchase_items to authenticated;
grant select on table public.supply_purchase_payments to authenticated;
grant select on table public.supply_purchase_attachments to authenticated;
grant all on table public.supply_purchases to service_role;
grant all on table public.supply_purchase_stores to service_role;
grant all on table public.supply_purchase_items to service_role;
grant all on table public.supply_purchase_payments to service_role;
grant all on table public.supply_purchase_attachments to service_role;
grant all on sequence public.supply_purchase_codigo_seq to service_role;

create or replace function private.recalculate_supply_purchase_status(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_total integer;
  v_started integer;
  v_completed integer;
  v_has_payment boolean;
begin
  select status into v_status from public.supply_purchases where id = p_purchase_id for update;
  if v_status in ('returned', 'cancelled') then return; end if;

  select
    count(*),
    count(*) filter (where purchased_quantity > 0),
    count(*) filter (where purchased_quantity >= quantity_approved)
  into v_total, v_started, v_completed
  from public.supply_purchase_items
  where purchase_id = p_purchase_id;

  select exists(
    select 1 from public.supply_purchase_payments
    where purchase_id = p_purchase_id and status <> 'cancelled'
  ) into v_has_payment;

  update public.supply_purchases
  set status = case
    when v_total > 0 and v_completed = v_total then 'purchased'
    when v_started > 0 then 'partially_purchased'
    when v_has_payment then 'in_progress'
    else 'approved'
  end
  where id = p_purchase_id;
end;
$$;

revoke all on function private.recalculate_supply_purchase_status(uuid)
from public, anon, authenticated;

create or replace function public.approve_supply_quote_for_purchase(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.supply_quotes;
  v_purchase_id uuid;
  v_purchase_status text;
  v_actor uuid := app.current_usuario_id();
  v_total numeric(16, 2);
  v_pending boolean;
begin
  if not app.can('purchases', 'manage') then raise exception 'permission denied'; end if;
  if not app.can_read_supply_quote(p_quote_id) then raise exception 'permission denied'; end if;

  select * into v_quote from public.supply_quotes where id = p_quote_id for update;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  if v_quote.status <> 'received' then raise exception 'quote must be received before purchase approval'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until < current_date then
    raise exception 'quote expired';
  end if;

  if exists (
    select 1
    from public.supply_quote_stores qs
    where qs.quote_id = p_quote_id
      and not app.can_store('purchases', 'view', qs.store_id)
  ) then
    raise exception 'permission denied';
  end if;

  select id, status into v_purchase_id, v_purchase_status
  from public.supply_purchases where quote_id = p_quote_id for update;

  if v_purchase_id is not null and v_purchase_status not in ('returned', 'cancelled') then
    raise exception 'quote already approved for purchase';
  end if;

  select
    coalesce(sum(greatest(
      round(item.quantity * item.unit_price, 2)
      - item.discount_amount
      + coalesce(item.shipping_amount, 0)
      + item.other_costs,
      0
    )), 0),
    coalesce(bool_or(item.shipping_type = 'pending'), false)
  into v_total, v_pending
  from public.supply_quote_items item
  where item.quote_id = p_quote_id;

  if v_purchase_id is null then
    insert into public.supply_purchases (
      quote_id, quote_code_snapshot, supplier_id, supplier_name_snapshot, quote_date_snapshot,
      approved_total, has_pending_shipping, payment_method_snapshot, entry_amount_snapshot,
      installment_count_snapshot, payment_notes_snapshot, status, approved_by, approved_at
    ) values (
      v_quote.id, v_quote.codigo_negocio, v_quote.supplier_id, v_quote.supplier_name_snapshot,
      v_quote.quote_date, v_total, v_pending, v_quote.payment_method, v_quote.entry_amount,
      v_quote.installment_count, v_quote.payment_notes, 'approved', v_actor, now()
    ) returning id into v_purchase_id;
  else
    delete from public.supply_purchase_items where purchase_id = v_purchase_id;
    delete from public.supply_purchase_stores where purchase_id = v_purchase_id;
    update public.supply_purchases
    set
      quote_code_snapshot = v_quote.codigo_negocio,
      supplier_id = v_quote.supplier_id,
      supplier_name_snapshot = v_quote.supplier_name_snapshot,
      quote_date_snapshot = v_quote.quote_date,
      approved_total = v_total,
      has_pending_shipping = v_pending,
      payment_method_snapshot = v_quote.payment_method,
      entry_amount_snapshot = v_quote.entry_amount,
      installment_count_snapshot = v_quote.installment_count,
      payment_notes_snapshot = v_quote.payment_notes,
      status = 'approved',
      approved_by = v_actor,
      approved_at = now(),
      returned_by = null,
      returned_at = null
    where id = v_purchase_id;
  end if;

  insert into public.supply_purchase_stores (
    purchase_id, store_id, store_code_snapshot, store_name_snapshot, store_city_snapshot, store_state_snapshot
  )
  select
    v_purchase_id, store.id, store.codigo_negocio, store.nome, store.cidade, store.uf
  from public.supply_quote_stores qs
  join public.lojas store on store.id = qs.store_id
  where qs.quote_id = p_quote_id;

  insert into public.supply_purchase_items (
    purchase_id, source_quote_item_id, supply_item_id, item_code_snapshot, item_name_snapshot,
    store_id, store_code_snapshot, quantity_approved, unit, quoted_unit_price,
    quoted_discount_amount, quoted_shipping_type, quoted_shipping_amount, quoted_other_costs,
    approved_line_total, actual_unit_price
  )
  select
    v_purchase_id,
    qi.id,
    qi.supply_item_id,
    si.codigo_negocio,
    si.name,
    qi.store_id,
    store.codigo_negocio,
    qi.quantity,
    qi.unit,
    qi.unit_price,
    qi.discount_amount,
    qi.shipping_type,
    qi.shipping_amount,
    qi.other_costs,
    greatest(
      round(qi.quantity * qi.unit_price, 2)
      - qi.discount_amount
      + coalesce(qi.shipping_amount, 0)
      + qi.other_costs,
      0
    ),
    qi.unit_price
  from public.supply_quote_items qi
  join public.supply_items si on si.id = qi.supply_item_id
  left join public.lojas store on store.id = qi.store_id
  where qi.quote_id = p_quote_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.approved',
    'supply_purchase',
    v_purchase_id,
    jsonb_build_object(
      'quote_id', p_quote_id,
      'quote_code', v_quote.codigo_negocio,
      'approved_total', v_total,
      'has_pending_shipping', v_pending
    ),
    'database'
  );

  return v_purchase_id;
end;
$$;

create or replace function public.save_supply_purchase_item(
  p_purchase_item_id uuid,
  p_purchased_quantity numeric,
  p_actual_unit_price numeric,
  p_actual_discount_amount numeric,
  p_actual_shipping_amount numeric,
  p_actual_other_costs numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.supply_purchase_items;
  v_actor uuid := app.current_usuario_id();
begin
  select * into v_item from public.supply_purchase_items where id = p_purchase_item_id for update;
  if v_item.id is null or not app.can_edit_supply_purchase(v_item.purchase_id) then
    raise exception 'permission denied';
  end if;
  if (select status from public.supply_purchases where id = v_item.purchase_id) in ('returned', 'cancelled') then
    raise exception 'purchase is closed';
  end if;
  if p_purchased_quantity < 0
    or p_actual_unit_price < 0
    or p_actual_discount_amount < 0
    or p_actual_shipping_amount < 0
    or p_actual_other_costs < 0 then
    raise exception 'invalid purchase values';
  end if;

  update public.supply_purchase_items
  set
    purchased_quantity = p_purchased_quantity,
    actual_unit_price = p_actual_unit_price,
    actual_discount_amount = p_actual_discount_amount,
    actual_shipping_amount = p_actual_shipping_amount,
    actual_other_costs = p_actual_other_costs,
    notes = nullif(trim(p_notes), '')
  where id = p_purchase_item_id;

  perform private.recalculate_supply_purchase_status(v_item.purchase_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.item.updated',
    'supply_purchase_item',
    p_purchase_item_id,
    to_jsonb(v_item),
    (select to_jsonb(item) from public.supply_purchase_items item where item.id = p_purchase_item_id),
    'database'
  );
end;
$$;

create or replace function public.save_supply_purchase_payment(
  p_payment_id uuid,
  p_purchase_id uuid,
  p_payment_method text,
  p_source_label text,
  p_amount numeric,
  p_entry_amount numeric,
  p_installment_count integer,
  p_first_due_date date,
  p_status text,
  p_paid_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_payment_id;
  v_actor uuid := app.current_usuario_id();
  v_before jsonb;
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then raise exception 'permission denied'; end if;
  if p_amount <= 0 then raise exception 'payment amount must be positive'; end if;
  if p_entry_amount is not null and (p_entry_amount < 0 or p_entry_amount > p_amount) then
    raise exception 'invalid entry amount';
  end if;

  if v_id is null then
    insert into public.supply_purchase_payments (
      purchase_id, payment_method, source_label, amount, entry_amount, installment_count,
      first_due_date, status, paid_at, notes, created_by, updated_by
    ) values (
      p_purchase_id, p_payment_method, nullif(trim(p_source_label), ''), p_amount,
      p_entry_amount, p_installment_count, p_first_due_date, p_status, p_paid_at,
      nullif(trim(p_notes), ''), v_actor, v_actor
    ) returning id into v_id;
  else
    select to_jsonb(payment) into v_before
    from public.supply_purchase_payments payment
    where payment.id = v_id and payment.purchase_id = p_purchase_id
    for update;
    if v_before is null then raise exception 'payment not found'; end if;

    update public.supply_purchase_payments
    set
      payment_method = p_payment_method,
      source_label = nullif(trim(p_source_label), ''),
      amount = p_amount,
      entry_amount = p_entry_amount,
      installment_count = p_installment_count,
      first_due_date = p_first_due_date,
      status = p_status,
      paid_at = p_paid_at,
      notes = nullif(trim(p_notes), ''),
      updated_by = v_actor
    where id = v_id;
  end if;

  perform private.recalculate_supply_purchase_status(p_purchase_id);

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.payment.saved',
    'supply_purchase_payment',
    v_id,
    v_before,
    (select to_jsonb(payment) from public.supply_purchase_payments payment where payment.id = v_id),
    'database'
  );

  return v_id;
end;
$$;

create or replace function public.set_supply_purchase_reimbursement_status(
  p_purchase_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then raise exception 'permission denied'; end if;
  if p_status not in ('not_applicable', 'documents_pending', 'ready', 'requested', 'reimbursed') then
    raise exception 'invalid reimbursement status';
  end if;
  update public.supply_purchases set reimbursement_status = p_status where id = p_purchase_id;
end;
$$;

create or replace function public.return_supply_purchase_to_quote(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.supply_purchases;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can('purchases', 'manage') then raise exception 'permission denied'; end if;
  select * into v_purchase from public.supply_purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not app.can_read_supply_purchase(p_purchase_id) then
    raise exception 'permission denied';
  end if;
  if v_purchase.status in ('returned', 'cancelled') then raise exception 'purchase is already closed'; end if;
  if exists (
    select 1 from public.supply_purchase_items
    where purchase_id = p_purchase_id and purchased_quantity > 0
  ) then
    raise exception 'purchase has executed items';
  end if;
  if exists (
    select 1 from public.supply_purchase_payments
    where purchase_id = p_purchase_id and status <> 'cancelled'
  ) then
    raise exception 'purchase has active payments';
  end if;

  update public.supply_purchases
  set status = 'returned', returned_by = v_actor, returned_at = now()
  where id = p_purchase_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.returned_to_quote',
    'supply_purchase',
    p_purchase_id,
    to_jsonb(v_purchase),
    (select to_jsonb(purchase) from public.supply_purchases purchase where purchase.id = p_purchase_id),
    'database'
  );
end;
$$;

create or replace function public.register_supply_purchase_attachment(
  p_purchase_id uuid,
  p_original_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text,
  p_document_type text
)
returns public.supply_purchase_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_purchase_attachments;
  v_actor uuid := app.current_usuario_id();
begin
  if not app.can_edit_supply_purchase(p_purchase_id) then raise exception 'permission denied'; end if;
  if p_storage_path not like 'compras/' || p_purchase_id::text || '/%' then
    raise exception 'invalid storage path';
  end if;

  insert into public.supply_purchase_attachments (
    purchase_id, original_name, storage_path, mime_type, size_bytes, description,
    document_type, created_by
  ) values (
    p_purchase_id, trim(p_original_name), p_storage_path, p_mime_type, p_size_bytes,
    nullif(trim(p_description), ''), p_document_type, v_actor
  ) returning * into v_attachment;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, after_json, origin
  ) values (
    v_actor,
    'purchase.attachment.created',
    'supply_purchase_attachment',
    v_attachment.id,
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'original_name', v_attachment.original_name,
      'document_type', v_attachment.document_type
    ),
    'database'
  );

  return v_attachment;
end;
$$;

create or replace function public.delete_supply_purchase_attachment(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.supply_purchase_attachments;
  v_actor uuid := app.current_usuario_id();
begin
  select * into v_attachment
  from public.supply_purchase_attachments
  where id = p_attachment_id and deleted_at is null
  for update;
  if v_attachment.id is null or not app.can_edit_supply_purchase(v_attachment.purchase_id) then
    raise exception 'permission denied';
  end if;

  update public.supply_purchase_attachments
  set deleted_at = now(), deleted_by = v_actor
  where id = p_attachment_id;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.attachment.deleted',
    'supply_purchase_attachment',
    p_attachment_id,
    to_jsonb(v_attachment),
    jsonb_build_object('deleted_at', now()),
    'database'
  );

  return v_attachment.storage_path;
end;
$$;

revoke all on function public.approve_supply_quote_for_purchase(uuid) from public, anon, authenticated;
revoke all on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text)
from public, anon, authenticated;
revoke all on function public.save_supply_purchase_payment(uuid, uuid, text, text, numeric, numeric, integer, date, text, timestamptz, text)
from public, anon, authenticated;
revoke all on function public.set_supply_purchase_reimbursement_status(uuid, text)
from public, anon, authenticated;
revoke all on function public.return_supply_purchase_to_quote(uuid) from public, anon, authenticated;
revoke all on function public.register_supply_purchase_attachment(uuid, text, text, text, bigint, text, text)
from public, anon, authenticated;
revoke all on function public.delete_supply_purchase_attachment(uuid) from public, anon, authenticated;
grant execute on function public.approve_supply_quote_for_purchase(uuid) to authenticated, service_role;
grant execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text)
to authenticated, service_role;
grant execute on function public.save_supply_purchase_payment(uuid, uuid, text, text, numeric, numeric, integer, date, text, timestamptz, text)
to authenticated, service_role;
grant execute on function public.set_supply_purchase_reimbursement_status(uuid, text) to authenticated, service_role;
grant execute on function public.return_supply_purchase_to_quote(uuid) to authenticated, service_role;
grant execute on function public.register_supply_purchase_attachment(uuid, text, text, text, bigint, text, text)
to authenticated, service_role;
grant execute on function public.delete_supply_purchase_attachment(uuid) to authenticated, service_role;

create or replace function app.storage_purchase_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_object_name ~ '^compras/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      then split_part(p_object_name, '/', 2)::uuid
    else null
  end;
$$;

create or replace function app.can_read_supply_purchase_attachment_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.supply_purchase_attachments attachment
    where attachment.storage_path = p_object_name
      and attachment.deleted_at is null
      and attachment.purchase_id = app.storage_purchase_id(p_object_name)
      and app.can_read_supply_purchase(attachment.purchase_id)
  );
$$;

revoke all on function app.storage_purchase_id(text) from public, anon;
revoke all on function app.can_read_supply_purchase_attachment_object(text)
from public, anon, authenticated;
grant execute on function app.storage_purchase_id(text) to authenticated, service_role;
grant execute on function app.can_read_supply_purchase_attachment_object(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage schema unavailable; purchase/quote attachment policies skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'quote-attachments', 'quote-attachments', false, 104857600,
    array[
      'application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm',
      'video/quicktime','video/x-m4v',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  ) on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'purchase-attachments', 'purchase-attachments', false, 104857600,
    array[
      'application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm',
      'video/quicktime','video/x-m4v',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  ) on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists quote_attachments_objects_read on storage.objects';
  execute 'drop policy if exists quote_attachments_objects_create on storage.objects';
  execute 'drop policy if exists quote_attachments_objects_delete on storage.objects';
  execute 'drop policy if exists purchase_attachments_objects_read on storage.objects';
  execute 'drop policy if exists purchase_attachments_objects_create on storage.objects';
  execute 'drop policy if exists purchase_attachments_objects_delete on storage.objects';

  execute $policy$
    create policy quote_attachments_objects_read
    on storage.objects for select to authenticated
    using (bucket_id = 'quote-attachments' and app.can_read_supply_quote_attachment_object(name))
  $policy$;
  execute $policy$
    create policy quote_attachments_objects_create
    on storage.objects for insert to authenticated
    with check (bucket_id = 'quote-attachments' and app.can_edit_supply_quote(app.storage_quote_id(name)))
  $policy$;
  execute $policy$
    create policy quote_attachments_objects_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'quote-attachments' and app.can_edit_supply_quote(app.storage_quote_id(name)))
  $policy$;
  execute $policy$
    create policy purchase_attachments_objects_read
    on storage.objects for select to authenticated
    using (bucket_id = 'purchase-attachments' and app.can_read_supply_purchase_attachment_object(name))
  $policy$;
  execute $policy$
    create policy purchase_attachments_objects_create
    on storage.objects for insert to authenticated
    with check (bucket_id = 'purchase-attachments' and app.can_edit_supply_purchase(app.storage_purchase_id(name)))
  $policy$;
  execute $policy$
    create policy purchase_attachments_objects_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'purchase-attachments' and app.can_edit_supply_purchase(app.storage_purchase_id(name)))
  $policy$;
end;
$$;