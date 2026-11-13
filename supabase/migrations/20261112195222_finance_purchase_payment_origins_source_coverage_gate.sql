-- Propagate source RPC unsupported count to the origin parity gate (DEV only).
CREATE OR REPLACE FUNCTION public.finance_purchase_payment_origins_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with visible_purchases as (
 select p.id
 from public.supply_purchases p
 where (select app.can('finance','payments_view'))
),
active_orders as (
 select o.id as order_id,o.purchase_id
 from public.supply_purchase_orders o
 join visible_purchases v on v.id=o.purchase_id
 where o.status='active'
),
flagged_purchases as (
 select v.id as purchase_id,
  exists(
    select 1 from public.supply_purchase_partial_adjustments a
    where a.purchase_id=v.id
  ) as has_adjustments,
  exists(
    select 1
    from active_orders o
    join public.supply_purchase_order_items i on i.order_id=o.order_id
    where o.purchase_id=v.id and
     (i.line_total is null or i.line_total<0)
  ) as unknown_cost
 from visible_purchases v
),
excluded as (
 select count(*) filter(where has_adjustments or unknown_cost)::bigint
    as purchase_count from flagged_purchases
),
raw_lines as (
 select o.purchase_id,o.order_id,i.id as line_id,
  round(i.line_total*100)::bigint as line_cents,
  coalesce(si.financial_group,'') as financial_group,
  translate(lower(concat_ws(' ',
    si.subcategory,si.group_name,pi.item_category_snapshot,
    coalesce(pi.item_name_snapshot,i.item_name_snapshot)
  )), 'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc') as category_words
 from active_orders o
 join flagged_purchases f on f.purchase_id=o.purchase_id
 join public.supply_purchase_order_items i on i.order_id=o.order_id
 left join public.supply_purchase_items pi on pi.id=i.purchase_item_id
 left join public.supply_items si on si.id=pi.supply_item_id
 where not f.has_adjustments and not f.unknown_cost
),
classified as (
 select l.purchase_id,l.order_id,l.line_id,l.line_cents,
   case
    when l.financial_group='equipment' then 'equipment'
    when l.financial_group in ('furniture','general') then 'furniture'
    when l.category_words like '%mobili%' or l.category_words like '%moveis%'
      or l.category_words like '%movel%' then 'furniture'
    when l.category_words like '%equip%' or l.category_words like '%informat%'
      or l.category_words like '%tecnolog%' or l.category_words like '%climat%'
      or l.category_words like '%eletron%' or l.category_words like '%seguranca%'
      or l.category_words like '%impress%' or l.category_words like '%notebook%'
      or l.category_words like '%computador%' or l.category_words like '%monitor%'
      or l.category_words like '%webcam%' or l.category_words like '%headset%'
      or l.category_words like '%nobreak%' then 'equipment'
    else 'furniture'
   end as origin
 from raw_lines l
),
order_weights as (
 select purchase_id,order_id,origin,sum(line_cents)::bigint as weight_cents
 from classified group by purchase_id,order_id,origin
),
combined_weights as (
 select purchase_id,null::uuid as order_id,origin,sum(weight_cents)::bigint as weight_cents
 from order_weights group by purchase_id,origin
),
cost_weights as (
 select * from order_weights
 union all select * from combined_weights
),
source_page as (
 select public.finance_purchase_events_page_v2(p_page,p_page_size) as report
),
events as (
 select r.value->>'id' as id,
  (r.value->>'purchase_id')::uuid as purchase_id,
  nullif(r.value->>'order_id','')::uuid as order_id,
  r.value->>'reference_code' as reference_code,
  r.value->>'status' as status,
  r.value->>'event_date' as event_date,
  (r.value->>'amount_cents')::bigint as amount_cents
 from source_page p
 cross join lateral jsonb_array_elements(p.report->'rows') as r(value)
),
event_context as (
 select e.*,
   case when o.order_id is not null then e.order_id
     else null::uuid end as scoped_order_id
 from events e
 left join active_orders o on o.order_id=e.order_id and o.purchase_id=e.purchase_id
),
weights as (
 select e.*,w.origin,w.weight_cents,
  sum(w.weight_cents) over(partition by e.id)::bigint as total_weight
 from event_context e
 join cost_weights w on w.purchase_id=e.purchase_id
   and w.order_id is not distinct from e.scoped_order_id
 where w.weight_cents>0
),
shares as (
 select *,
  ((amount_cents*weight_cents)/total_weight)::bigint as base_cents,
  ((amount_cents*weight_cents)%total_weight)::bigint as rem_cents
 from weights
 where amount_cents>0 and total_weight>0
),
ranked as (
 select *,
  (amount_cents-sum(base_cents) over(partition by id))::bigint as remaining_cents,
  row_number() over(partition by id order by rem_cents desc,origin collate "C") as rank
 from shares
),
origin_allocations as (
 select id,
 coalesce(sum(base_cents+case when rank<=remaining_cents then 1 else 0 end)
    filter(where origin='equipment'),0)::bigint as equipment_cents,
 coalesce(sum(base_cents+case when rank<=remaining_cents then 1 else 0 end)
    filter(where origin='furniture'),0)::bigint as furniture_cents
 from ranked group by id
),
summary as (
 select coalesce(sum(e.amount_cents),0)::bigint as page_amount_cents,
  coalesce(sum(coalesce(a.equipment_cents,0)+coalesce(a.furniture_cents,0)),0)::bigint
    as page_origin_allocated_cents
 from events e left join origin_allocations a on a.id=e.id
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',(p.report->>'total_count')::bigint,
 'unsupported_purchase_count',greatest(excluded.purchase_count,(p.report->>'unsupported_purchase_count')::bigint),
 'is_complete',(p.report->>'is_complete')::boolean and excluded.purchase_count=0,
 'page_amount_cents',summary.page_amount_cents::text,
 'page_origin_allocated_cents',summary.page_origin_allocated_cents::text,
 'rows',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',e.id,'purchase_id',e.purchase_id,'order_id',e.order_id,
     'reference_code',e.reference_code,'status',e.status,
     'event_date',e.event_date,'amount_cents',e.amount_cents::text,
     'equipment_cents',coalesce(a.equipment_cents,0)::text,
     'furniture_cents',coalesce(a.furniture_cents,0)::text,
     'works_cents','0',
     'unallocated_origin_cents',(e.amount_cents-
       coalesce(a.equipment_cents,0)-coalesce(a.furniture_cents,0))::text
   ) order by e.event_date,e.reference_code,e.id)
   from events e left join origin_allocations a on a.id=e.id
 ),'[]'::jsonb)
)
from source_page p cross join excluded cross join summary;
$function$;

revoke all on function public.finance_purchase_payment_origins_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_payment_origins_page_v1(integer,integer) to authenticated;
