begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  to_regprocedure('public.dashboard_supply_metrics_v1(date)') is not null,
  'Funcao de indicadores de suprimentos existe'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.dashboard_supply_metrics_v1(date)'::regprocedure
  ),
  'Funcao executa como invoker e preserva RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.dashboard_supply_metrics_v1(date)',
    'EXECUTE'
  ),
  'Usuario autenticado pode consultar os indicadores'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.dashboard_supply_metrics_v1(date)',
    'EXECUTE'
  ),
  'Usuario anonimo nao pode consultar os indicadores'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);
select ok(
  (
    select active_items = 0
      and open_needs = 0
      and unlinked_needs = 0
      and active_suppliers = 0
      and total_quotes = 0
      and received_quotes = 0
      and comparable_quotes = 0
      and needs_by_status = '[]'::jsonb
      and needs_by_store = '[]'::jsonb
      and recurring_items = '[]'::jsonb
      and quotes_by_store = '[]'::jsonb
      and quotes_by_item = '[]'::jsonb
    from public.dashboard_supply_metrics_v1(current_date)
  ),
  'Indicadores respeitam RLS e nao retornam dados sem permissao'
);

set local role postgres;
select * from finish();
rollback;
