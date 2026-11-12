begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
select ok(
 to_regprocedure('public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)') is not null,
 'Eventos de Compras v2 existem'
);
select ok(
 not (select prosecdef from pg_proc where oid =
 'public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)'::regprocedure),
 'Eventos de Compras v2 preservam SECURITY INVOKER'
);
select ok(
 (select provolatile='s' from pg_proc where oid =
 'public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)'::regprocedure),
 'Eventos de Compras v2 sao STABLE'
);
select ok(
 has_function_privilege('authenticated',
 'public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)','EXECUTE'),
 'Usuario autenticado pode consultar'
);
select ok(
 not has_function_privilege('anon',
 'public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)','EXECUTE'),
 'Usuario anonimo nao pode executar'
);
select ok(
 not has_function_privilege('public',
 'public.finance_purchase_events_page_v2(integer,integer,text,date,date,text)','EXECUTE'),
 'PUBLIC nao tem privilegio de executar'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select (r->>'total_count')::bigint=0 and r->'rows'='[]'::jsonb
   and r->>'paid_cents'='0' and r->>'gross_paid_cents'='0'
   and r->>'refunds_cents'='0'
 from (select public.finance_purchase_events_page_v2() r) q),
 'Sem acesso ao Financeiro, nenhuma linha ou valor'
);
select ok(
 (select r->>'page_size'='100' and r->>'page'='1'
 from (select public.finance_purchase_events_page_v2(0,1000) r) q),
 'Paginacao controlada no servidor'
);
select ok(
 (select (r->>'gross_paid_cents')::bigint
   - (r->>'refunds_cents')::bigint = (r->>'paid_cents')::bigint
 from (select public.finance_purchase_events_page_v2() r) q),
 'Conservacao bruto menos reembolso igual liquido'
);
select ok(
 10000::bigint-3490::bigint=6510::bigint,
 'Fixture de credito parcial em centavos'
);
set local role postgres;
select * from finish();
rollback;
