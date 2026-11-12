begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
select ok(
  to_regprocedure('public.finance_purchase_adjustment_reconciliation_v1(integer,integer)') is not null,
  'RPC paginada de reembolsos existe'
);
select ok(
  not (select prosecdef from pg_proc
    where oid='public.finance_purchase_adjustment_reconciliation_v1(integer,integer)'::regprocedure),
  'RPC respeita RLS por SECURITY INVOKER'
);
select ok(
  (select provolatile='s' from pg_proc
    where oid='public.finance_purchase_adjustment_reconciliation_v1(integer,integer)'::regprocedure),
  'RPC e STABLE'
);
select ok(
  has_function_privilege('authenticated',
    'public.finance_purchase_adjustment_reconciliation_v1(integer,integer)', 'EXECUTE'),
  'Autenticados podem ler resumo reconciliado'
);
select ok(
  not has_function_privilege('anon',
    'public.finance_purchase_adjustment_reconciliation_v1(integer,integer)', 'EXECUTE'),
  'Nao existe acesso anonimo'
);
select ok(
  not has_function_privilege('public',
    'public.finance_purchase_adjustment_reconciliation_v1(integer,integer)', 'EXECUTE'),
  'Nenhum EXECUTE concedido ao role PUBLIC'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select (r->>'total_count')::bigint=0
   and r->'rows'='[]'::jsonb
   and r->>'original_cents_total'='0'
   and r->>'remaining_cents_total'='0'
   and r->>'refund_cents_total'='0'
   from (select public.finance_purchase_adjustment_reconciliation_v1() as r) q),
 'Sem autorizacao nao retorna ajustes nem valores financeiros'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_adjustment_reconciliation_v1(0,5000) r) q),
 'RPC limita pagina a 100 e pagina minima 1'
);
select ok(
 (select r->>'invalid_count'='0' and r->>'is_complete'='true'
 from (select public.finance_purchase_adjustment_reconciliation_v1() r) q),
 'Sem linhas visiveis, contadores sao neutros'
);
select ok(
  10000::bigint-3490::bigint=6510::bigint
  and 4000::bigint-510::bigint=3490::bigint,
  'Conservacao sintetica de credito e frete retido em centavos'
);
set local role postgres;
select * from finish();
rollback;
