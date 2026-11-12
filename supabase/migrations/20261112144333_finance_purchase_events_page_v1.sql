-- RLS-safe paginated purchase payment *events* only; not final financial totals.
-- Partial adjustments and pathological installment counts are excluded and flagged.
-- The next migration fixes zero-value paid events to match the legacy domain.
CREATE OR REPLACE FUNCTION public.finance_purchase_events_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_status text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with visible_payments as (
  select p.id, p.purchase_id, p.purchase_order_id,
    purchase.codigo_negocio as reference_code,
    purchase.supplier_name_snapshot as counterpart,
    p.status, p.payment_method, p.source_label,
    p.amount, p.entry_amount, p.installment_count, p.first_due_date,
    p.paid_at, p.created_at,
    exists (
      select 1 from public.supply_purchase_partial_adjustments as adjustment
      where adjustment.purchase_id = p.purchase_id
    ) as has_adjustments,
    greatest(1, coalesce(nullif(p.installment_count, 0), 1)) as installment_total
  from public.supply_purchase_payments as p
  join public.supply_purchases as purchase on purchase.id = p.purchase_id
  where p.status <> 'cancelled'
    and (select app.can('finance', 'payments_view'))
),
unsupported as (
 select
  count(*) filter (where has_adjustments or installment_total > 120)::bigint as payment_count,
  count(distinct purchase_id) filter (where has_adjustments or installment_total > 120)::bigint as purchase_count
 from visible_payments
),
eligible as (
 select
   p.*,
   round(p.amount*100)::bigint as gross_cents,
   least(
      coalesce(round(p.entry_amount*100)::bigint,0),
      round(p.amount*100)::bigint
   ) as bounded_entry_cents,
   coalesce(p.first_due_date,(p.created_at at time zone 'UTC')::date) as due_on
 from visible_payments as p
 where not p.has_adjustments and p.installment_total <= 120
),
events as (
 select
   'purchase:' || p.id::text || ':paid' as id,
   p.id as payment_id, p.purchase_id, p.purchase_order_id,
   p.reference_code,p.counterpart,
   'paid'::text as status,
   coalesce((p.paid_at at time zone 'UTC')::date,(p.created_at at time zone 'UTC')::date) as event_date,
   p.gross_cents as amount_cents,
   p.payment_method, p.source_label,
   case when p.installment_count>1 then p.installment_count::text || 'x · registro quitado'
     else 'Pagamento realizado' end as installment_label
 from eligible as p where p.status='paid'

 union all

 select
   'purchase:' || p.id::text || ':entry' as id,
   p.id as payment_id,p.purchase_id,p.purchase_order_id,
   p.reference_code,p.counterpart,
   'planned'::text as status,
   (p.created_at at time zone 'UTC')::date as event_date,
   p.bounded_entry_cents as amount_cents,
   p.payment_method,p.source_label,
   'Entrada prevista'::text as installment_label
 from eligible as p
 where p.status='planned' and p.bounded_entry_cents>0

 union all

 select
   'purchase:' || p.id::text || ':installment:' || i.n::text as id,
   p.id as payment_id,p.purchase_id,p.purchase_order_id,
   p.reference_code,p.counterpart,
   'planned'::text as status,
   (
     (date_trunc('month', p.due_on::timestamp) + (i.n - 1) * interval '1 month')::date
     + least(
       extract(day from p.due_on)::integer,
       extract(day from (
         date_trunc('month', p.due_on::timestamp)
         + i.n * interval '1 month' - interval '1 day'
       ))::integer
     ) - 1
   )::date as event_date,
   (
     ((p.gross_cents - p.bounded_entry_cents) / p.installment_total)
     + case when
       row_number() over (partition by p.id order by (i.n - 1)::text collate "C")
         <= ((p.gross_cents - p.bounded_entry_cents) % p.installment_total)
       then 1 else 0 end
   )::bigint as amount_cents,
   p.payment_method,p.source_label,
   case when p.installment_total>1
     then 'Parcela ' || i.n::text || '/' || p.installment_total::text
     else 'Pagamento previsto' end as installment_label
 from eligible as p
 cross join lateral generate_series(1,p.installment_total) as i(n)
 where p.status='planned' and p.gross_cents-p.bounded_entry_cents>0
),
positive_events as (
 select * from events where amount_cents <> 0
),
filtered as (
 select * from positive_events as e
 where (p_status is null or e.status=p_status)
   and (p_date_from is null or e.event_date>=p_date_from)
   and (p_date_to is null or e.event_date<=p_date_to)
   and (nullif(btrim(p_query),'') is null
       or e.reference_code ilike '%'||btrim(p_query)||'%'
       or e.counterpart ilike '%'||btrim(p_query)||'%'
       or coalesce(e.source_label,'') ilike '%'||btrim(p_query)||'%')
),
totals as (
 select count(*)::bigint as total_count,
  coalesce(sum(amount_cents) filter (where status='paid'),0)::bigint as paid_cents,
  coalesce(sum(amount_cents) filter (where status='planned'),0)::bigint as planned_cents
 from filtered
),
page_rows as (
 select * from filtered
 order by event_date,reference_code,id
 limit least(greatest(coalesce(p_page_size,50),1),100)
 offset (greatest(coalesce(p_page,1),1)::bigint-1)
   * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
  'page',greatest(coalesce(p_page,1),1),
  'page_size',least(greatest(coalesce(p_page_size,50),1),100),
  'total_count',totals.total_count,
  'paid_cents',totals.paid_cents::text,
  'planned_cents',totals.planned_cents::text,
  'unsupported_purchase_count',unsupported.purchase_count,
  'unsupported_payment_count',unsupported.payment_count,
  'is_complete',unsupported.payment_count=0,
  'rows',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',e.id,'payment_id',e.payment_id,
        'purchase_id',e.purchase_id,'order_id',e.purchase_order_id,
        'reference_code',e.reference_code,'counterpart',e.counterpart,
        'status',e.status,'event_date',e.event_date,
        'amount_cents',e.amount_cents::text,
        'payment_method',e.payment_method,'source_label',e.source_label,
        'installment_label',e.installment_label
      )
      order by e.event_date,e.reference_code,e.id
    ) from page_rows as e
  ),'[]'::jsonb)
)
from totals cross join unsupported;
$function$;

revoke all on function public.finance_purchase_events_page_v1(integer,integer,text,date,date,text) from public,anon;
grant execute on function public.finance_purchase_events_page_v1(integer,integer,text,date,date,text) to authenticated;
