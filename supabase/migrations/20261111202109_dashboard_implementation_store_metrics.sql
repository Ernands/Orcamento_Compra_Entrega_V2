create or replace function public.dashboard_implementation_store_metrics_v1(p_today date)
returns table (
  id uuid,
  code text,
  name text,
  city text,
  state text,
  responsible_name text,
  planned_opening_date date,
  status text,
  progress integer,
  pending_count integer,
  overdue_count integer,
  critical_count integer,
  next_due_date date,
  next_due_title text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with latest_implementation as (
    select distinct on (implementation.store_id)
      implementation.id,
      implementation.store_id,
      implementation.status
    from public.store_implementations as implementation
    order by
      implementation.store_id,
      implementation.created_at desc,
      implementation.id desc
  ),
  item_metrics as (
    select
      item.implementation_id,
      count(*) filter (where item.status <> 'not_applicable')::integer as relevant_count,
      count(*) filter (where item.status = 'completed')::integer as completed_count,
      count(*) filter (where item.status not in ('completed', 'not_applicable'))::integer as pending_count,
      count(*) filter (
        where item.status not in ('completed', 'not_applicable')
          and item.due_date < p_today
      )::integer as overdue_count,
      count(*) filter (
        where item.status not in ('completed', 'not_applicable')
          and item.priority_snapshot = 'critical'
      )::integer as critical_count,
      (
        array_agg(item.due_date order by item.due_date, item.position, item.created_at)
        filter (
          where item.status not in ('completed', 'not_applicable')
            and item.due_date is not null
        )
      )[1] as next_due_date,
      (
        array_agg(item.title_snapshot order by item.due_date, item.position, item.created_at)
        filter (
          where item.status not in ('completed', 'not_applicable')
            and item.due_date is not null
        )
      )[1] as next_due_title
    from public.store_implementation_items as item
    join latest_implementation as latest on latest.id = item.implementation_id
    group by item.implementation_id
  )
  select
    store.id,
    store.codigo_negocio,
    store.nome,
    store.cidade,
    store.uf,
    responsible.nome,
    store.data_inauguracao_planejada,
    case
      when latest.id is null or latest.status = 'cancelled' then 'not_started'
      else latest.status::text
    end,
    case
      when coalesce(metrics.relevant_count, 0) > 0
        then round(metrics.completed_count::numeric * 100 / metrics.relevant_count)::integer
      else 0
    end,
    coalesce(metrics.pending_count, 0)::integer,
    coalesce(metrics.overdue_count, 0)::integer,
    coalesce(metrics.critical_count, 0)::integer,
    metrics.next_due_date,
    metrics.next_due_title
  from public.lojas as store
  left join public.usuarios as responsible on responsible.id = store.responsavel_usuario_id
  left join latest_implementation as latest on latest.store_id = store.id
  left join item_metrics as metrics on metrics.implementation_id = latest.id
  order by
    (coalesce(metrics.overdue_count, 0) > 0) desc,
    coalesce(metrics.pending_count, 0) desc,
    store.nome asc;
$function$;

revoke all on function public.dashboard_implementation_store_metrics_v1(date) from public, anon;
grant execute on function public.dashboard_implementation_store_metrics_v1(date) to authenticated;
