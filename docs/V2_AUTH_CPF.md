# V2 Auth CPF

Status: desenho de autenticacao. Nao implementar nesta rodada.

## Requisito

O usuario acessa com CPF + senha. O CPF e dado cadastral/autenticador visivel, mas nao deve ser PK, FK ou segredo em logs. Internamente, usar UUID tecnico de usuario e `auth.users.id` do Supabase Auth para sessao/JWT.

## Premissas obrigatorias

- Remover Google Login.
- Nao armazenar senha manualmente em tabela de negocio.
- Nao inventar criptografia propria.
- Nao usar CPF completo em logs.
- Normalizar CPF para 11 digitos.
- Validar digitos verificadores.
- Aplicar unicidade por forma segura, preferencialmente hash/HMAC normalizado.
- Exibir CPF mascarado por padrao.

## Modelo conceitual

```text
auth.users.id
  -> usuarios.auth_user_id

usuarios.id                 UUID interno de negocio
usuarios.cpf_hash           busca/unicidade sem expor CPF
usuarios.cpf_last4          exibicao limitada
usuarios.cpf_masked         opcional
usuarios.status             ativo/inativo/bloqueado
usuarios.must_change_password
```

Se for necessario armazenar CPF completo por exigencia operacional, o acesso deve ser minimo, auditado e nunca usado como chave relacional.

## Alternativa A: email tecnico gerado no frontend

Arquitetura: frontend transforma CPF em identificador semelhante a email e chama Supabase Auth diretamente.

Seguranca: fraca. O cliente conhece a regra de mapeamento, o que facilita enumeracao e abuso.

RLS: boa, pois Supabase Auth emite JWT.

Recuperacao de senha: ruim se o email tecnico nao for um canal real.

Complexidade: baixa.

Riscos: enumeracao, padrao exposto, fluxo dificil de recuperar senha.

Conclusao: nao recomendada.

## Alternativa B: auth proprio com tabela de senhas

Arquitetura: criar tabela propria de senhas, hash e JWT proprio.

Seguranca: risco alto e responsabilidade desnecessaria.

RLS: complexa, exigiria JWT compativel e operacao segura de assinatura.

Recuperacao de senha: totalmente customizada.

Complexidade: alta.

Riscos: bugs de hash, sessao, refresh, revogacao, brute force e auditoria.

Conclusao: rejeitada; contraria o requisito de nao armazenar senha manualmente.

## Alternativa C: Supabase Auth + funcao segura de login por CPF

Arquitetura:

1. Admin cria usuario em Acessos.
2. Backend cria usuario no Supabase Auth e registro em `usuarios`.
3. `usuarios` guarda `auth_user_id`, CPF normalizado protegido e status.
4. Login chama Supabase Edge Function ou Netlify Function com CPF + senha.
5. Funcao normaliza CPF, aplica rate limit, verifica status/bloqueio e resolve identificador tecnico.
6. Funcao autentica no Supabase Auth.
7. Supabase Auth retorna sessao/JWT.
8. RLS usa `auth.uid()`.

Seguranca: boa, porque senha fica no Supabase Auth, service role fica so na funcao e CPF nao precisa virar email publico.

RLS: excelente, usa JWT padrao Supabase.

Recuperacao de senha: Fase 1 por administrador; fase futura por email/telefone validado.

Complexidade: media.

Riscos: rate limit fraco, logs com CPF, mensagens permitindo enumeracao.

Conclusao: recomendada.

## Alternativa D: IdP externo com CPF

Arquitetura: provedor externo autentica CPF + senha e integra via JWT/OIDC.

Seguranca: pode ser forte.

RLS: depende da integracao com Supabase Auth/JWT.

Complexidade: media/alta.

Custo: maior.

Conclusao: considerar apenas se houver requisito corporativo futuro.

## Recomendacao

Adotar **Alternativa C: Supabase Auth + funcao segura de login por CPF**.

Preferencia inicial: Supabase Edge Function, por proximidade com Auth, service role e Supabase. Netlify Function fica como alternativa caso exista motivo operacional claro.

## Criacao inicial de usuario

1. Administrador informa nome, CPF, contato, perfil e lojas.
2. Backend valida CPF e unicidade.
3. Backend cria `auth.users`.
4. Backend cria `usuarios`.
5. Backend grava perfis, permissoes individuais e lojas.
6. Backend registra auditoria.
7. Usuario recebe senha temporaria ou fluxo de definicao de senha.
8. Primeiro acesso exige troca de senha, se aprovado.

## Bloqueio e tentativas invalidas

Planejar:

- rate limit por IP;
- rate limit por CPF hash;
- contador de falhas;
- bloqueio temporario progressivo;
- status `bloqueado`;
- resposta generica para CPF/senha invalidos;
- auditoria sem CPF completo.

## Recuperacao de senha

Fase 1 recomendada:

- reset por Administrador em Acessos;
- senha temporaria;
- troca obrigatoria no proximo login;
- revogacao opcional de sessoes antigas;
- auditoria.

Fase futura:

- canal validado, como email ou telefone;
- token curto;
- rate limit;
- nao revelar se CPF existe.

## Logout e expiracao

Usar Supabase Auth para sessao e refresh token.

Requisitos:

- logout local;
- opcao futura de revogar sessoes;
- expiracao configurada;
- limpar dados sensiveis de memoria quando sair.

## Testes obrigatorios

- CPF valido, invalido, mascarado e sem mascara.
- CPF inexistente retorna erro generico.
- Usuario inativo nao autentica.
- Usuario bloqueado nao autentica.
- Senha invalida incrementa tentativa.
- Rate limit funciona por IP e CPF hash.
- Troca obrigatoria de senha bloqueia navegacao normal.
- `auth.uid()` resolve usuario interno.
- RLS nega acesso sem sessao.
- Logs nao contem CPF completo, senha ou token.
