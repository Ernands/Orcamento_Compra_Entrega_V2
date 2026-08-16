# V2 First Administrator

O bootstrap e local, manual e permitido apenas quando `public.usuarios` esta vazio. Nenhum CPF, senha ou email real existe em migration, seed, teste ou codigo.

## Pre-requisitos

- migrations aplicadas no ambiente escolhido;
- secret key/service role disponivel somente no terminal seguro;
- `CPF_LOOKUP_SECRET` definitivo para o ambiente;
- CPF valido, nome e senha inicial forte do primeiro Administrador.

## Executar no PowerShell

```powershell
$env:SUPABASE_URL='<URL_DO_SUPABASE_DEV>'
$env:SUPABASE_SECRET_KEY='<SECRET_KEY_DO_DEV>'
$env:CPF_LOOKUP_SECRET='<SEGREDO_HMAC_DO_DEV>'
$env:BOOTSTRAP_ADMIN_NAME='<NOME_DO_ADMIN>'
$env:BOOTSTRAP_ADMIN_CPF='<CPF_DO_ADMIN>'
$env:BOOTSTRAP_ADMIN_PASSWORD='<SENHA_TEMPORARIA_FORTE>'
npm run bootstrap:admin
Remove-Item Env:SUPABASE_URL
Remove-Item Env:SUPABASE_SECRET_KEY
Remove-Item Env:CPF_LOOKUP_SECRET
Remove-Item Env:BOOTSTRAP_ADMIN_NAME
Remove-Item Env:BOOTSTRAP_ADMIN_CPF
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

Para ambiente local legado que ainda fornece apenas service role, use `SUPABASE_SERVICE_ROLE_KEY` no lugar de `SUPABASE_SECRET_KEY`.

## Garantias

- cria identidade em Supabase Auth com email tecnico aleatorio e confirmado;
- senha e processada somente pelo Auth Admin;
- persiste HMAC do CPF e quatro ultimos digitos;
- associa perfil Administrador e `all_stores=true`;
- marca troca obrigatoria de senha;
- registra auditoria com origem `bootstrap`;
- se a transacao de negocio falhar, remove a identidade Auth criada;
- uma segunda execucao e recusada.

Depois, entrar em `/login` com CPF + senha temporaria e concluir `/alterar-senha`.
