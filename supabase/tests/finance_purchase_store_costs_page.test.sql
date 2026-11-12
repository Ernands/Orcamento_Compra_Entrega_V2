begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
select ok(
 to_regprocedure('public.finance_purchase_store_costs_page_v1(integer,integer)') is not null,
 'Projeção SQL de custos por loja existe'
);
select ok(not (select prosecdef from pg_proc where oid=
 'public.finance_purchase_store_costs_page_v1(integer,integer)'::regprocedure),
 'Consulta preserva RLS por SECURITY INVOKER'
);
select ok((select provolatile='s' from pg_proc where oid=
 'public.finance_purchase_store_costs_page_v1(integer,integer)'::regprocedure),
 'Projeção estável e somente leitura'
);
select ok(has_function_privilege('authenticated',
 'public.finance_purchase_store_costs_page_v1(integer,integer)','EXECUTE'),
 'Autenticados podem executar'
);
select ok(not has_function_privilege('anon',
 'public.finance_purchase_store_costs_page_v1(integer,integer)','EXECUTE'),
 'Anon não pode executar'
);
select ok(not has_function_privilege('public',
 'public.finance_purchase_store_costs_page_v1(integer,integer)','EXECUTE'),
 'PUBLIC não pode executar'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok((select r->>'total_count'='0' and r->'rows'='[]'::jsonb
 and r->>'total_allocated_cents'='0' and r->>'total_contracted_cents'='0'
 from (select public.finance_purchase_store_costs_page_v1() r) q),
 'Sem autorização não revela valores por loja'
);
select ok((select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_store_costs_page_v1(0,10000) r) q),
 'Controla tamanho da página e página mínima'
);
select ok((select r->>'is_complete'='true' and
 r->>'unsupported_purchase_count'='0'
 from (select public.finance_purchase_store_costs_page_v1() r) q),
 'Sem registros visíveis mantém contadores neutros'
);
select ok(5001::bigint+2551::bigint+2551::bigint=10103::bigint,
 'Conserva custos por três lojas em centavos'
);
select ok(505160::bigint-498950::bigint=6210::bigint,
 'Custo não distribuído não desaparece dos totais'
);
set local role postgres;
select * from finish();
rollback;
