create or replace function public.dashboard_supply_metrics_v1(p_today date)
returns table (
  active_items integer,
  open_needs integer,
  unlinked_needs integer,
  active_suppliers integer,
  total_quotes integer,
  received_quotes integer,
  comparable_quotes integer,
  needs_by_status jsonb,
  needs_by_store jsonb,
  recurring_items jsonb,
  quotes_by_store jsonb,
  quotes_by_item jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
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
  ),
  open_needs as (
    select *
    from visible_needs
    where status not in ('resolved', 'cancelled')
  ),
  visible_quotes as (
    select quote.id, quote.status, quote.valid_until
    from public.supply_quotes as quote
  ),
  visible_quote_stores as (
    select
      quote_store.quote_id,
      store.codigo_negocio || ' - ' || store.nome as label
    from public.supply_quote_stores as quote_store
    join public.lojas as store on store.id = quote_store.store_id
  ),
  visible_quote_items as (
    select
      quote_item.quote_id,
      case
        when item.id is null then 'Item indisponivel'
        else item.codigo_negocio || ' - ' || item.name
      end as label
    from public.supply_quote_items as quote_item
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

revoke all on function public.dashboard_supply_metrics_v1(date) from public, anon;
grant execute on function public.dashboard_supply_metrics_v1(date) to authenticated;
