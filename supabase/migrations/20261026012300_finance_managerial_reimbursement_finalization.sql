-- Loss is recognized ONLY upon explicit reimbursement finalization.
-- Finalization is an immutable ledger event holding the unrecovered balance
-- at that point. Later requests start a new cycle without rewriting history.
alter table public.finance_managerial_reimbursement_entries
  drop constraint finance_managerial_reimbursement_entries_entry_type_check;
alter table public.finance_managerial_reimbursement_entries
  add constraint finance_managerial_reimbursement_entries_entry_type_check
  check (entry_type in ('requested','received','finalized'));
alter table public.finance_managerial_reimbursement_entries
  drop constraint finance_managerial_reimbursement_entries_amount_cents_check;
alter table public.finance_managerial_reimbursement_entries
  add constraint finance_managerial_reimbursement_entries_amount_cents_check
  check (entry_type = 'finalized' or amount_cents <> 0);
alter table public.finance_managerial_reimbursement_entries
  drop constraint manager_reimbursement_sign;
alter table public.finance_managerial_reimbursement_entries
  add constraint manager_reimbursement_sign
  check (
    (entry_type = 'finalized' and reversal_of is null and amount_cents >= 0)
    or
    (entry_type in ('requested','received') and
      ((reversal_of is null and amount_cents > 0) or
       (reversal_of is not null and amount_cents < 0)))
  );
comment on column public.finance_managerial_reimbursement_entries.entry_type
is 'requested/received are movements; finalized is explicit closure with the non-reimbursed amount recognized as absorbed loss.';
create or replace function public.validate_manager_reimbursement_entry()
returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  original public.finance_managerial_reimbursement_entries%rowtype;
  open_balance bigint;
  last_kind text;
begin
  -- Serialize concurrent ledger writes for this store, including two closures.
  perform pg_advisory_xact_lock(hashtextextended('finance_managerial_reimbursement:' || new.store_id::text,0));
  if new.reversal_of is not null then
    select * into original from public.finance_managerial_reimbursement_entries
     where id=new.reversal_of;
    if not found or original.reversal_of is not null or original.store_id <> new.store_id
      or original.entry_type <> new.entry_type or new.amount_cents <> -original.amount_cents then
      raise exception 'Invalid reimbursement correction';
    end if;
    if exists(
      select 1 from public.finance_managerial_reimbursement_entries finalized
       where finalized.store_id=new.store_id and finalized.entry_type='finalized'
         and finalized.created_at >= original.created_at
    ) then
      raise exception 'Reimbursement already finalized. Previous movements cannot be reversed.';
    end if;
  end if;
  if new.entry_type='finalized' then
    select e.entry_type into last_kind
      from public.finance_managerial_reimbursement_entries e
     where e.store_id=new.store_id order by e.created_at desc,e.id desc limit 1;
    if last_kind is null or last_kind='finalized' then
      raise exception 'No open reimbursement to finalize';
    end if;
    select coalesce(sum(case
      when e.entry_type='requested' then e.amount_cents
      when e.entry_type='received' then -e.amount_cents
      when e.entry_type='finalized' then -e.amount_cents
      else 0 end),0)
    into open_balance from public.finance_managerial_reimbursement_entries e
    where e.store_id=new.store_id;
    if open_balance < 0 or new.amount_cents <> open_balance then
      raise exception 'Finalization loss does not match current pending amount';
    end if;
  end if;
  return new;
end $$;
