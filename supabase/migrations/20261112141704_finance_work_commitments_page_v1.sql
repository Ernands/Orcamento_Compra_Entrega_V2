-- RLS-scoped read-only parity model for the Obras e Servicos portion of Financeiro.
-- Not a full combined finance model: purchases are excluded.
CREATE OR REPLACE FUNCTION public.finance_work_commitments_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_status text DEFAULT NULL::text, p_store_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with visible_works as (
  select w.id, w.codigo_negocio, w.store_id, w.store_code_snapshot,
    w.store_state_snapshot, w.provider_name, w.category, w.description,
    round(w.contracted_amount * 100)::bigint as contracted_cents
  from public.works_services as w
  where w.status <> 'cancelled'
    and (select app.can('finance', 'payments_view'))
),
visible_payments as (
  select p.id, p.service_id, p.amount, p.status,
    p.paid_at, p.due_date, p.payment_method, p.source_label,
    p.label, p.notes, p.forwarded_to_finance_at
  from public.works_service_payments as p
  join visible_works as w on w.id = p.service_id
  where p.status <> 'cancelled'
),
registration_by_work as (
  select service_id, sum(round(amount * 100)::bigint)::bigint as registered_cents
  from visible_payments
  group by service_id
),
payment_rows as (
  select
    'work:' || p.id::text as id,
    p.id as payment_id,
    w.id as work_id,
    w.codigo_negocio as reference_code,
    coalesce(w.provider_name, 'Prestador não informado') as counterpart,
    w.category || ' · ' || w.description as description,
    w.store_id,
    w.store_code_snapshot as store_code,
    w.store_state_snapshot as state,
    case when p.status='paid' then 'paid' else 'planned' end as status,
    case when p.status='paid' then (p.paid_at at time zone 'UTC')::date
      else p.due_date end as event_date,
    round(p.amount * 100)::bigint as amount_cents,
    p.payment_method,
    coalesce(p.source_label, p.label) as source_label,
    p.label as installment_label,
    case when p.status='paid' then null::boolean else p.forwarded_to_finance_at is not null end as forwarded_to_finance,
    p.notes
  from visible_payments as p
  join visible_works as w on w.id=p.service_id
),
unscheduled_rows as (
  select
    'work-unscheduled:' || w.id::text as id,
    null::uuid as payment_id,
    w.id as work_id,
    w.codigo_negocio as reference_code,
    coalesce(w.provider_name, 'Prestador não informado') as counterpart,
    w.category || ' · ' || w.description as description,
    w.store_id,
    w.store_code_snapshot as store_code,
    w.store_state_snapshot as state,
    'unscheduled'::text as status,
    null::date as event_date,
    (w.contracted_cents - coalesce(r.registered_cents,0))::bigint as amount_cents,
    null::text as payment_method,
    null::text as source_label,
    'Saldo sem programação'::text as installment_label,
    null::boolean as forwarded_to_finance,
    'Saldo contratado ainda sem pagamento programado.'::text as notes
  from visible_works as w
  left join registration_by_work as r on r.service_id=w.id
  where w.contracted_cents > coalesce(r.registered_cents,0)
),
all_rows as (
  select * from payment_rows
  union all
  select * from unscheduled_rows
),
filtered as (
  select *
  from all_rows as p
  where (p_status is null or p.status=p_status)
    and (p_store_ids is null or p.store_id = any(p_store_ids))
    and (p_date_from is null or p.event_date >= p_date_from)
    and (p_date_to is null or p.event_date <= p_date_to)
    and (
      nullif(btrim(p_query),'') is null
      or p.reference_code ilike '%' || btrim(p_query) || '%'
      or p.counterpart ilike '%' || btrim(p_query) || '%'
      or p.description ilike '%' || btrim(p_query) || '%'
    )
),
totals as (
  select count(*)::bigint as total_count,
  coalesce(sum(amount_cents) filter (where status='paid'),0)::bigint as paid_cents,
  coalesce(sum(amount_cents) filter (where status='planned'),0)::bigint as planned_cents,
  coalesce(sum(amount_cents) filter (where status='unscheduled'),0)::bigint as unscheduled_cents,
  coalesce(sum(amount_cents),0)::bigint as commitment_cents
  from filtered
),
page_rows as (
  select *
  from filtered
  order by (status='unscheduled') asc, event_date asc nulls last, reference_code, id
  limit least(greatest(coalesce(p_page_size,50),1),100)
  offset (greatest(coalesce(p_page,1),1)::bigint-1)
    * least(greatest(coalesce(p_page_size,50),1),100)
)
select jsonb_build_object(
 'page', greatest(coalesce(p_page,1),1),
 'page_size',least(greatest(coalesce(p_page_size,50),1),100),
 'total_count',totals.total_count,
 'paid_cents',totals.paid_cents::text,
 'planned_cents',totals.planned_cents::text,
 'unscheduled_cents',totals.unscheduled_cents::text,
 'commitment_cents',totals.commitment_cents::text,
 'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',p.id, 'payment_id',p.payment_id,'work_id',p.work_id,
    'reference_code',p.reference_code,'counterpart',p.counterpart,
    'description',p.description,'store_id',p.store_id,'store_code',p.store_code,
    'state',p.state,'status',p.status,'event_date',p.event_date,
    'amount_cents',p.amount_cents::text,'payment_method',p.payment_method,
    'source_label',p.source_label,'installment_label',p.installment_label,
    'forwarded_to_finance',p.forwarded_to_finance,'notes',p.notes
  ) order by (p.status='unscheduled') asc,p.event_date asc nulls last,p.reference_code,p.id)
  from page_rows as p
 ),'[]'::jsonb)
)
from totals;
$function$;

revoke all on function public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text) from public, anon;
grant execute on function public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text) to authenticated;
