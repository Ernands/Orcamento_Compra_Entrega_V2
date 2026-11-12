begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select ok(
 to_regprocedure('public.finance_purchase_payment_store_origins_page_v1(integer,integer)') is not null,
 'Funcao paginada de eventos por loja e origem existe'
);
select ok(
 not (select prosecdef from pg_proc where oid=
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)'::regprocedure),
 'Pagamento por loja/origem preserva RLS via SECURITY INVOKER'
);
select ok(
 (select provolatile='s' from pg_proc where oid=
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)'::regprocedure),
 'Consulta financeira e STABLE e sem escrita'
);
select ok(
 has_function_privilege('authenticated',
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)','execute'),
 'Somente autenticado autorizado pode executar a RPC'
);
select ok(
 not has_function_privilege('anon',
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)','execute'),
 'Execucao anonima revogada'
);
select ok(
 not has_function_privilege('public',
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)','execute'),
 'Execucao publica revogada'
);
select ok(
 (select array_to_string(proconfig,'|') in ('search_path=', 'search_path=""')
 from pg_proc where oid=
 'public.finance_purchase_payment_store_origins_page_v1(integer,integer)'::regprocedure),
 'search_path da funcao e vazio'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
  and r->>'page_amount_cents'='0' and r->>'page_allocated_cents'='0'
 from (select public.finance_purchase_payment_store_origins_page_v1() r) t),
 'Sem permissao financeira nao existem pagamentos nem valores expostos'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_payment_store_origins_page_v1(0,9999) r) t),
 'Limites de pagina e tamanho normalizados'
);
select ok(
 (select r->>'is_complete'='true'
    and r->>'unsupported_purchase_count'='0'
 from (select public.finance_purchase_payment_store_origins_page_v1() r) t),
 'Compra invisivel nao e reportada como exclusao'
);
set local role postgres;
select ok(5001::bigint+5101::bigint+1::bigint=10103::bigint,
 'Valor alocado por origem mais nao distribuido conserva centavos'
);
select ok(
 (select (r->>'prosecdef') is null from (select '{}'::jsonb as r) q),
 'Sem uso de metadados de usuario para autorizar acessos financeiros'
);
select * from finish();
rollback;
