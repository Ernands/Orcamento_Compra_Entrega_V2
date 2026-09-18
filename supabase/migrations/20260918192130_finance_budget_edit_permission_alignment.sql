create or replace function private.prepare_finance_store_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not app.can_store('finance', 'budget_edit', new.store_id) then
    raise exception 'permission denied';
  end if;
  new.updated_by := app.current_usuario_id();
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.prepare_finance_store_budget() from public, anon, authenticated, service_role;
