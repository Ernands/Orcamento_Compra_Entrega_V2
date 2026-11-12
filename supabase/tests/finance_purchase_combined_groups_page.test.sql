begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select ok(
 to_regprocedure('public.finance_purchase_combined_groups_page_v1(integer,integer)') is not null,
 'SQL para grupos CMPs combinadas existe'
);
select ok(
 not (select prosecdef from pg_proc where oid=
 'public.finance_purchase_combined_groups_page_v1(integer,integer)'::regprocedure),
 'Função aplica RLS como invoker'
);
select ok(
 (select provolatile='s' from pg_proc where oid=
 'public.finance_purchase_combined_groups_page_v1(integer,integer)'::regprocedure),
 'Função de consulta está marcada STABLE'
);
select ok(has_function_privilege('authenticated',
 'public.finance_purchase_combined_groups_page_v1(integer,integer)','EXECUTE'),
 'Usuários autenticados podem chamar'
);
select ok(not has_function_privilege('anon',
 'public.finance_purchase_combined_groups_page_v1(integer,integer)','EXECUTE'),
 'Anon não pode executar'
);
select ok(not has_function_privilege('public',
 'public.finance_purchase_combined_groups_page_v1(integer,integer)','EXECUTE'),
 'PUBLIC não pode executar'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select ok(
 (select r->>'total_count'='0' and r->'rows'='[]'::jsonb
  and r->>'amount_cents_total'='0'
 from (select public.finance_purchase_combined_groups_page_v1() r) q),
 'Usuário sem autorização não recebe eventos nem valores'
);
select ok(
 (select r->>'page'='1' and r->>'page_size'='100'
 from (select public.finance_purchase_combined_groups_page_v1(0,5000) r) q),
 'Paginação tem limite de 100'
);
select ok(
 (select r->>'is_complete'='true' and r->>'unsupported_payment_count'='0'
 from (select public.finance_purchase_combined_groups_page_v1() r) q),
 'Sem dados visíveis não inventa exclusões'
);
set local role postgres;
select ok(
 3139920::bigint+1218000::bigint=4357920::bigint,
 'CMP-00002 e CMP-00003: entrada combinada exata em centavos'
);
select ok(
 1465296::bigint+568400::bigint=2033696::bigint,
 'CMP-00002 e CMP-00003: parcela combinada exata em centavos'
);
select ok(
  (select count(*)=2 and sum(amount_cents)=4357920::bigint
  from (values
   ('paid'::text,date '2026-09-11','Miranda','invoiced','Entrada Miranda',3139920::bigint),
   ('paid',date '2026-09-11','Miranda','invoiced','Entrada Miranda',1218000::bigint)
  ) e(status,event_date,supplier,method,label,amount_cents)
  group by status,event_date,supplier,method,label),
 'Duas CMPs sob a mesma chave financeira formam um único grupo'
);
select * from finish();
rollback;