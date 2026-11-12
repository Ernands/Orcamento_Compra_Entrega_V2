-- RLS-scoped unadjusted-purchase residual read model. DEV only.
CREATE OR REPLACE FUNCTION public.finance_purchase_unscheduled_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with visible_purchases as (
 select p.id,p.codigo_negocio,p.status
 from public.supply_purchases p
 where p.status not in ('cancelled','returned')
   and (select app.can('finance','payments_view'))
),
active_orders as (
 select o.id,o.purchase_id,p.codigo_negocio as reference_code
 from public.supply_purchase_orders o
 join visible_purchases p on p.id=o.purchase_id
 where o.status='active'
),
line_totals as (
 select o.id as order_id,o.purchase_id,o.reference_code,
   count(i.id) filter (where i.line_total is null)::bigint as null_lines,
   coalesce(sum(round(i.line_total*100)::bigint),0)::bigint as contracted_cents
 from active_orders o
 left join public.supply_purchase_order_items i on i.order_id=o.id
 group by o.id,o.purchase_id,o.reference_code
),
purchase_flags as (
 select p.id as purchase_id,
   exists(select 1 from public.supply_purchase_partial_adjustments a
     where a.purchase_id=p.id) as has_adjustments,
   coalesce(bool_or(l.null_lines>0),false) as has_null_lines
 from visible_purchases p
 left join line_totals l on l.purchase_id=p.id
 group by p.id
),
excluded as (
 select count(*) filter (where has_adjustments or has_null_lines)::bigint as purchase_count
 from purchase_flags
),
eligible as (
 select l.*
 from line_totals l
 join purchase_flags f on f.purchase_id=l.purchase_id
 where not f.has_adjustments and not f.has_null_lines
),
payment_totals as (
 select p.purchase_id,
   p.purchase_order_id,
   sum(round(p.amount*100)::bigint)::bigint as amount_cents
 from public.supply_purchase_payments p
 join visible_purchases v on v.id=p.purchase_id
 where p.status <> 'cancelled'
 group by p.purchase_id,p.purchase_order_id
),
order_with_generic as (
 select e.*,coalesce(linked.amount_cents,0)::bigint as linked_cents,
   coalesce(general.amount_cents,0)::bigint as general_cents,
   greatest(e.contracted_cents,0)::bigint as weight_cents,
   coalesce(sum(greatest(e.contracted_cents,0)) over
      (partition by e.purchase_id),0)::bigint as total_weight_cents
 from eligible e
 left join payment_totals linked on linked.purchase_id=e.purchase_id
   and linked.purchase_order_id=e.order_id
 left join payment_totals general on general.purchase_id=e.purchase_id
   and general.purchase_order_id is null
),
weighted as (
 select o.*,
   case when o.general_cents>0 and o.weight_cents>0 and o.total_weight_cents>0
     then (o.general_cents*o.weight_cents)/o.total_weight_cents else 0 end::bigint as base_generic_cents,
   case when o.general_cents>0 and o.weight_cents>0 and o.total_weight_cents>0
     then (o.general_cents*o.weight_cents)%o.total_weight_cents else 0 end::bigint as remainder_cents
 from order_with_generic o
),
ranked as (
 select w.*,
   (w.general_cents -
     sum(w.base_generic_cents) over (partition by w.purchase_id))::bigint as cents_to_distribute,
   row_number() over (
     partition by w.purchase_id
     order by w.remainder_cents desc,w.order_id::text collate "C"
   ) as remainder_rank
 from weighted w
),
balances as (
 select *,
   (base_generic_cents +
      case when weight_cents>0 and total_weight_cents>0
        and remainder_rank<=cents_to_distribute
        then 1 else 0 end)::bigint as generic_allocated_cents
 from ranked
),
all_rows as (
 select
   'purchase-unscheduled:'||purchase_id::text||':'||order_id::text as id,
   purchase_id,order_id,reference_code,contracted_cents,linked_cents,
   generic_allocated_cents,
   greatest(contracted_cents-linked_cents-generic_allocated_cents,0)::bigint as amount_cents
 from balances
),
filtered as (
 select * from all_rows where amount_cents>0
),
summary as (
 select count(*)::bigint as total_count,
 coalesce(sum(amount_cents),0)::bigint as unscheduled_cents
 from filtered
),
page_rows as (
 select *
 from filtered
 order by reference_code,order_id::text
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
   * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',summary.total_count,
 'unscheduled_cents',summary.unscheduled_cents::text,
 'unsupported_purchase_count',excluded.purchase_count,
 'is_complete',excluded.purchase_count=0,
 'rows',coalesce((
 select jsonb_agg(jsonb_build_object(
   'id',r.id,'purchase_id',r.purchase_id,'order_id',r.order_id,
   'reference_code',r.reference_code,
   'contracted_cents',r.contracted_cents::text,
   'linked_cents',r.linked_cents::text,
   'general_allocated_cents',r.generic_allocated_cents::text,
   'amount_cents',r.amount_cents::text)
 order by r.reference_code,r.order_id::text)
 from page_rows r
 ),'[]'::jsonb)
)
from summary cross join excluded;
$function$;
revoke all on function public.finance_purchase_unscheduled_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_unscheduled_page_v1(integer,integer) to authenticated;
