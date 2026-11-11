begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supply_items'
      and policyname = 'supply_items_read_capability'
      and position('SELECT app.can' in qual) > 0
  ),
  'Leitura do catalogo calcula capacidades por InitPlan'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'suppliers'
      and policyname = 'suppliers_read_capability'
      and position('SELECT app.can' in qual) > 0
  ),
  'Leitura de fornecedores calcula capacidade por InitPlan'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.supply_items),
  0::bigint,
  'Usuario sem permissao nao enxerga o catalogo'
);
select is(
  (select count(*) from public.suppliers),
  0::bigint,
  'Usuario sem permissao nao enxerga fornecedores'
);

set local role postgres;
select * from finish();
rollback;
