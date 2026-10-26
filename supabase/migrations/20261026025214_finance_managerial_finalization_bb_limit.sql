-- Loss on closure is the unreceived portion of realized expenses within BB limit.
-- Expenses above BB limit are tracked separately and can never be written as loss.
create or replace function public.validate_manager_reimbursement_entry()
returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  original public.finance_managerial_reimbursement_entries%rowtype;
  last_kind text;
  total_received bigint;
  registered_losses bigint;
  bb_allowance bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'finance_managerial_reimbursement:' || new.store_id::text,0));
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
    select coalesce(sum(e.amount_cents) filter(where e.entry_type='received'),0),
           coalesce(sum(e.amount_cents) filter(where e.entry_type='finalized'),0)
      into total_received,registered_losses
      from public.finance_managerial_reimbursement_entries e
     where e.store_id=new.store_id;
    select round(b.budget_amount*100)::bigint into bb_allowance
      from public.finance_store_budgets b where b.store_id=new.store_id;
    if bb_allowance is null then
      raise exception 'Missing BB allowance for reimbursement finalization';
    end if;
    if total_received+registered_losses+new.amount_cents > greatest(bb_allowance,0) then
      raise exception 'Absorbed loss exceeds the remaining BB allowance';
    end if;
  end if;
  return new;
end $$;
