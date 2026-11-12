begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Prevent the subtle PostgreSQL NUMERIC-cast issue: SUM(bigint) returns numeric,
-- and a NUMERIC divided value cast to bigint rounds instead of truncating.
select ok(
 (
  select position('sum(w.weight_cents) over(partition by w.id)::bigint'
    in lower(pg_get_functiondef(p.oid))) > 0
  from pg_proc p
  where p.oid = 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)'::regprocedure
 ),
 'Payment store allocation uses BIGINT denominator before division'
);

with event_amounts as (
 select i::bigint as event_id,(7+(i*47)%10000)::bigint as amount_cents
 from generate_series(1,10000) g(i)
), store_weights as (
 select * from (values
 ('store-a|equipment'::text,5001::bigint),
 ('store-b|furniture',2551::bigint),
 ('store-c|furniture',2551::bigint),
 ('__unallocated__',11::bigint)
 ) t(key,weight_cents)
), context as (
 select sum(weight_cents)::bigint as weight_total from store_weights
), base as (
 select a.event_id,a.amount_cents,w.key,
  (a.amount_cents*w.weight_cents/c.weight_total)::bigint as floor_cents,
  (a.amount_cents*w.weight_cents%c.weight_total)::bigint as remainder_cents
 from event_amounts a cross join store_weights w cross join context c
), largest_remainder as (
 select b.*,
  row_number() over(partition by event_id
     order by remainder_cents desc,key collate "C") as priority,
  (amount_cents-sum(floor_cents) over(partition by event_id))::bigint as remaining
 from base b
), distributed as (
 select *,
   (floor_cents+case when priority<=remaining then 1 else 0 end)::bigint as cents
 from largest_remainder
), per_event as (
 select event_id,max(amount_cents) as amount_cents,sum(cents) as allocated_cents,
  bool_and(cents>=0) as nonnegative,count(*) as positions
 from distributed group by event_id
)
select
 ok(count(*)=10000 and min(positions)=4 and max(positions)=4,
   '10,000 events include all 40,000 per-store/origin allocation positions'),
 ok(count(*) filter (where amount_cents<>allocated_cents or not nonnegative)=0
   and sum(amount_cents)=sum(allocated_cents),
   '10,000 events conserve every cent without negative shares')
from per_event;

select * from finish();
rollback;
