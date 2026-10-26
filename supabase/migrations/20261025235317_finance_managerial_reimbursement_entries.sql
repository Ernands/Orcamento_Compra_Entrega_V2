-- Dashboard Gerencial: reimbursement events are an independent, append-only ledger.
-- The legacy finance_reimbursements / finance_reimbursement_items remain untouched.
create table if not exists public.finance_managerial_reimbursement_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.lojas(id),
  entry_type text not null check (entry_type in ('requested','received')),
  amount_cents bigint not null check (amount_cents <> 0),
  entry_date date not null default current_date,
  protocol text,
  notes text,
  reversal_of uuid unique references public.finance_managerial_reimbursement_entries(id),
  created_by uuid not null default app.current_usuario_id(),
  created_at timestamptz not null default now(),
  constraint manager_reimbursement_sign check ((reversal_of is null and amount_cents > 0) or (reversal_of is not null and amount_cents < 0))
);
create index if not exists idx_manager_reimbursement_store_date on public.finance_managerial_reimbursement_entries(store_id,entry_date desc,created_at desc);
comment on table public.finance_managerial_reimbursement_entries is 'Manual gerencial reimbursements per store, independent of legacy purchase reimbursements. Corrections are append-only reversals.';
alter table public.finance_managerial_reimbursement_entries enable row level security;
revoke all on public.finance_managerial_reimbursement_entries from public, anon, authenticated;
grant select, insert on public.finance_managerial_reimbursement_entries to authenticated;
create policy manager_reimbursement_read on public.finance_managerial_reimbursement_entries
 for select to authenticated
 using (app.can_store('finance','overview_view',store_id) and app.can('dashboard','view'));
create policy manager_reimbursement_insert on public.finance_managerial_reimbursement_entries
 for insert to authenticated
 with check (app.can_store('finance','manage',store_id) and app.can('dashboard','view') and created_by = app.current_usuario_id());
create function public.validate_manager_reimbursement_entry() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare original public.finance_managerial_reimbursement_entries%rowtype;
begin
 if new.reversal_of is not null then
   select * into original from public.finance_managerial_reimbursement_entries where id=new.reversal_of;
   if not found or original.reversal_of is not null or original.store_id <> new.store_id
       or original.entry_type <> new.entry_type or new.amount_cents <> -original.amount_cents then
     raise exception 'Invalid reimbursement correction';
   end if;
 end if;
 return new;
end $$;
create trigger validate_manager_reimbursement_entry_before_insert
 before insert on public.finance_managerial_reimbursement_entries
 for each row execute function public.validate_manager_reimbursement_entry();
