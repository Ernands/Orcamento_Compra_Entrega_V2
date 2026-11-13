begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  to_regprocedure('public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text)') is not null,
  'Read-only paginated finance source RPC exists'
);
select ok(
  not (select prosecdef from pg_proc where oid =
    'public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text)'::regprocedure),
  'Finance read model uses SECURITY INVOKER and preserves table RLS'
);
select ok(
  (select provolatile = 's' from pg_proc where oid =
    'public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text)'::regprocedure),
  'Finance read model is STABLE'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text)',
    'EXECUTE'
  ),
  'Signed-in user can request finance page'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finance_payment_sources_page_v1(integer,integer,text,text,date,date,text)',
    'EXECUTE'
  ),
  'Anonymous user cannot execute finance page'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);
select ok(
  (select (result ->> 'total_count')::bigint = 0
       and result -> 'rows' = '[]'::jsonb
       and result ->> 'raw_total_cents' = '0'
    from (select public.finance_payment_sources_page_v1() as result) as page),
  'User without finance permissions sees no source events or totals'
);
select ok(
  (select (result ->> 'page')::integer = 1
       and (result ->> 'page_size')::integer = 100
    from (select public.finance_payment_sources_page_v1(0, 5000)) as page(result)),
  'Server clamps invalid page and page size to safe bounds'
);

set local role postgres;
select * from finish();
rollback;
