-- Follow-up hardening: omit zero-value store rows, matching the legacy allocator.
-- Preview #85 only. Read-only per-event payment allocation to stores and financial origin.
-- Uses the same cost weights and largest-remainder mechanism as the legacy domain.
-- Incomplete/adjusted purchases fail closed and are NOT approved as financial parity.
create or replace function public.finance_purchase_payment_store_origins_page_v1(
 p_page integer default 1,p_page_size integer default 50
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
order_contracts as (
 select o.order_id,o.purchase_id,coalesce(sum(l.line_cents),0)::bigint as total_cents
 from eligible_orders o left join classified l on l.order_id=o.order_id
 group by o.order_id,o.purchase_id
),
combined_contracts as (
 select purchase_id,null::uuid as order_id,sum(total_cents)::bigint as total_cents
 from order_contracts group by purchase_id
),
contexts as (
 select * from order_contracts union all select * from combined_contracts
),
order_weights as (
 select order_id,purchase_id,store_id,max(store_code) as store_code,origin,
 sum(cents)::bigint as weight_cents
 from distributed
 group by order_id,purchase_id,store_id,origin
),
combined_weights as (
 select null::uuid as order_id,purchase_id,store_id,max(store_code) as store_code,origin,
 sum(weight_cents)::bigint as weight_cents
 from order_weights group by purchase_id,store_id,origin
),
store_weights as (
 select * from order_weights union all select * from combined_weights
),
source_page as (
 select public.finance_purchase_events_page_v2(p_page,p_page_size) as report
),
events as (
 select r.value->>'id' as id,
 (r.value->>'purchase_id')::uuid as purchase_id,
 nullif(r.value->>'order_id','')::uuid as order_id,
 r.value->>'reference_code' as reference_code,
 r.value->>'event_date' as event_date,
 r.value->>'status' as status,
 (r.value->>'amount_cents')::bigint as amount_cents
 from source_page p cross join lateral jsonb_array_elements(p.report->'rows') r(value)
),
event_scopes as (
 select e.*,case when o.order_id is not null then e.order_id else null::uuid end as scope_order_id
 from events e left join eligible_orders o on o.order_id=e.order_id and o.purchase_id=e.purchase_id
),
event_context as (
 select e.*,coalesce(c.total_cents,0)::bigint as context_cents,
 coalesce((
  select sum(w.weight_cents)
  from store_weights w
  where w.purchase_id=e.purchase_id and w.order_id is not distinct from e.scope_order_id
 ),0)::bigint as known_cents
 from event_scopes e
 left join contexts c on c.purchase_id=e.purchase_id
    and c.order_id is not distinct from e.scope_order_id
),
weights as (
 select e.id,e.amount_cents,w.store_id,w.store_code,w.origin,w.weight_cents,
 (w.store_id::text||'|'||w.origin)::text as sort_key
 from event_context e
 join store_weights w on w.purchase_id=e.purchase_id
    and w.order_id is not distinct from e.scope_order_id
 where w.weight_cents>0 and e.amount_cents>0
 union all
 select e.id,e.amount_cents,null::uuid as store_id,null::text as store_code,
  'unallocated'::text as origin,
  (e.context_cents-e.known_cents)::bigint as weight_cents,
  '__unallocated__'::text as sort_key
 from event_context e
 where e.amount_cents>0 and e.context_cents>e.known_cents
),
shares as (
 select w.*,
 (w.amount_cents*w.weight_cents/sum(w.weight_cents) over(partition by w.id))::bigint as base_cents,
 (w.amount_cents*w.weight_cents%sum(w.weight_cents) over(partition by w.id))::bigint as rem_cents
 from weights w
),
ranked_shares as (
 select s.*,
 row_number() over(partition by s.id order by s.rem_cents desc,s.sort_key collate "C") as rank,
 (s.amount_cents-sum(s.base_cents) over(partition by s.id))::bigint as remaining_cents
 from shares s
),
allocated as (
 select id,store_id,store_code,origin,
 sum(base_cents+case when rank<=remaining_cents then 1 else 0 end)::bigint as cents
 from ranked_shares group by id,store_id,store_code,origin
),
by_store as (
 select id,store_id,max(store_code) as store_code,
 coalesce(sum(cents) filter(where origin='equipment'),0)::bigint as equipment_cents,
 coalesce(sum(cents) filter(where origin='furniture'),0)::bigint as furniture_cents
 from allocated where store_id is not null
 group by id,store_id
 having sum(cents)>0
),
event_rows as (
 select e.id,e.purchase_id,e.order_id,e.reference_code,e.event_date,e.status,
 e.amount_cents,
 coalesce((select sum(s.equipment_cents+s.furniture_cents) from by_store s where s.id=e.id),0)::bigint as allocated_cents,
 coalesce((
   select jsonb_agg(jsonb_build_object(
    'store_id',s.store_id,'store_code',s.store_code,
    'equipment_cents',s.equipment_cents::text,
    'furniture_cents',s.furniture_cents::text,
    'works_cents','0',
    'amount_cents',(s.equipment_cents+s.furniture_cents)::text
   ) order by s.store_code,s.store_id)
   from by_store s where s.id=e.id
 ),'[]'::jsonb) as stores
 from event_context e
),
summary as (
 select coalesce(sum(amount_cents),0)::bigint as page_amount_cents,
 coalesce(sum(allocated_cents),0)::bigint as page_allocated_cents
 from event_rows
)
select jsonb_build_object(
 'page',greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',(p.report->>'total_count')::bigint,
 'unsupported_purchase_count',greatest(excluded.purchase_count,(p.report->>'unsupported_purchase_count')::bigint),
 'unsupported_payment_count',(p.report->>'unsupported_payment_count')::bigint,
 'is_complete',(p.report->>'is_complete')::boolean and excluded.purchase_count=0,
 'page_amount_cents',summary.page_amount_cents::text,
 'page_allocated_cents',summary.page_allocated_cents::text,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',e.id,'purchase_id',e.purchase_id,'order_id',e.order_id,
   'reference_code',e.reference_code,'event_date',e.event_date,'status',e.status,
   'amount_cents',e.amount_cents::text,
   'allocated_cents',e.allocated_cents::text,
   'unallocated_cents',(e.amount_cents-e.allocated_cents)::text,
   'stores',e.stores
  ) order by e.event_date,e.reference_code,e.id)
  from event_rows e
 ),'[]'::jsonb)
) from source_page p cross join excluded cross join summary;
$fn$;
revoke all on function public.finance_purchase_payment_store_origins_page_v1(integer,integer) from public,anon;
grant execute on function public.finance_purchase_payment_store_origins_page_v1(integer,integer) to authenticated;
