# V2 Local Setup and DEV Connection

## Local

Requisitos: Node 20+, npm e Docker Desktop.

```powershell
npm install
npx supabase start
npx supabase db reset --local
npx supabase test db --local
npx supabase status -o env
```

Configure `.env` apenas com os valores publicos apresentados pelo status local:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-ou-anon-local>
VITE_APP_ENV=local
```

Crie `supabase/functions/.env`, ignorado pelo Git:

```dotenv
CPF_LOOKUP_SECRET=<segredo-aleatorio-de-32-ou-mais-caracteres>
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

```powershell
npx supabase functions serve --env-file supabase/functions/.env
npm run dev
```

## Conectar ao Supabase DEV depois da aprovacao

Nenhum destes comandos foi executado nesta fase.

```powershell
npx supabase login
npx supabase link --project-ref <DEV_PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set CPF_LOOKUP_SECRET=<SEGREDO> ALLOWED_ORIGINS=<URL_NETLIFY_DEV>
npx supabase functions deploy cpf-login --no-verify-jwt
npx supabase functions deploy admin-users --no-verify-jwt
npx supabase functions deploy change-password --no-verify-jwt
```

No Dashboard Supabase DEV:

1. manter o provedor email/senha habilitado e desabilitar o signup publico global;
2. confirmar senha minima de 10 caracteres;
3. criar uma publishable key e uma secret key separada para este backend;
4. nao colocar secret key no Netlify;
5. executar o bootstrap do primeiro Administrador;
6. rodar smoke tests de Admin, Prospector e Consulta.

Gerar tipos depois de aplicar as migrations:

```powershell
npm run types:generate
```

## Configurar Netlify depois da aprovacao

1. importar o repositorio GitHub no Netlify;
2. manter `npm run build` e `dist` lidos de `netlify.toml`;
3. configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_APP_ENV=dev`;
4. nao configurar secret key, service role, senha ou JWT secret em variavel `VITE_*`;
5. adicionar a URL final do site a `ALLOWED_ORIGINS` nas secrets das Edge Functions;
6. executar Deploy Preview e validar `/login`, `/lojas` e fallback de URL limpa antes de liberar producao.

## Proibicoes operacionais

- nao usar `supabase db reset --linked` em projeto remoto;
- nao usar `--include-seed` em producao;
- nao apontar Preview para Supabase PROD;
- nao commitar `.env`, `supabase/functions/.env` ou saida de `supabase status`.
