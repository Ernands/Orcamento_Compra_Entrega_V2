-- Apply the permission correction to databases where the earlier migrations already ran.
-- Repeated execution is safe and does not modify payment records.
begin;
revoke execute on function public.update_planned_finance_payment_v1(text, uuid[], date, boolean) from public, anon;
grant execute on function public.update_planned_finance_payment_v1(text, uuid[], date, boolean) to authenticated;
commit;
