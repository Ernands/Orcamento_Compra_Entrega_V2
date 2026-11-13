begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
select ok(
 to_regprocedure('public.finance_purchase_events_page_v1(integer,integer,text,date,date,text)') is not null,
 'RPC de eventos financeiros de Compras existe'
);
select ok(
 not (select prosecdef from pg_proc where oid=
 'public.finance_purchase_events_page_v1(integer,integer,text,date,date,text)'::regprocedure),
 'Funcao preserva RLS como invoker'
);
select ok(
 (select provolatile='s' from pg_proc where oid=
 'public.finance_purchase_events_page_v1(integer,integer,text,date,date,text)'::regprocedure),
 'A RPC e STABLE'
);
select ok(
 has_function_privilege('authenticated',
 'public.finance_purchase_events_page_v1(integer,integer,text,date,date,text)','EXECUTE'),
 'Autenticados podem chamar a RPC'
);
select ok(
 not has_function_privilege('anon',
 'public.finance_purchase_events_page_v1(integer,integer,text,date,date,text)','EXECUTE'),
 'Anonimos nao podem chamar a RPC'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb and
   r->>'paid_cents'='0' and r->>'planned_cents'='0' and
   r->>'is_complete'='true'
 from (select public.finance_purchase_events_page_v1() as r) as q),
 'Sem permissao nao exibe pagamentos nem totais'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_events_page_v1(0,5000) as r) as q),
 'Limite de 100 registros por pagina'
);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
 from (select public.finance_purchase_events_page_v1(p_status:='unscheduled') as r) as q),
 'A API so exibe pagamentos pagos ou programados'
);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
 from (select public.finance_purchase_events_page_v1(p_query:='CMP-INEXISTENTE') as r) as q),
 'Pesquisa sem resultado retorna zero'
);
set local role postgres;
select * from finish();
rollback;
