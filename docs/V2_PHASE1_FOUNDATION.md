# V2 Phase 1 Foundation

Status: implementacao local da fundacao.

## Entregue

- React, TypeScript, Vite e BrowserRouter;
- rotas `/login`, `/lojas`, `/lojas/:id`, `/acessos` e `/alterar-senha`;
- sessao persistente Supabase, refresh, logout e guards;
- menu filtrado por capacidades;
- telas responsivas com loading, empty, error e success;
- camada de dados separada para auth, acessos e lojas;
- Netlify configurado sem deploy;
- Supabase CLI versionada, migrations, seed sintetico e pgTAP;
- login CPF, criacao de usuario, reset administrativo e troca de senha em Edge Functions;
- perfis Administrador, Prospector e Consulta;
- capacidades normalizadas, grants/denies individuais e escopo relacional por loja;
- auditoria minima de eventos sensiveis.

## Fora desta fase

Dashboard, Implantacao, Checklist, Suprimentos, Compras, Entregas, Financeiro, Storage, uploads, anexos e migracao do legado continuam fora do codigo.

## Estrutura

```text
src/
  app/            providers, guards, router e shell
  components/     estados e componentes compartilhados
  data/           repositories e cliente Supabase
  domain/         tipos de dominio
  lib/            ambiente e invocacao segura
  pages/          telas reais da Fase 1
  tests/          testes React/Vitest
supabase/
  functions/      endpoints seguros e codigo compartilhado
  migrations/     schema reproduzivel
  tests/          pgTAP de schema, grants e RLS
  seed.sql        dados locais sinteticos
scripts/
  bootstrap-admin.ts
  scan-secrets.mjs
```

## Decisoes implementadas

- CPF em claro nao e persistido. A busca usa HMAC-SHA256 em schema privado; somente os quatro ultimos digitos ficam em `usuarios`.
- A senha pertence exclusivamente ao Supabase Auth.
- A escrita administrativa em usuarios passa por Edge Function + RPC service-only.
- Lojas permitem CRUD direto somente quando RLS concede a capacidade especifica; a UI desta fase e somente leitura.
- `all_stores` e reservado a escopo global; os demais acessos usam `usuario_lojas` com FKs e unicidade.
