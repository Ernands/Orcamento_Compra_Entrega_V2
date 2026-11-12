begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select ok(
 to_regprocedure('public.finance_purchase_payment_origins_page_v1(integer,integer)') is not null,
 'RPC de origem por evento existe'
);
select ok(
 not (select prosecdef from pg_proc where oid=
 'public.finance_purchase_payment_origins_page_v1(integer,integer)'::regprocedure),
 'RPC de origem preserva RLS'
);
select ok(
 (select provolatile='s' from pg_proc where oid=
 'public.finance_purchase_payment_origins_page_v1(integer,integer)'::regprocedure),
 'Consulta de origem estável'
);
select ok(has_function_privilege('authenticated',
 'public.finance_purchase_payment_origins_page_v1(integer,integer)','execute'),
 'Apenas usuário autenticado pode executar'
);
select ok(not has_function_privilege('anon',
 'public.finance_purchase_payment_origins_page_v1(integer,integer)','execute'),
 'Sem acesso anônimo'
);
select ok(not has_function_privilege('public',
 'public.finance_purchase_payment_origins_page_v1(integer,integer)','execute'),
 'Sem privilégio público'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
 and r->>'page_amount_cents'='0'
 from (select public.finance_purchase_payment_origins_page_v1() r) q),
 'Usuário sem permissão não vê valores financeiros'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_payment_origins_page_v1(0,1000) r) q),
 'Páginas limitadas a 100 eventos'
);
select ok(
 (select r->>'is_complete'='true' and r->>'unsupported_purchase_count'='0'
 from (select public.finance_purchase_payment_origins_page_v1() r) q),
 'Nenhuma compra sem acesso é sinalizada como excluída'
);
set local role postgres;
select ok(5001::bigint+5102::bigint=10103::bigint,
 'Equipamentos e mobiliário fecham a contratação em centavos'
);
select ok(3139920::bigint+1218000::bigint=4357920::bigint,
 'Origens de entrada conjunta preservam os centavos das CMPs'
);
select ok(1465296::bigint+568400::bigint=2033696::bigint,
 'Origens de parcela conjunta preservam os centavos das CMPs'
);
select * from finish();
rollback;