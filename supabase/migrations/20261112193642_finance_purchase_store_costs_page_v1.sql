-- Read-only store COST weights, not allocations of actual payments. DEV only.
CREATE OR REPLACE FUNCTION public.finance_purchase_store_costs_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
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
 select o.id as order_id,o.purchase_id,p.codigo_negocio as reference_code
 from public.supply_purchase_orders o
 join visible_purchases p on p.id=o.purchase_id
 where o.status='active'
),
duplicate_stores as (
 select i.order_id
 from public.supply_purchase_order_items i
 join active_orders o on o.order_id=i.order_id
 join public.supply_purchase_order_line_stores s on s.order_line_id=i.id
 group by i.order_id,i.id,s.store_id
 having count(*)>1
),
flags as (
 select p.id as purchase_id,
   exists(select 1 from public.supply_purchase_partial_adjustments a
     where a.purchase_id=p.id) as has_adjustments,
   exists(select 1
     from public.supply_purchase_order_items i
     join active_orders o on o.order_id=i.order_id
     where o.purchase_id=p.id and (i.line_total is null or i.line_total<0)
   ) as has_unsupported_lines,
   exists(select 1 from duplicate_stores d
     join active_orders o on o.order_id=d.order_id
     where o.purchase_id=p.id) as has_duplicate_store_rows
 from visible_purchases p
),
excluded as (
 select count(*) filter(where has_adjustments or has_unsupported_lines
  or has_duplicate_store_rows)::bigint as purchase_count from flags
),
eligible_orders as (
 select o.* from active_orders o
 join flags f on f.purchase_id=o.purchase_id
 where not f.has_adjustments and not f.has_unsupported_lines
 and not f.has_duplicate_store_rows
),
line_amounts as (
 select i.id as line_id,o.order_id,o.purchase_id,o.reference_code,
   round(i.line_total*100)::bigint as line_cents,
   i.store_distribution_status
 from public.supply_purchase_order_items i
 join eligible_orders o on o.order_id=i.order_id
),
line_store_weights as (
 select l.*,s.store_id,
   s.store_code_snapshot as store_code,
   round(s.quantity*1000)::bigint as quantity_weight,
   sum(greatest(round(s.quantity*1000)::bigint,0)) over
      (partition by l.line_id)::bigint as weight_total
 from line_amounts l
 join public.supply_purchase_order_line_stores s on s.order_line_id=l.line_id
 where l.store_distribution_status='confirmed'
),
base as (
 select *,
   case when line_cents>0 and quantity_weight>0 and weight_total>0
     then (line_cents*quantity_weight)/weight_total else 0 end::bigint as base_cents,
   case when line_cents>0 and quantity_weight>0 and weight_total>0
     then (line_cents*quantity_weight)%weight_total else 0 end::bigint as remainder_cents
 from line_store_weights
),
ranks as (
 select *,
   (line_cents-sum(base_cents) over(partition by line_id))::bigint as remaining_cents,
   row_number() over(partition by line_id
     order by (quantity_weight>0) desc,remainder_cents desc,store_id::text collate "C"
   ) as remainder_rank
 from base
),
store_amounts as (
 select order_id,store_id,min(store_code) as store_code,
   sum(base_cents+
     case when quantity_weight>0 and remainder_rank<=remaining_cents
       then 1 else 0 end)::bigint as cost_cents
 from ranks
 group by order_id,store_id
),
order_totals as (
 select o.order_id,o.purchase_id,o.reference_code,
   coalesce(sum(l.line_cents),0)::bigint as contracted_cents
 from eligible_orders o
 left join line_amounts l on l.order_id=o.order_id
 group by o.order_id,o.purchase_id,o.reference_code
),
all_rows as (
 select o.*,
   coalesce((select sum(s.cost_cents) from store_amounts s
     where s.order_id=o.order_id),0)::bigint as allocated_cents
 from order_totals o
),
summary as (
 select count(*)::bigint as total_count,
 coalesce(sum(contracted_cents),0)::bigint as total_contracted_cents,
 coalesce(sum(allocated_cents),0)::bigint as total_allocated_cents
 from all_rows
),
page_rows as (
 select *
 from all_rows
 order by reference_code,order_id::text
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
 * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',summary.total_count,
 'total_contracted_cents',summary.total_contracted_cents::text,
 'total_allocated_cents',summary.total_allocated_cents::text,
 'unsupported_purchase_count',excluded.purchase_count,
 'is_complete',excluded.purchase_count=0,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
    'order_id',r.order_id,'purchase_id',r.purchase_id,
    'reference_code',r.reference_code,
    'contracted_cents',r.contracted_cents::text,
    'allocated_cents',r.allocated_cents::text,
    'unallocated_cents',(r.contracted_cents-r.allocated_cents)::text,
    'stores',coalesce((
      select jsonb_agg(jsonb_build_object(
        'store_id',s.store_id,'store_code',s.store_code,
        'cost_cents',s.cost_cents::text)
        order by s.store_code,s.store_id::text)
      from store_amounts s
      where s.order_id=r.order_id
    ),'[]'::jsonb)
  ) order by r.reference_code,r.order_id::text)
  from page_rows r
 ),'[]'::jsonb)
)
from summary cross join excluded;
$function$;
revoke all on function public.finance_purchase_store_costs_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_store_costs_page_v1(integer,integer) to authenticated;
