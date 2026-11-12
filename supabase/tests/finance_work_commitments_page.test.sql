begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
select ok(
  to_regprocedure('public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text)') is not null,
  'Paginacao SQL de Obras existe'
);
select ok(
  not (select prosecdef from pg_proc where oid =
    'public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text)'::regprocedure),
  'SQL de Obras utiliza SECURITY INVOKER'
);
select ok(
  (select provolatile='s' from pg_proc where oid =
    'public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text)'::regprocedure),
  'SQL de Obras e STABLE'
);
select ok(
  has_function_privilege('authenticated',
    'public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text)',
    'EXECUTE'),
  'Autenticados podem solicitar a projecao'
);
select ok(
  not has_function_privilege('anon',
    'public.finance_work_commitments_page_v1(integer,integer,text,uuid[],date,date,text)',
    'EXECUTE'),
  'Anon nao tem EXECUTE'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select (result->>'total_count')::bigint=0
   and result->'rows'='[]'::jsonb
   and result->>'commitment_cents'='0'
  from (select public.finance_work_commitments_page_v1() as result) as q),
 'Sem permissao Financeiro, nao exibe registros nem totais'
);
select ok(
 (select (result->>'page')::integer=1 and (result->>'page_size')::integer=100
  from (select public.finance_work_commitments_page_v1(0,5000) as result) as q),
 'SQL limita tamanho de pagina'
);
select ok(
 (select result->'rows'='[]'::jsonb and result->>'total_count'='0'
  from (select public.finance_work_commitments_page_v1(p_store_ids:='{}'::uuid[]) as result) as q),
 'Selecao de nenhuma loja nao retorna todas as lojas'
);
select ok(
 (select result->'rows'='[]'::jsonb and result->>'total_count'='0'
  from (select public.finance_work_commitments_page_v1(p_status:='status_inexistente') as result) as q),
 'Filtro sem correspondencia retorna vazio'
);
set local role postgres;
select * from finish();
rollback;
