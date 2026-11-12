-- Preview #85 / DEV: diagnostic contracted store-origin weights.
-- This is NOT a payment allocation or a replacement for official financial KPIs.
-- Rows with unsupported or ambiguous cost/distribution data are excluded, never silently zeroed.
create or replace function public.finance_purchase_store_origin_weights_page_v1(
 p_page integer default 1,
 p_page_size integer default 50
) returns jsonb
language sql stable security invoker
set search_path=''
as $fn$
with visible_purchases as (
 select p.id, p.codigo_negocio as reference_code
 from public.supply_purchases p
 where (select app.can('finance','payments_view'))
),
active_orders as (
 select o.id as order_id,o.purchase_id,p.reference_code
 from public.supply_purchase_orders o
 join visible_purchases p on p.id=o.purchase_id
 where o.status='active'
),
flagged as (
 select p.id as purchase_id,
 exists(select 1 from public.supply_purchase_partial_adjustments a where a.purchase_id=p.id) as adjusted,
 exists(
   select 1 from active_orders o
   join public.supply_purchase_order_items l on l.order_id=o.order_id
   where o.purchase_id=p.id and (l.line_total is null or l.line_total<0)
 ) as bad_cost,
 exists(
   select 1 from active_orders o
   join public.supply_purchase_order_items l on l.order_id=o.order_id
   join public.supply_purchase_order_line_stores s on s.order_line_id=l.id
   where o.purchase_id=p.id
   group by l.id,s.store_id having count(*)>1
 ) as duplicate_store
 from visible_purchases p
),
excluded as (
 select count(*) filter(where adjusted or bad_cost or duplicate_store)::bigint as purchase_count
 from flagged
),
eligible_orders as (
 select o.* from active_orders o join flagged f on f.purchase_id=o.purchase_id
 where not f.adjusted and not f.bad_cost and not f.duplicate_store
),
lines as (
 select o.order_id,o.purchase_id,o.reference_code,l.id as line_id,
 round(l.line_total*100)::bigint as line_cents,
 l.store_distribution_status,
 coalesce(si.financial_group,'') as financial_group,
 translate(lower(concat_ws(' ',
 si.subcategory,si.group_name,pi.item_category_snapshot,
 coalesce(pi.item_name_snapshot,l.item_name_snapshot)
 )), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as category_words
 from eligible_orders o
 join public.supply_purchase_order_items l on l.order_id=o.order_id
 left join public.supply_purchase_items pi on pi.id=l.purchase_item_id
 left join public.supply_items si on si.id=pi.supply_item_id
),
classified as (
 select l.*,
 case
  when financial_group='equipment' then 'equipment'
  when financial_group in ('furniture','general') then 'furniture'
  when category_words like '%mobili%' or category_words like '%moveis%'
    or category_words like '%movel%' then 'furniture'
  when category_words like '%equip%' or category_words like '%informat%'
    or category_words like '%tecnolog%' or category_words like '%climat%'
    or category_words like '%eletron%' or category_words like '%seguranca%'
    or category_words like '%impress%' or category_words like '%notebook%'
    or category_words like '%computador%' or category_words like '%monitor%'
    or category_words like '%webcam%' or category_words like '%headset%'
    or category_words like '%nobreak%' then 'equipment'
  else 'furniture'
 end as origin
 from lines l
),
quantity_weights as (
 select l.*,s.store_id,s.store_code_snapshot as store_code,
 round(s.quantity*1000)::bigint as quantity_weight
 from classified l
 join public.supply_purchase_order_line_stores s on s.order_line_id=l.line_id
 where l.store_distribution_status='confirmed'
  and l.line_cents>0 and round(s.quantity*1000)>0
),
weight_totals as (
 select w.*,sum(quantity_weight) over(partition by line_id)::bigint as total_qty
 from quantity_weights w
),
base_allocations as (
 select w.*,
 (line_cents*quantity_weight/total_qty)::bigint as base_cents,
 (line_cents*quantity_weight%total_qty)::bigint as remainder_cents
 from weight_totals w where total_qty>0
),
ranked as (
 select b.*,
 row_number() over(partition by line_id order by remainder_cents desc,store_id::text collate "C") as rank,
 (line_cents-sum(base_cents) over(partition by line_id))::bigint as extra_cents
 from base_allocations b
),
distributed as (
 select order_id,purchase_id,store_id,max(store_code) as store_code,origin,
 sum(base_cents+case when rank<=extra_cents then 1 else 0 end)::bigint as cents
 from ranked group by order_id,purchase_id,store_id,origin
),
store_totals as (
 select order_id,store_id,max(store_code) as store_code,
 coalesce(sum(cents) filter(where origin='equipment'),0)::bigint as equipment_cents,
 coalesce(sum(cents) filter(where origin='furniture'),0)::bigint as furniture_cents
 from distributed group by order_id,store_id
),
order_costs as (
 select o.order_id,o.purchase_id,o.reference_code,
 coalesce(sum(l.line_cents),0)::bigint as contracted_cents
 from eligible_orders o left join classified l on l.order_id=o.order_id
 group by o.order_id,o.purchase_id,o.reference_code
),
order_allocated as (
 select order_id,coalesce(sum(cents),0)::bigint as allocated_cents
 from distributed group by order_id
),
all_rows as (
 select o.*,coalesce(a.allocated_cents,0)::bigint as allocated_cents,
 (o.contracted_cents-coalesce(a.allocated_cents,0))::bigint as unallocated_cents,
 coalesce((
  select jsonb_agg(jsonb_build_object(
   'store_id',s.store_id,'store_code',s.store_code,
   'equipment_cents',s.equipment_cents::text,
   'furniture_cents',s.furniture_cents::text,
   'allocated_cents',(s.equipment_cents+s.furniture_cents)::text
  ) order by s.store_code,s.store_id)
  from store_totals s where s.order_id=o.order_id
 ),'[]'::jsonb) as stores
 from order_costs o left join order_allocated a on a.order_id=o.order_id
),
summary as (
 select count(*)::bigint as total_count,
 coalesce(sum(contracted_cents),0)::bigint as contracted_cents,
 coalesce(sum(allocated_cents),0)::bigint as allocated_cents,
 coalesce(sum(unallocated_cents),0)::bigint as unallocated_cents
 from all_rows
),
paged as (
 select * from all_rows
 order by reference_code,order_id
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
  * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',summary.total_count,
 'unsupported_purchase_count',excluded.purchase_count,
 'is_complete',excluded.purchase_count=0,
 'total_contracted_cents',summary.contracted_cents::text,
 'total_allocated_cents',summary.allocated_cents::text,
 'total_unallocated_cents',summary.unallocated_cents::text,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
   'purchase_id',r.purchase_id,'order_id',r.order_id,
   'reference_code',r.reference_code,
   'contracted_cents',r.contracted_cents::text,
   'allocated_cents',r.allocated_cents::text,
   'unallocated_cents',r.unallocated_cents::text,
   'stores',r.stores
  ) order by r.reference_code,r.order_id)
  from paged r
 ),'[]'::jsonb)
) from summary cross join excluded;
$fn$;

revoke all on function public.finance_purchase_store_origin_weights_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_store_origin_weights_page_v1(integer,integer) to authenticated;
