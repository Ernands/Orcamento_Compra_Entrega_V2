-- Server-side, RLS-respecting aggregation for selected waves.
-- "All waves" continues to use existing RPCs to retain legacy semantics.
CREATE OR REPLACE FUNCTION public.dashboard_implementation_store_metrics_wave_v1(p_today date, p_wave_ids integer[])
 RETURNS TABLE(id uuid, code text, name text, city text, state text, responsible_name text, planned_opening_date date, status text, progress integer, pending_count integer, overdue_count integer, critical_count integer, next_due_date date, next_due_title text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with latest_implementation as (
    select distinct on (implementation.store_id)
      implementation.id,
      implementation.store_id,
      implementation.status
    from public.store_implementations as implementation
    join public.lojas as wave_store on wave_store.id = implementation.store_id
      and wave_store.wave_id = any(p_wave_ids)
    order by
      implementation.store_id,
      implementation.created_at desc,
      implementation.id desc
  ),
  item_metrics as (
    select
      item.implementation_id,
      count(*) filter (
        where item.status <> 'not_applicable'
      )::integer as relevant_count,
      count(*) filter (
        where item.status = 'completed'
      )::integer as completed_count,
      count(*) filter (
        where item.status not in ('completed', 'not_applicable')
      )::integer as pending_count,
      count(*) filter (
        where item.status not in ('completed', 'not_applicable')
          and item.due_date < p_today
      )::integer as overdue_count,
      count(*) filter (
        where item.status not in ('completed', 'not_applicable')
          and item.priority_snapshot = 'critical'
      )::integer as critical_count,
      (
        array_agg(
          item.due_date
          order by item.due_date, item.position, item.created_at
        ) filter (
          where item.status not in ('completed', 'not_applicable')
            and item.due_date is not null
        )
      )[1] as next_due_date,
      (
        array_agg(
          item.title_snapshot
          order by item.due_date, item.position, item.created_at
        ) filter (
          where item.status not in ('completed', 'not_applicable')
            and item.due_date is not null
        )
      )[1] as next_due_title
    from public.store_implementation_items as item
    join latest_implementation as latest
      on latest.id = item.implementation_id
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
        then round(
          metrics.completed_count::numeric * 100
          / metrics.relevant_count
        )::integer
      else 0
    end,
    coalesce(metrics.pending_count, 0)::integer,
    coalesce(metrics.overdue_count, 0)::integer,
    coalesce(metrics.critical_count, 0)::integer,
    metrics.next_due_date,
    metrics.next_due_title
  from public.lojas as store
  left join public.usuarios as responsible
    on responsible.id = store.responsavel_usuario_id
  left join latest_implementation as latest
    on latest.store_id = store.id
  left join item_metrics as metrics
    on metrics.implementation_id = latest.id
  where store.wave_id = any(p_wave_ids)
  order by
    (coalesce(metrics.overdue_count, 0) > 0) desc,
    coalesce(metrics.pending_count, 0) desc,
    store.nome asc;
$function$;


CREATE OR REPLACE FUNCTION public.dashboard_supply_metrics_wave_v1(p_today date, p_wave_ids integer[])
 RETURNS TABLE(active_items integer, open_needs integer, unlinked_needs integer, active_suppliers integer, total_quotes integer, received_quotes integer, comparable_quotes integer, needs_by_status jsonb, needs_by_store jsonb, recurring_items jsonb, quotes_by_store jsonb, quotes_by_item jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with visible_needs as (
    select
      need.id,
      need.store_id,
      need.quantity,
      need.status,
      need.supply_item_id,
      store.codigo_negocio as store_code,
      store.nome as store_name
    from public.store_needs as need
    join public.lojas as store on store.id = need.store_id
      and store.wave_id = any(p_wave_ids)
  ),
  open_needs as (
    select *
    from visible_needs
    where status not in ('resolved', 'cancelled')
  ),
  visible_quotes as (
    select quote.id, quote.status, quote.valid_until
    from public.supply_quotes as quote
    where exists (
      select 1 from public.supply_quote_stores qs
      join public.lojas l on l.id = qs.store_id
      where qs.quote_id = quote.id and l.wave_id = any(p_wave_ids)
    )
  ),
  visible_quote_stores as (
    select
      quote_store.quote_id,
      store.codigo_negocio || ' - ' || store.nome as label
    from public.supply_quote_stores as quote_store
    join public.lojas as store on store.id = quote_store.store_id
      and store.wave_id = any(p_wave_ids)
  ),
  visible_quote_items as (
    select
      quote_item.quote_id,
      case
        when item.id is null then 'Item indisponivel'
        else item.codigo_negocio || ' - ' || item.name
      end as label
    from public.supply_quote_items as quote_item
    join visible_quotes vq on vq.id = quote_item.quote_id
    left join public.supply_items as item on item.id = quote_item.supply_item_id
  ),
  needs_status_groups as (
    select
      case need.status
        when 'identified' then 'Identificadas'
        when 'under_review' then 'Em analise'
        when 'resolved' then 'Resolvidas'
        when 'cancelled' then 'Canceladas'
        else need.status::text
      end as label,
      count(*)::integer as count,
      0::numeric as secondary_value
    from visible_needs as need
    group by need.status
  ),
  needs_store_groups as (
    select
      need.store_code || ' - ' || need.store_name as label,
      count(*)::integer as count,
      sum(need.quantity) as secondary_value
    from open_needs as need
    group by need.store_code, need.store_name
  ),
  recurring_item_groups as (
    select
      case
        when item.id is null then 'Item indisponivel'
        else item.codigo_negocio || ' - ' || item.name
      end as label,
      count(*)::integer as count,
      sum(need.quantity) as secondary_value
    from open_needs as need
    left join public.supply_items as item on item.id = need.supply_item_id
    where need.supply_item_id is not null
    group by
      case
        when item.id is null then 'Item indisponivel'
        else item.codigo_negocio || ' - ' || item.name
      end
  ),
  quote_store_groups as (
    select
      quote_store.label,
      count(*)::integer as count,
      0::numeric as secondary_value
    from visible_quote_stores as quote_store
    group by quote_store.label
  ),
  quote_item_groups as (
    select
      quote_item.label,
      count(distinct quote_item.quote_id)::integer as count,
      0::numeric as secondary_value
    from visible_quote_items as quote_item
    group by quote_item.label
  )
  select
    (select count(*)::integer from public.supply_items as item where item.active),
    (select count(*)::integer from open_needs),
    (select count(*)::integer from open_needs where supply_item_id is null),
    (select count(*)::integer from public.suppliers as supplier where supplier.active),
    (select count(*)::integer from visible_quotes),
    (select count(*)::integer from visible_quotes where status = 'received'),
    (select count(*)::integer from visible_quotes
      where status = 'received' and (valid_until is null or valid_until >= p_today)),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', groups.label,
        'count', groups.count,
        'secondaryValue', groups.secondary_value
      ))
      from needs_status_groups as groups
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', groups.label,
        'count', groups.count,
        'secondaryValue', groups.secondary_value
      ))
      from needs_store_groups as groups
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', groups.label,
        'count', groups.count,
        'secondaryValue', groups.secondary_value
      ))
      from recurring_item_groups as groups
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', groups.label,
        'count', groups.count,
        'secondaryValue', groups.secondary_value
      ))
      from quote_store_groups as groups
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', groups.label,
        'count', groups.count,
        'secondaryValue', groups.secondary_value
      ))
      from quote_item_groups as groups
    ), '[]'::jsonb);
$function$;


revoke all on function public.dashboard_implementation_store_metrics_wave_v1(date,integer[]) from public,anon;
revoke all on function public.dashboard_supply_metrics_wave_v1(date,integer[]) from public,anon;
grant execute on function public.dashboard_implementation_store_metrics_wave_v1(date,integer[]) to authenticated;
grant execute on function public.dashboard_supply_metrics_wave_v1(date,integer[]) to authenticated;
