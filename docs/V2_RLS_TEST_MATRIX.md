# V2 RLS Test Matrix

Autoridade final: PostgreSQL RLS. Esconder menu ou botao nao substitui policy.

| Perfil        | Usuarios/Acessos                          | Loja atribuida | Loja nao atribuida        | Escrita em loja                |
| ------------- | ----------------------------------------- | -------------- | ------------------------- | ------------------------------ |
| Administrador | Lista todos e usa Edge/RPC administrativa | Le todas       | Le todas por `all_stores` | Conforme capacidade especifica |
| Prospector    | Ve apenas o proprio registro              | Le             | Nega                      | Nega nesta fundacao            |
| Consulta      | Ve apenas o proprio registro              | Le             | Nega                      | Nega INSERT/UPDATE/DELETE      |
| Anonimo       | Sem privilegio                            | Sem privilegio | Sem privilegio            | Sem privilegio                 |

## Policies

- `lojas`: `app.can_store('stores', acao, id)`;
- `usuarios`: proprio registro, administrador de acessos ou responsavel visivel de loja concedida;
- `usuario_lojas` e `usuario_permissoes`: proprio usuario ou administrador;
- matriz de modulos/permissoes: somente `access.view`;
- auditoria: somente `access.view` nesta fase;
- schema `private`: sem `USAGE` para `anon` e `authenticated`.

## Funcoes auxiliares

- `app.current_usuario_id()`;
- `app.can(modulo, acao)`;
- `app.has_store_access(loja_id)`;
- `app.can_store(modulo, acao, loja_id)`;
- `public.get_my_capabilities()`.

Todas as funcoes `SECURITY DEFINER` fixam `search_path`, qualificam objetos, validam usuario ativo e possuem grants minimos. RPCs de auth/admin sao executaveis somente por `service_role`.

## Testes pgTAP

`supabase/tests/rls.test.sql` cobre Admin, Prospector, Consulta, anonimo e precedencia de deny individual.

`supabase/tests/schema.test.sql` cobre tabelas, UUID, FKs, constraints e dados de referencia.

`supabase/tests/security.test.sql` cobre RLS habilitada, grants, schema privado, ausencia de policy `using (true)` e `search_path` em functions privilegiadas.

`supabase/tests/auth.test.sql` cobre CPF inexistente, conta inativa, cinco tentativas permitidas, bloqueio na sexta, persistencia do bloqueio apos falha, liberacao apos sucesso e auditoria de login valido.

Executar:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase test db --local
```
