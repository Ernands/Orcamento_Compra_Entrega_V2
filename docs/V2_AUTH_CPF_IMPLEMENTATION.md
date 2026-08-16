# V2 Auth CPF Implementation

## Fluxo final

```text
CPF + senha
  -> cpf-login (Edge Function)
  -> normaliza e valida CPF
  -> HMAC do CPF e do IP
  -> limite de tentativas no PostgreSQL
  -> resolve email tecnico em tabela privada
  -> Supabase Auth signInWithPassword
  -> access token + refresh token
  -> supabase.auth.setSession no frontend
  -> auth.uid() nas policies RLS
```

O identificador tecnico e criado aleatoriamente no backend e nunca e derivado no browser. O endpoint nao devolve email, `auth_user_id` ou objeto `user`; devolve somente os tokens exigidos por `setSession`. Como em qualquer sessao Supabase, o JWT contem claims tecnicas padrao necessarias ao Auth/RLS, mas nenhuma delas e exibida pela interface ou usada como identificador funcional.

O provedor email/senha do Supabase permanece habilitado porque valida as identidades tecnicas criadas pelo Administrador. O signup publico continua bloqueado globalmente; habilitar o provedor nao cria uma rota publica de cadastro.

## Persistencia do CPF

- entrada normalizada para 11 digitos;
- digitos verificadores validados em funcao central testada;
- sequencias repetidas rejeitadas;
- HMAC-SHA256 persistido em `private.auth_identities.cpf_lookup`;
- segredo do HMAC fora do banco versionado;
- `cpf_last4` usado apenas para mascara administrativa;
- CPF nao e PK, FK, URL, query string ou log.

Hash simples nao foi usado porque CPF possui espaco de busca pequeno. O HMAC depende de segredo server-side e reduz o risco de enumeracao offline caso apenas o banco de negocio seja exposto.

## Rate limiting

`private.login_rate_limits` controla dois sujeitos:

- HMAC do CPF;
- HMAC do IP de origem.

Politica inicial: ate 5 tentativas em 15 minutos. A sexta tentativa bloqueia por 15 minutos. O consumo e atomico em RPC; sucesso remove os dois contadores. Falhas permanecem agregadas na tabela privada sem CPF ou IP em claro.

## Erros

- CPF inexistente e senha incorreta: `CPF ou senha invalidos`;
- rate limit: mensagem temporal sem confirmar cadastro;
- inativo/bloqueado: mensagem administrativa necessaria;
- excecoes internas: resposta generica, sem SQL, token, CPF ou email tecnico.

## Criacao e reset

`admin-users` exige JWT valido, capability e revalidacao no PostgreSQL.

- criar: Auth Admin cria hash/senha; RPC transacional cria usuario, identidade privada, lojas e auditoria;
- falha na RPC de criacao: identidade Auth e removida como compensacao;
- reset: Auth Admin define senha temporaria; RPC marca troca obrigatoria e audita;
- troca propria: JWT identifica o usuario, senha atual e revalidada via `signInWithPassword`, Auth Admin altera a senha e RPC remove `must_change_password`.

Senha nunca e persistida ou registrada pelo codigo da aplicacao.

## Referencias oficiais validadas

- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-setsession
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
