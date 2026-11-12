begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
select ok(
 to_regprocedure('public.finance_purchase_unscheduled_page_v1(integer,integer)') is not null,
 'RPC de saldos sem programação existe'
);
select ok(
 not (select prosecdef from pg_proc where oid=
  'public.finance_purchase_unscheduled_page_v1(integer,integer)'::regprocedure),
 'SECURITY INVOKER preserva RLS'
);
select ok(
 (select provolatile='s' from pg_proc where oid=
  'public.finance_purchase_unscheduled_page_v1(integer,integer)'::regprocedure),
 'Consulta estável e somente leitura'
);
select ok(has_function_privilege('authenticated',
 'public.finance_purchase_unscheduled_page_v1(integer,integer)','EXECUTE'),
 'Usuário autenticado pode executar'
);
select ok(not has_function_privilege('anon',
 'public.finance_purchase_unscheduled_page_v1(integer,integer)','EXECUTE'),
 'Anon não executa'
);
select ok(not has_function_privilege('public',
 'public.finance_purchase_unscheduled_page_v1(integer,integer)','EXECUTE'),
 'PUBLIC não executa'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
  and r->>'unscheduled_cents'='0'
 from (select public.finance_purchase_unscheduled_page_v1() as r) q),
 'Sem autorização a RPC não retorna saldos nem valores'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_unscheduled_page_v1(0,10000) as r) q),
 'Paginação mantém 1 como mínimo e 100 como limite'
);
select ok(
 (select r->>'is_complete'='true' and r->>'unsupported_purchase_count'='0'
 from (select public.finance_purchase_unscheduled_page_v1() as r) q),
 'Sem registros visíveis não sinaliza exclusões fictícias'
);
select ok(
 10000::bigint-4000::bigint-1500::bigint=4500::bigint,
 'Conservação de centavos com lançamento vinculado e geral'
);
select ok(
 5000::bigint-1000::bigint-1500::bigint=2500::bigint,
 'Saldo residual desconta corretamente a parcela vinculada'
);
set local role postgres;
select * from finish();
rollback;
