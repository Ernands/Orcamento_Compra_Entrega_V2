-- DEV only: diagnostic SQL consolidation of CMP events based on legacy notes and grouping keys.
-- Explicitly excludes partial adjustments / oversized schedules, never touches official totals.
CREATE OR REPLACE FUNCTION public.finance_purchase_combined_groups_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with marked_payments as (
 select p.id,p.purchase_id,p.purchase_order_id,p.status,
        p.paid_at,p.created_at,p.first_due_date,
        p.installment_count,p.entry_amount,p.amount,
        p.payment_method,p.source_label,
        s.codigo_negocio as reference_code,
        s.supplier_name_snapshot as supplier_name,
        exists(select 1 from public.supply_purchase_partial_adjustments a
          where a.purchase_id=p.purchase_id) as has_adjustments,
        greatest(1,coalesce(nullif(p.installment_count,0),1)) as installments
 from public.supply_purchase_payments p
 join public.supply_purchases s on s.id=p.purchase_id
 where p.status in ('paid','planned')
   and (lower(coalesce(p.notes,'')) like '%compra única%'
      or lower(coalesce(p.notes,'')) like '%parcela combinada%')
   and (select app.can('finance','payments_view'))
),
unsupported as (
 select count(*) filter(where has_adjustments or installments>120
  or amount<0 or coalesce(entry_amount,0)<0)::bigint as payment_count
 from marked_payments
),
eligible as (
 select p.*,
   round(amount*100)::bigint as gross_cents,
   least(round(amount*100)::bigint,coalesce(round(entry_amount*100)::bigint,0)) as entry_cents,
   coalesce(first_due_date,(created_at at time zone 'UTC')::date) as first_due
 from marked_payments p
 where not has_adjustments and installments<=120
   and amount>=0 and coalesce(entry_amount,0)>=0
),
events as (
 select 'purchase:'||id::text||':paid' as id,
   purchase_id,reference_code,supplier_name,payment_method,source_label,
   'paid'::text as status,
   coalesce((paid_at at time zone 'UTC')::date,(created_at at time zone 'UTC')::date) as event_date,
   gross_cents as amount_cents
 from eligible where status='paid'

 union all

 select 'purchase:'||id::text||':entry' as id,
   purchase_id,reference_code,supplier_name,payment_method,source_label,
   'planned'::text as status,
   (created_at at time zone 'UTC')::date as event_date,
   entry_cents as amount_cents
 from eligible where status='planned' and entry_cents>0

 union all

 select 'purchase:'||p.id::text||':installment:'||i.n::text as id,
   p.purchase_id,p.reference_code,p.supplier_name,p.payment_method,p.source_label,
   'planned'::text as status,
   (
    (date_trunc('month',p.first_due::timestamp)
      +(i.n-1)*interval '1 month')::date
    + least(extract(day from p.first_due)::integer,
      extract(day from (date_trunc('month',p.first_due::timestamp)
       +i.n*interval '1 month'-interval '1 day'))::integer)-1
   )::date as event_date,
   ((p.gross_cents-p.entry_cents)/p.installments
    + case when
      row_number() over(partition by p.id order by (i.n-1)::text collate "C")
       <= ((p.gross_cents-p.entry_cents)%p.installments)
      then 1 else 0 end)::bigint as amount_cents
 from eligible p
 cross join lateral generate_series(1,p.installments) i(n)
 where p.status='planned' and p.gross_cents-p.entry_cents>0
),
positive as (
 select * from events where status='paid' or amount_cents>0
),
groups as (
 select status,event_date,supplier_name,payment_method,source_label,
   count(*)::bigint as event_count,
   count(distinct purchase_id)::bigint as purchase_count,
   array_agg(id order by id collate "C") as source_event_ids,
   array_agg(distinct reference_code order by reference_code) as reference_codes,
   sum(amount_cents)::bigint as amount_cents
 from positive
 group by status,event_date,supplier_name,payment_method,source_label
 having count(*)>1
),
combined as (
 select 'combined:'||array_to_string(source_event_ids,'|') as id,
   status,event_date,supplier_name,payment_method,source_label,
   event_count,purchase_count,source_event_ids,reference_codes,amount_cents
 from groups
),
summary as (
 select count(*)::bigint as total_count,
 coalesce(sum(amount_cents),0)::bigint as amount_cents_total
 from combined
),
page_rows as (
 select * from combined
 order by event_date,status,supplier_name,id
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
 * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',summary.total_count,
 'amount_cents_total',summary.amount_cents_total::text,
 'unsupported_payment_count',unsupported.payment_count,
 'is_complete',unsupported.payment_count=0,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',r.id,
    'status',r.status,
    'event_date',r.event_date,
    'supplier_name',r.supplier_name,
    'payment_method',r.payment_method,
    'source_label',r.source_label,
    'event_count',r.event_count,
    'purchase_count',r.purchase_count,
    'source_event_ids',to_jsonb(r.source_event_ids),
    'reference_codes',to_jsonb(r.reference_codes),
    'amount_cents',r.amount_cents::text
   ) order by r.event_date,r.status,r.supplier_name,r.id)
  from page_rows r
 ),'[]'::jsonb)
)
from summary cross join unsupported;
$function$;

revoke all on function public.finance_purchase_combined_groups_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_combined_groups_page_v1(integer,integer) to authenticated;
