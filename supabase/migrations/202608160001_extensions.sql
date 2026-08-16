create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app.set_updated_at() from public, anon, authenticated;
grant execute on function app.set_updated_at() to service_role;
