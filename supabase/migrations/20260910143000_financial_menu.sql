-- Financeiro V1: consulta financeira sobre Compras V2 e controle de reembolsos.
-- A migracao e aditiva: nao altera, remove ou reclassifica compras, pagamentos ou anexos existentes.

insert into public.modulos (chave, nome)
values ('finance', 'Financeiro')
on conflict (chave) do update set nome = excluded.nome;

insert into public.acoes (chave, nome)
values ('manage', 'Gerenciar')
on conflict (chave) do update set nome = excluded.nome;

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, permission.key, permission.description
from (values
  ('finance', 'view', 'finance.view', 'Visualizar pagamentos, custos e reembolsos das lojas acessiveis'),
  ('finance', 'manage', 'finance.manage', 'Criar e atualizar solicitacoes de reembolso das lojas acessiveis')
) as permission(module_key, action_key, key, description)
join public.modulos module on module.chave = permission.module_key
join public.acoes action on action.chave = permission.action_key
on conflict (chave) do update set descricao = excluded.descricao;

-- Financeiro nao e concedido automaticamente aos perfis Prospector ou Consulta.
insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in ('finance.view', 'finance.manage')
where profile.chave = 'administrator'
on conflict do nothing;

create sequence if not exists public.finance_reimbursement_code_seq
  start with 1 increment by 1;

create table public.finance_reimbursements (
  id uuid primary key default gen_random_uuid(),
  codigo_negocio text not null unique
    default ('RMB-' || lpad(nextval('public.finance_reimbursement_code_seq')::text, 5, '0'))
    check (codigo_negocio ~ '^RMB-[0-9]{5,}$'),
  store_id uuid not null references public.lojas(id) on delete restrict,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  store_city_snapshot text not null,
  store_state_snapshot text not null,
  status text not null default 'draft' check (
    status in ('draft', 'requested', 'approved', 'partial', 'rejected', 'received', 'cancelled')
  ),
  protocol text check (protocol is null or length(protocol) <= 200),
  notes text check (notes is null or length(notes) <= 3000),
  requested_at timestamptz,
  decided_at timestamptz,
  received_at timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_reimbursement_items (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.finance_reimbursements(id) on delete cascade,
  store_id uuid not null references public.lojas(id) on delete restrict,
  purchase_id uuid not null references public.supply_purchases(id) on delete restrict,
  purchase_order_id uuid not null references public.supply_purchase_orders(id) on delete restrict,
  purchase_code_snapshot text not null,
  supplier_name_snapshot text not null,
  eligible_amount_snapshot numeric(16, 2) not null check (eligible_amount_snapshot > 0),
  requested_amount numeric(16, 2) not null check (requested_amount > 0),
  approved_amount numeric(16, 2) not null default 0 check (approved_amount >= 0),
  received_amount numeric(16, 2) not null default 0 check (received_amount >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_amount <= eligible_amount_snapshot),
  check (approved_amount <= requested_amount),
  check (received_amount <= approved_amount)
);

create unique index finance_reimbursement_items_scope_unique_idx
  on public.finance_reimbursement_items (
    reimbursement_id,
    purchase_id,
    purchase_order_id
  );
create index finance_reimbursements_store_status_idx
  on public.finance_reimbursements (store_id, status, created_at desc);
create index finance_reimbursements_created_by_idx
  on public.finance_reimbursements (created_by);
create index finance_reimbursements_updated_by_idx
  on public.finance_reimbursements (updated_by);
create index finance_reimbursement_items_reimbursement_idx
  on public.finance_reimbursement_items (reimbursement_id, created_at);
create index finance_reimbursement_items_store_purchase_idx
  on public.finance_reimbursement_items (store_id, purchase_id, purchase_order_id);
create index finance_reimbursement_items_purchase_idx
  on public.finance_reimbursement_items (purchase_id);
create index finance_reimbursement_items_order_idx
  on public.finance_reimbursement_items (purchase_order_id);

create trigger finance_reimbursements_set_updated_at
before update on public.finance_reimbursements
for each row execute function app.set_updated_at();

create trigger finance_reimbursement_items_set_updated_at
before update on public.finance_reimbursement_items
for each row execute function app.set_updated_at();

create or replace function private.prepare_finance_reimbursement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.lojas;
  v_actor uuid := app.current_usuario_id();
begin
  select * into v_store
  from public.lojas
  where id = new.store_id;

  if v_store.id is null then
    raise exception 'store not found';
  end if;

  new.store_code_snapshot := v_store.codigo_negocio;
  new.store_name_snapshot := v_store.nome;
  new.store_city_snapshot := v_store.cidade;
  new.store_state_snapshot := v_store.uf;
  new.updated_by := v_actor;
  if tg_op = 'INSERT' then
    new.created_by := v_actor;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_finance_reimbursement()
  from public, anon, authenticated, service_role;

create trigger finance_reimbursements_prepare
before insert or update of store_id
on public.finance_reimbursements
for each row execute function private.prepare_finance_reimbursement();

create or replace function private.finance_order_store_cost(
  p_purchase_order_id uuid,
  p_store_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with weighted as (
    select
      purchase_line.id as line_id,
      line_store.store_id,
      round(purchase_line.line_total * 100)::bigint as total_cents,
      line_store.quantity,
      sum(line_store.quantity) over (partition by purchase_line.id) as total_quantity
    from public.supply_purchase_order_items purchase_line
    join public.supply_purchase_orders purchase_order
      on purchase_order.id = purchase_line.order_id
    join public.supply_purchase_order_line_stores line_store
      on line_store.order_line_id = purchase_line.id
    where purchase_order.id = p_purchase_order_id
      and purchase_order.status = 'active'
      and purchase_line.store_distribution_status = 'confirmed'
      and purchase_line.line_total is not null
      and line_store.quantity > 0
  ),
  bases as (
    select
      weighted.*,
      floor(total_cents::numeric * quantity / nullif(total_quantity, 0))::bigint as base_cents,
      total_cents::numeric * quantity / nullif(total_quantity, 0)
        - floor(total_cents::numeric * quantity / nullif(total_quantity, 0)) as fraction
    from weighted
  ),
  ranked as (
    select
      bases.*,
      total_cents - sum(base_cents) over (partition by line_id) as remainder_cents,
      row_number() over (partition by line_id order by fraction desc, store_id::text) as remainder_rank
    from bases
  )
  select (
    coalesce(sum(
      base_cents + case when remainder_rank <= remainder_cents then 1 else 0 end
    ) filter (where store_id = p_store_id), 0)::numeric / 100
  )
  from ranked;
$$;

revoke all on function private.finance_order_store_cost(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.finance_order_store_eligible_amount(
  p_purchase_order_id uuid,
  p_store_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with order_stores as (
    select distinct line_store.store_id
    from public.supply_purchase_order_items purchase_line
    join public.supply_purchase_order_line_stores line_store
      on line_store.order_line_id = purchase_line.id
    where purchase_line.order_id = p_purchase_order_id
  ),
  store_costs as (
    select
      order_store.store_id,
      round(private.finance_order_store_cost(p_purchase_order_id, order_store.store_id) * 100)::bigint as cost_cents
    from order_stores order_store
  ),
  paid as (
    select round(coalesce(sum(payment.amount), 0) * 100)::bigint as paid_cents
    from public.supply_purchase_payments payment
    where payment.purchase_order_id = p_purchase_order_id
      and payment.status = 'paid'
  ),
  weighted as (
    select
      store_cost.store_id,
      store_cost.cost_cents,
      paid.paid_cents,
      sum(store_cost.cost_cents) over () as total_cost_cents
    from store_costs store_cost
    cross join paid
    where store_cost.cost_cents > 0
  ),
  bases as (
    select
      weighted.*,
      floor(paid_cents::numeric * cost_cents / nullif(total_cost_cents, 0))::bigint as base_cents,
      paid_cents::numeric * cost_cents / nullif(total_cost_cents, 0)
        - floor(paid_cents::numeric * cost_cents / nullif(total_cost_cents, 0)) as fraction
    from weighted
  ),
  ranked as (
    select
      bases.*,
      paid_cents - sum(base_cents) over () as remainder_cents,
      row_number() over (order by fraction desc, store_id::text) as remainder_rank
    from bases
  )
  select (
    coalesce(max(
      least(
        cost_cents,
        base_cents + case when remainder_rank <= remainder_cents then 1 else 0 end
      )
    ) filter (where store_id = p_store_id), 0)::numeric / 100
  )
  from ranked;
$$;

revoke all on function private.finance_order_store_eligible_amount(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.prepare_finance_reimbursement_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_reimbursement_status text;
  v_purchase public.supply_purchases;
  v_eligible_amount numeric(16, 2);
  v_already_reserved numeric(16, 2);
  v_new_reserved numeric(16, 2);
begin
  select reimbursement.store_id, reimbursement.status
  into v_store_id, v_reimbursement_status
  from public.finance_reimbursements reimbursement
  where reimbursement.id = new.reimbursement_id;

  if v_store_id is null then
    raise exception 'reimbursement not found';
  end if;

  select * into v_purchase
  from public.supply_purchases
  where id = new.purchase_id;

  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;

  if not exists (
    select 1
    from public.supply_purchase_stores purchase_store
    where purchase_store.purchase_id = new.purchase_id
      and purchase_store.store_id = v_store_id
  ) then
    raise exception 'purchase is outside reimbursement store';
  end if;

  if new.purchase_order_id is null or not exists (
    select 1
    from public.supply_purchase_orders purchase_order
    where purchase_order.id = new.purchase_order_id
      and purchase_order.purchase_id = new.purchase_id
      and purchase_order.status = 'active'
  ) then
    raise exception 'purchase order is outside purchase or cancelled';
  end if;

  v_eligible_amount := private.finance_order_store_eligible_amount(
    new.purchase_order_id,
    v_store_id
  );
  if v_eligible_amount <= 0 then
    raise exception 'purchase order has no paid cost eligible for this store';
  end if;

  select coalesce(sum(
    case
      when reimbursement.status in ('approved', 'partial', 'received') then item.approved_amount
      else item.requested_amount
    end
  ), 0)
  into v_already_reserved
  from public.finance_reimbursement_items item
  join public.finance_reimbursements reimbursement
    on reimbursement.id = item.reimbursement_id
  where item.store_id = v_store_id
    and item.purchase_id = new.purchase_id
    and item.purchase_order_id = new.purchase_order_id
    and reimbursement.id <> new.reimbursement_id
    and reimbursement.status not in ('rejected', 'cancelled');

  v_new_reserved := case
    when v_reimbursement_status in ('approved', 'partial', 'received') then new.approved_amount
    else new.requested_amount
  end;

  if v_already_reserved + v_new_reserved > v_eligible_amount then
    raise exception 'reimbursement exceeds eligible store cost';
  end if;

  new.store_id := v_store_id;
  new.purchase_code_snapshot := v_purchase.codigo_negocio;
  new.supplier_name_snapshot := v_purchase.supplier_name_snapshot;
  new.eligible_amount_snapshot := v_eligible_amount;
  return new;
end;
$$;

revoke all on function private.prepare_finance_reimbursement_item()
  from public, anon, authenticated, service_role;

create trigger finance_reimbursement_items_prepare
before insert or update of reimbursement_id, store_id, purchase_id, purchase_order_id
on public.finance_reimbursement_items
for each row execute function private.prepare_finance_reimbursement_item();

create or replace function private.audit_finance_reimbursement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_entity_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.audit_logs (
    actor_usuario_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    origin
  ) values (
    app.current_usuario_id(),
    'finance.reimbursement.' || lower(tg_op),
    tg_table_name,
    v_entity_id,
    v_old,
    v_row,
    'database'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_finance_reimbursement_change()
  from public, anon, authenticated, service_role;

create trigger finance_reimbursements_audit
after insert or update or delete on public.finance_reimbursements
for each row execute function private.audit_finance_reimbursement_change();

create trigger finance_reimbursement_items_audit
after insert or update or delete on public.finance_reimbursement_items
for each row execute function private.audit_finance_reimbursement_change();

alter table public.finance_reimbursements enable row level security;
alter table public.finance_reimbursement_items enable row level security;

create policy finance_reimbursements_read_scoped
on public.finance_reimbursements
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and store_id = any((select app.readable_store_ids('finance', 'view'))::uuid[])
);

create policy finance_reimbursements_manage_insert
on public.finance_reimbursements
for insert to authenticated
with check (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

create policy finance_reimbursements_manage_update
on public.finance_reimbursements
for update to authenticated
using (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
)
with check (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

create policy finance_reimbursements_manage_delete
on public.finance_reimbursements
for delete to authenticated
using (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

create policy finance_reimbursement_items_read_scoped
on public.finance_reimbursement_items
for select to authenticated
using (
  (select app.can('finance', 'view'))
  and store_id = any((select app.readable_store_ids('finance', 'view'))::uuid[])
);

create policy finance_reimbursement_items_manage_insert
on public.finance_reimbursement_items
for insert to authenticated
with check (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

create policy finance_reimbursement_items_manage_update
on public.finance_reimbursement_items
for update to authenticated
using (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
)
with check (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

create policy finance_reimbursement_items_manage_delete
on public.finance_reimbursement_items
for delete to authenticated
using (
  (select app.can('finance', 'manage'))
  and store_id = any((select app.readable_store_ids('finance', 'manage'))::uuid[])
);

revoke all on table public.finance_reimbursements from public, anon, authenticated;
revoke all on table public.finance_reimbursement_items from public, anon, authenticated;
grant select, insert, update, delete on table public.finance_reimbursements to authenticated;
grant select, insert, update, delete on table public.finance_reimbursement_items to authenticated;
grant all on table public.finance_reimbursements to service_role;
grant all on table public.finance_reimbursement_items to service_role;
grant usage, select on sequence public.finance_reimbursement_code_seq to authenticated, service_role;

create or replace function public.save_finance_reimbursement_v1(
  p_reimbursement_id uuid,
  p_store_id uuid,
  p_status text,
  p_protocol text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_reimbursement_id;
  v_existing_store_id uuid;
  v_item record;
  v_requested numeric(16, 2);
  v_approved numeric(16, 2);
  v_received numeric(16, 2);
begin
  if p_store_id is null or not app.can_store('finance', 'manage', p_store_id) then
    raise exception 'permission denied';
  end if;

  if p_status not in ('draft', 'requested', 'approved', 'partial', 'rejected', 'received', 'cancelled') then
    raise exception 'invalid reimbursement status';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'reimbursement requires at least one purchase';
  end if;

  if v_id is null then
    insert into public.finance_reimbursements (
      store_id,
      store_code_snapshot,
      store_name_snapshot,
      store_city_snapshot,
      store_state_snapshot,
      status,
      protocol,
      notes
    ) values (
      p_store_id,
      '-',
      '-',
      '-',
      '-',
      p_status,
      nullif(trim(p_protocol), ''),
      nullif(trim(p_notes), '')
    ) returning id into v_id;
  else
    select reimbursement.store_id
    into v_existing_store_id
    from public.finance_reimbursements reimbursement
    where reimbursement.id = v_id
    for update;

    if v_existing_store_id is null then
      raise exception 'reimbursement not found';
    end if;
    if v_existing_store_id <> p_store_id then
      raise exception 'reimbursement store cannot be changed';
    end if;

    update public.finance_reimbursements
    set
      status = p_status,
      protocol = nullif(trim(p_protocol), ''),
      notes = nullif(trim(p_notes), ''),
      updated_by = app.current_usuario_id()
    where id = v_id;

    delete from public.finance_reimbursement_items
    where reimbursement_id = v_id;
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as item(
      purchase_id uuid,
      purchase_order_id uuid,
      eligible_amount numeric,
      requested_amount numeric,
      approved_amount numeric,
      received_amount numeric,
      notes text
    )
  loop
    if v_item.purchase_id is null
      or v_item.purchase_order_id is null
      or v_item.eligible_amount is null
      or v_item.eligible_amount <= 0
      or v_item.requested_amount is null
      or v_item.requested_amount <= 0
      or v_item.requested_amount > v_item.eligible_amount
      or coalesce(v_item.approved_amount, 0) < 0
      or coalesce(v_item.approved_amount, 0) > v_item.requested_amount
      or coalesce(v_item.received_amount, 0) < 0
      or coalesce(v_item.received_amount, 0) > coalesce(v_item.approved_amount, 0)
    then
      raise exception 'invalid reimbursement amounts';
    end if;

    insert into public.finance_reimbursement_items (
      reimbursement_id,
      store_id,
      purchase_id,
      purchase_order_id,
      purchase_code_snapshot,
      supplier_name_snapshot,
      eligible_amount_snapshot,
      requested_amount,
      approved_amount,
      received_amount,
      notes
    ) values (
      v_id,
      p_store_id,
      v_item.purchase_id,
      v_item.purchase_order_id,
      '-',
      '-',
      v_item.eligible_amount,
      v_item.requested_amount,
      coalesce(v_item.approved_amount, 0),
      coalesce(v_item.received_amount, 0),
      nullif(trim(v_item.notes), '')
    );
  end loop;

  select
    sum(item.requested_amount),
    sum(item.approved_amount),
    sum(item.received_amount)
  into v_requested, v_approved, v_received
  from public.finance_reimbursement_items item
  where item.reimbursement_id = v_id;

  if p_status = 'approved' and v_approved <> v_requested then
    raise exception 'approved reimbursement requires full approved amount';
  end if;
  if p_status = 'partial' and not (v_approved > 0 and v_approved < v_requested) then
    raise exception 'partial reimbursement requires a partial approved amount';
  end if;
  if p_status = 'rejected' and (v_approved <> 0 or v_received <> 0) then
    raise exception 'rejected reimbursement cannot have approved or received amount';
  end if;
  if p_status = 'received' and not (v_approved > 0 and v_received > 0) then
    raise exception 'received reimbursement requires approved and received amounts';
  end if;

  update public.finance_reimbursements
  set
    requested_at = case
      when p_status in ('requested', 'approved', 'partial', 'rejected', 'received')
        then coalesce(requested_at, now())
      else requested_at
    end,
    decided_at = case
      when p_status in ('approved', 'partial', 'rejected', 'received')
        then coalesce(decided_at, now())
      else decided_at
    end,
    received_at = case
      when p_status = 'received' then coalesce(received_at, now())
      else received_at
    end,
    updated_by = app.current_usuario_id()
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.save_finance_reimbursement_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.save_finance_reimbursement_v1(
  uuid, uuid, text, text, text, jsonb
) to authenticated, service_role;

comment on table public.finance_reimbursements is
  'Solicitacoes de reembolso por loja; os valores ficam discriminados em finance_reimbursement_items.';
comment on table public.finance_reimbursement_items is
  'Compras ou pedidos incluidos em uma solicitacao, com custo elegivel congelado para auditoria.';
