# ADR-001: Login CPF em Supabase Edge Function

Status: aceito na Fase 1.

## Contexto

O usuario conhece apenas CPF e senha. O browser nao pode derivar o identificador tecnico do Supabase Auth nem receber credencial elevada. O endpoint precisa resolver identidade, limitar tentativas e devolver uma sessao Supabase normal para RLS.

## Decisao

Usar uma unica **Supabase Edge Function** para login CPF.

Comparacao resumida:

| Criterio     | Edge Function                   | Netlify Function                   |
| ------------ | ------------------------------- | ---------------------------------- |
| Auth e banco | Integracao direta com Supabase  | Salto adicional ate Supabase       |
| Secrets      | Secret store do Supabase        | Secret store do Netlify            |
| CORS         | Um dominio de API conhecido     | Exige coordenar Netlify e Supabase |
| Local        | Supabase CLI reproduz runtime   | Netlify CLI separado               |
| Manutencao   | Auth, RPC e RLS no mesmo limite | Dois backends para a fundacao      |

A Edge Function reduz componentes, latencia e configuracao de ambientes. Netlify fica restrito a hospedagem da SPA nesta fase.

## Consequencias

- `CPF_LOOKUP_SECRET` fica apenas no secret store da Edge Function e no terminal administrativo durante bootstrap.
- A function usa secret key/service role somente para RPCs fechadas e Auth Admin.
- O frontend recebe apenas `access_token` e `refresh_token`, chama `setSession` e passa a operar como `authenticated` sob RLS.
- `verify_jwt = false` e intencional para suportar as novas publishable keys; `cpf-login` valida `apikey` e origem, enquanto functions protegidas tambem validam o JWT com `auth.getUser`.
- Nao existe Netlify Function duplicada.
