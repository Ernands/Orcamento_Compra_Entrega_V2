alter table public.supply_purchase_payment_occurrences
  drop constraint if exists supply_purchase_payment_occurrences_source_check;

alter table public.supply_purchase_payment_occurrences
  add constraint supply_purchase_payment_occurrences_source_check
  check (source in ('manual', 'proof_backfill', 'payment_record'));

create or replace function private.sync_supply_purchase_payment_occurrence_from_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_has_explicit_occurrence boolean;
begin
  select exists (
    select 1
    from public.supply_purchase_payment_occurrences occurrence
    where occurrence.payment_id = new.id
      and occurrence.source in ('manual', 'proof_backfill')
  )
  into v_has_explicit_occurrence;

  if new.status = 'paid' and new.paid_at is not null then
    if v_has_explicit_occurrence then
      delete from public.supply_purchase_payment_occurrences
      where payment_id = new.id
        and source = 'payment_record';
    elsif exists (
      select 1
      from public.supply_purchase_payment_occurrences occurrence
      where occurrence.payment_id = new.id
        and occurrence.source = 'payment_record'
    ) then
      update public.supply_purchase_payment_occurrences
      set occurred_on = new.paid_at::date,
          amount = new.amount,
          payment_method = new.payment_method,
          reference_label = new.source_label,
          notes = 'Gerado automaticamente a partir do pagamento cadastrado.',
          position = 0,
          updated_at = now()
      where payment_id = new.id
        and source = 'payment_record';
    else
      insert into public.supply_purchase_payment_occurrences (
        payment_id,
        occurred_on,
        amount,
        payment_method,
        reference_label,
        source,
        notes,
        position
      ) values (
        new.id,
        new.paid_at::date,
        new.amount,
        new.payment_method,
        new.source_label,
        'payment_record',
        'Gerado automaticamente a partir do pagamento cadastrado.',
        0
      );
    end if;
  else
    delete from public.supply_purchase_payment_occurrences
    where payment_id = new.id
      and source = 'payment_record';
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_supply_purchase_payment_occurrence_from_payment() from public, anon, authenticated;

drop trigger if exists supply_purchase_payment_occurrence_default on public.supply_purchase_payments;
create trigger supply_purchase_payment_occurrence_default
after insert or update of amount, payment_method, source_label, status, paid_at
on public.supply_purchase_payments
for each row
execute function private.sync_supply_purchase_payment_occurrence_from_payment();

insert into public.supply_purchase_payment_occurrences (
  payment_id,
  occurred_on,
  amount,
  payment_method,
  reference_label,
  source,
  notes,
  position
)
select
  payment.id,
  payment.paid_at::date,
  payment.amount,
  payment.payment_method,
  payment.source_label,
  'payment_record',
  'Gerado automaticamente a partir do pagamento cadastrado.',
  0
from public.supply_purchase_payments payment
where payment.status = 'paid'
  and payment.paid_at is not null
  and not exists (
    select 1
    from public.supply_purchase_payment_occurrences occurrence
    where occurrence.payment_id = payment.id
  );
