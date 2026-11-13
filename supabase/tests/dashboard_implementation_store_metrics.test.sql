begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  to_regprocedure('public.dashboard_implementation_store_metrics_v1(date)') is not null,
  'Funcao de indicadores de implantacao existe'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.dashboard_implementation_store_metrics_v1(date)'::regprocedure
  ),
  'Funcao executa como invoker e preserva RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.dashboard_implementation_store_metrics_v1(date)',
    'EXECUTE'
  ),
  'Usuario autenticado pode consultar os indicadores'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.dashboard_implementation_store_metrics_v1(date)',
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
select is(
  (select count(*) from public.dashboard_implementation_store_metrics_v1(current_date)),
  0::bigint,
  'Indicadores respeitam RLS e nao retornam lojas sem permissao'
);

set local role postgres;
select * from finish();
rollback;
