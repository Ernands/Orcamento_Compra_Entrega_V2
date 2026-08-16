begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select ok((select relrowsecurity from pg_class where oid = 'public.usuarios'::regclass), 'RLS habilitada em usuarios');
select ok((select relrowsecurity from pg_class where oid = 'public.perfis'::regclass), 'RLS habilitada em perfis');
select ok((select relrowsecurity from pg_class where oid = 'public.permissoes'::regclass), 'RLS habilitada em permissoes');
select ok((select relrowsecurity from pg_class where oid = 'public.modulos'::regclass), 'RLS habilitada em modulos');
select ok((select relrowsecurity from pg_class where oid = 'public.acoes'::regclass), 'RLS habilitada em acoes');
select ok((select relrowsecurity from pg_class where oid = 'public.perfil_permissoes'::regclass), 'RLS habilitada em perfil_permissoes');
select ok((select relrowsecurity from pg_class where oid = 'public.usuario_permissoes'::regclass), 'RLS habilitada em usuario_permissoes');
select ok((select relrowsecurity from pg_class where oid = 'public.lojas'::regclass), 'RLS habilitada em lojas');
select ok((select relrowsecurity from pg_class where oid = 'public.usuario_lojas'::regclass), 'RLS habilitada em usuario_lojas');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'RLS habilitada em auditoria');

select ok(not has_function_privilege('anon', 'public.auth_begin_login_attempt(text,text)', 'EXECUTE'), 'Anonimo nao executa lookup de login');
select ok(not has_function_privilege('authenticated', 'public.admin_create_user_record(uuid,uuid,text,text,text,text,uuid,uuid[],boolean,public.user_status,text)', 'EXECUTE'), 'Usuario autenticado nao executa RPC administrativa privilegiada');
select ok(has_function_privilege('service_role', 'public.auth_begin_login_attempt(text,text)', 'EXECUTE'), 'Somente backend executa suporte de login');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'Schema privado nao e exposto ao usuario');
select ok(not exists(select 1 from pg_policies where schemaname = 'public' and (trim(qual) = 'true' or trim(with_check) = 'true')), 'Nao existem policies USING true ou WITH CHECK true');
select ok(not exists(select 1 from pg_proc where prosecdef and pronamespace in ('app'::regnamespace, 'public'::regnamespace) and coalesce(array_to_string(proconfig, ','), '') not like '%search_path=%'), 'Toda funcao SECURITY DEFINER fixa search_path');

select * from finish();
rollback;
