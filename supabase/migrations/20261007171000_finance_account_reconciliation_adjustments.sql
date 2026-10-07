begin;

alter table public.finance_account_days
  drop constraint if exists finance_account_days_bank_payments_amount_check;

drop policy if exists finance_account_days_update on public.finance_account_days;
create policy finance_account_days_update
on public.finance_account_days
for update
to authenticated
using (app.can('finance','account_reconciliation_manage'))
with check (app.can('finance','account_reconciliation_manage'));

drop policy if exists finance_account_entries_update on public.finance_account_entries;
create policy finance_account_entries_update
on public.finance_account_entries
for update
to authenticated
using (app.can('finance','account_reconciliation_manage'))
with check (app.can('finance','account_reconciliation_manage'));

commit;
