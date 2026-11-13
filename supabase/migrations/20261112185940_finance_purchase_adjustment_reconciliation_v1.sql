-- DEV only: RLS-scoped payment adjustment reconciliation for future finance read projection.
-- This is NOT a copy of the canonical ledger or a replacement for its totals.
CREATE OR REPLACE FUNCTION public.finance_purchase_adjustment_reconciliation_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with readable_adjustments as (
 select a.id, a.purchase_id, a.order_id, a.payment_id,
   a.original_cents, a.cancelled_cents, a.freight_reduction_cents,
   a.refund_cents, a.remaining_cents, a.refunded_on,
   a.line_adjustments, a.refund_entries, a.reference,
   p.status as payment_status, p.purchase_order_id as recorded_order_id,
   round(p.amount*100)::bigint as recorded_gross_cents,
   s.codigo_negocio as reference_code
 from public.supply_purchase_partial_adjustments as a
 join public.supply_purchase_payments as p on p.id=a.payment_id
   and p.purchase_id=a.purchase_id
 join public.supply_purchases as s on s.id=a.purchase_id
 where (select app.can('finance','payments_view'))
),
line_sums as (
 select a.id,
   count(l.value) as line_count,
   coalesce(sum(case when l.value->>'kind'='cancelled'
     then (l.value->>'reduction_cents')::bigint else 0 end),0)::bigint as line_cancelled_cents,
   coalesce(sum(case when l.value->>'kind'<>'cancelled'
     then (l.value->>'reduction_cents')::bigint else 0 end),0)::bigint as line_freight_cents,
   coalesce(sum(case when l.value->>'kind'='residual_credit'
     then (l.value->>'reduction_cents')::bigint
     when l.value->>'kind'='residual_retained'
     then (l.value->>'reduction_cents')::bigint else 0 end),0)::bigint as line_residual_cents,
   bool_and(l.value->>'kind' in
     ('cancelled','freight','freight_retained','residual_retained','residual_credit')
     and l.value ? 'line_id' and l.value ? 'reduction_cents') as expected_kinds
 from readable_adjustments a
 left join lateral jsonb_array_elements(
   case when jsonb_typeof(a.line_adjustments)='array'
   then a.line_adjustments else '[]'::jsonb end
 ) l(value) on true
 group by a.id
),
refund_sums as (
 select a.id,
   count(e.value) as entry_count,
   coalesce(sum((e.value->>'amount_cents')::bigint),0)::bigint as refund_entry_cents,
   bool_and(e.value ? 'line_id' and e.value ? 'refunded_on'
     and e.value ? 'amount_cents' and
     (e.value->>'amount_cents')::bigint>0) as valid_entries
 from readable_adjustments a
 left join lateral jsonb_array_elements(
   case when jsonb_typeof(a.refund_entries)='array'
   then a.refund_entries else '[]'::jsonb end
 ) e(value) on true
 group by a.id
),
checked as (
 select a.*,l.line_count,l.line_cancelled_cents,l.line_freight_cents,
   l.line_residual_cents,r.entry_count,r.refund_entry_cents,
   count(*) over(partition by a.payment_id) as adjustment_count_for_payment,
   (
     a.payment_status='paid' and a.recorded_order_id=a.order_id
     and a.recorded_gross_cents=a.original_cents
     and a.original_cents>=0 and a.refund_cents>=0 and a.remaining_cents>=0
     and a.original_cents-a.refund_cents=a.remaining_cents
     and a.cancelled_cents+a.freight_reduction_cents=a.refund_cents
     and jsonb_typeof(a.line_adjustments)='array'
     and l.line_count>0 and l.expected_kinds is true
     and l.line_cancelled_cents=a.cancelled_cents
     and l.line_freight_cents=a.freight_reduction_cents
     and (a.refund_entries is null or jsonb_typeof(a.refund_entries)='array')
     and (r.entry_count=0 or
       (r.refund_entry_cents=a.refund_cents and r.valid_entries is true))
   ) as valid_amounts
 from readable_adjustments a
 join line_sums l on l.id=a.id
 join refund_sums r on r.id=a.id
),
validated as (
 select *, (valid_amounts and adjustment_count_for_payment=1) as is_valid
 from checked
),
summaries as (
 select count(*)::bigint as total_count,
   count(*) filter(where not is_valid)::bigint as invalid_count,
   coalesce(sum(original_cents),0)::bigint as original_cents_total,
   coalesce(sum(remaining_cents),0)::bigint as remaining_cents_total,
   coalesce(sum(refund_cents),0)::bigint as refund_cents_total
 from validated
),
page_rows as (
 select * from validated
 order by reference_code,refunded_on,id
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
   * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',s.total_count,
 'invalid_count',s.invalid_count,
 'is_complete',s.invalid_count=0,
 'original_cents_total',s.original_cents_total::text,
 'remaining_cents_total',s.remaining_cents_total::text,
 'refund_cents_total',s.refund_cents_total::text,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',p.id,'purchase_id',p.purchase_id,
    'order_id',p.order_id,'payment_id',p.payment_id,
    'reference_code',p.reference_code,'reference',p.reference,
    'refunded_on',p.refunded_on,
    'original_cents',p.original_cents::text,
    'remaining_cents',p.remaining_cents::text,
    'refund_cents',p.refund_cents::text,
    'cancelled_cents',p.cancelled_cents::text,
    'freight_reduction_cents',p.freight_reduction_cents::text,
    'residual_cents',p.line_residual_cents::text,
    'refund_entry_cents',p.refund_entry_cents::text,
    'entry_count',p.entry_count,
    'is_valid',p.is_valid)
   order by p.reference_code,p.refunded_on,p.id)
  from page_rows p
 ),'[]'::jsonb)
)
from summaries s;
$function$;
revoke all on function public.finance_purchase_adjustment_reconciliation_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_adjustment_reconciliation_v1(integer,integer) to authenticated;
