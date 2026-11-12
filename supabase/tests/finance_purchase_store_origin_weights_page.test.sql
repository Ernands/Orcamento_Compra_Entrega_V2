begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
select ok(
 to_regprocedure('public.finance_purchase_store_origin_weights_page_v1(integer,integer)') is not null,
 'RPC de pesos de custo por loja e origem existe'
);
select ok(
 not (select prosecdef from pg_proc where oid =
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)'::regprocedure),
 'Nova RPC usa SECURITY INVOKER e preserva RLS'
);
select ok(
 (select provolatile='s' from pg_proc where oid =
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)'::regprocedure),
 'Nova RPC e uma leitura estavel'
);
select ok(
 has_function_privilege('authenticated',
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)','execute'),
 'Usuario autenticado pode solicitar a pagina'
);
select ok(
 not has_function_privilege('anon',
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)','execute'),
 'Usuario anonimo nao executa a RPC'
);
select ok(
 not has_function_privilege('public',
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)','execute'),
 'EXECUTE publico revogado'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
  and r->>'total_contracted_cents'='0'
  from (select public.finance_purchase_store_origin_weights_page_v1() r) q),
 'Sem finance.payments_view nao ve pedidos nem custos'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
  from (select public.finance_purchase_store_origin_weights_page_v1(0,1000) r) q),
 'Pagina e tamanho sao normalizados para limites seguros'
);
select ok(
 (select r->>'is_complete'='true' and r->>'unsupported_purchase_count'='0'
  from (select public.finance_purchase_store_origin_weights_page_v1() r) q),
 'Nenhum item invisivel e contado como excecao'
);
set local role postgres;
select ok(
 (select proconfig @> array['search_path=']::text[]
  from pg_proc where oid =
 'public.finance_purchase_store_origin_weights_page_v1(integer,integer)'::regprocedure),
 'Funcao possui search_path vazio'
);
select * from finish();
rollback;
