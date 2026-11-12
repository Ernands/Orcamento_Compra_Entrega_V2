-- Read-only, RLS-scoped operational payment source page.
-- NOT a replacement for the canonical Financeiro aggregate calculations:
-- it does not compute unscheduled balances, refunds, installment expansion,
-- consolidated payments, or weighted store allocations.
CREATE OR REPLACE FUNCTION public.finance_payment_sources_page_v1(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_status text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with source_payments as (
  select
    'purchase'::text as source,
    payment.id as payment_id,
    purchase.id as source_id,
    purchase.codigo_negocio as reference_code,
    purchase.supplier_name_snapshot as counterpart,
    payment.status as status,
    case when payment.status = 'paid' then payment.paid_at::date
      else payment.first_due_date end as event_date,
    round(payment.amount * 100)::bigint as gross_amount_cents,
    null::uuid as store_id
  from public.supply_purchase_payments as payment
  join public.supply_purchases as purchase on purchase.id = payment.purchase_id
  where (select app.can('finance', 'payments_view'))
    and payment.status <> 'cancelled'

  union all

  select
    'work'::text as source,
    payment.id as payment_id,
    service.id as source_id,
    service.codigo_negocio as reference_code,
    coalesce(service.provider_name, 'Prestador não informado') as counterpart,
    payment.status as status,
    case when payment.status = 'paid' then payment.paid_at::date
      else payment.due_date end as event_date,
    round(payment.amount * 100)::bigint as gross_amount_cents,
    payment.store_id
  from public.works_service_payments as payment
  join public.works_services as service on service.id = payment.service_id
  where (select app.can('finance', 'payments_view'))
    and payment.status <> 'cancelled'
),
filtered as (
  select *
  from source_payments as payment
  where (p_status is null or payment.status = p_status)
    and (p_source is null or payment.source = p_source)
    and (p_date_from is null or payment.event_date >= p_date_from)
    and (p_date_to is null or payment.event_date <= p_date_to)
    and (
      nullif(btrim(p_query), '') is null
      or payment.reference_code ilike '%' || btrim(p_query) || '%'
      or payment.counterpart ilike '%' || btrim(p_query) || '%'
    )
),
summary as (
  select
    count(*)::bigint as total_count,
    coalesce(sum(gross_amount_cents), 0)::bigint as raw_total_cents,
    coalesce(sum(gross_amount_cents) filter (where status = 'paid'), 0)::bigint as raw_paid_cents,
    coalesce(sum(gross_amount_cents) filter (where status = 'planned'), 0)::bigint as raw_planned_cents
  from filtered
),
page_rows as (
  select *
  from filtered
  order by event_date desc nulls last, source, payment_id
  limit least(greatest(coalesce(p_page_size, 50), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1)::bigint - 1)
      * least(greatest(coalesce(p_page_size, 50), 1), 100)
)
select jsonb_build_object(
  'page', greatest(coalesce(p_page, 1), 1),
  'page_size', least(greatest(coalesce(p_page_size, 50), 1), 100),
  'total_count', summary.total_count,
  'raw_total_cents', summary.raw_total_cents::text,
  'raw_paid_cents', summary.raw_paid_cents::text,
  'raw_planned_cents', summary.raw_planned_cents::text,
  'rows', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'source', page_rows.source,
        'payment_id', page_rows.payment_id,
        'source_id', page_rows.source_id,
        'reference_code', page_rows.reference_code,
        'counterpart', page_rows.counterpart,
        'status', page_rows.status,
        'event_date', page_rows.event_date,
        'gross_amount_cents', page_rows.gross_amount_cents::text,
        'store_id', page_rows.store_id
      )
      order by page_rows.event_date desc nulls last, page_rows.source, page_rows.payment_id
    )
    from page_rows
  ), '[]'::jsonb)
)
from summary;
$function$


revoke all on function public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text) from public, anon;
grant execute on function public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text) to authenticated;
