# Implanta 27

**Implantacao, Compra & entrega**

V2 segura para identidade, autorizacao, lojas, implantacao e primeira etapa de Suprimentos.

## Stack

- React 19 + TypeScript + Vite;
- React Router com URLs limpas;
- Supabase Auth, PostgreSQL, RLS e Edge Functions;
- Netlify preparado para build da SPA;
- Vitest + Testing Library e pgTAP.

## Requisitos

- Node.js 20 ou superior (Node 22 recomendado);
- npm;
- Docker Desktop ou runtime Docker compativel para Supabase local.

## Inicio local

```powershell
npm install
npx supabase start
npx supabase db reset --local
npx supabase status -o env
```

Crie `.env` a partir de `.env.example` usando somente URL e publishable key. Para as Edge Functions, crie `supabase/functions/.env` com:

```dotenv
CPF_LOOKUP_SECRET=gere-um-segredo-aleatorio-com-pelo-menos-32-caracteres
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Nunca use secret key, service role, senha ou JWT secret em variavel `VITE_*`.

Em terminais separados:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
npm run dev
```

## Comandos

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:scan
npm run test:db
npm run types:generate
```

`npm run types:generate` atualiza `src/data/supabase/database.types.ts` a partir do schema local.

## Banco e migrations

As migrations ficam em `supabase/migrations/` e reproduzem toda a fundacao. `supabase/seed.sql` possui apenas duas lojas sinteticas locais, sem CPF, senha ou dado real.

Para recriar o banco:

```powershell
npx supabase db reset --local
npx supabase test db --local
```

Nunca use `db reset --linked` sem confirmar explicitamente que o projeto remoto e descartavel.

## Primeiro Administrador

O primeiro acesso nao e criado por migration nem seed. Use o procedimento em [V2_FIRST_ADMIN.md](./docs/V2_FIRST_ADMIN.md) depois de aplicar as migrations e configurar secrets localmente.

## Netlify

`netlify.toml` define `npm run build`, publicacao de `dist`, fallback SPA e headers de seguranca. A conexao remota deve ser feita somente apos aprovacao, seguindo [V2_LOCAL_SETUP.md](./docs/V2_LOCAL_SETUP.md).

## Documentacao da Fase 1

- [Fundacao](./docs/V2_PHASE1_FOUNDATION.md)
- [Auth CPF](./docs/V2_AUTH_CPF_IMPLEMENTATION.md)
- [Setup local e DEV](./docs/V2_LOCAL_SETUP.md)
- [Primeiro Administrador](./docs/V2_FIRST_ADMIN.md)
- [Matriz de RLS](./docs/V2_RLS_TEST_MATRIX.md)
- [ADR do endpoint CPF](./docs/ADR-001_CPF_LOGIN_EDGE_FUNCTION.md)

## Pacote de Implantacao

- [Implementacao do pacote](./docs/V2_IMPLANTATION_PACKAGE.md)
- [Modelo de dados](./docs/V2_DATABASE_MODEL.md)
- [Autorizacao e RLS](./docs/V2_AUTHORIZATION_AND_RLS.md)
- [Arquivos e Storage](./docs/V2_FILES_AND_STORAGE.md)

## Pacote de Suprimentos

- [Itens, fornecedores, cotacoes e comparativo](./docs/V2_SUPPLY_PACKAGE.md)
