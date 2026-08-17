# V2 Authorization and RLS

Status: fundacao e matriz do pacote de Implantacao implementadas.

Capabilities atuais do pacote:

- `checklists.view`, `checklists.manage`;
- `implementation.view`, `implementation.edit`;
- `needs.view`, `needs.create`, `needs.edit`;
- `attachments.view`, `attachments.create`, `attachments.delete`.

Administrador recebe todas. Prospector recebe operacao nas lojas atribuidas.
Consulta recebe apenas `implementation.view`, `needs.view` e `attachments.view`,
sempre combinadas com o escopo relacional da loja.

## Principio

Frontend nao e autoridade. Ele pode esconder menus e botoes, mas autorizacao real deve estar no PostgreSQL/Supabase via RLS, constraints e RPCs seguras.

## Perfis iniciais

- Administrador
- Prospector
- Consulta

Perfis sao ponto de partida, nao regras hard-coded. Evitar `if perfil === "Administrador"` espalhado na UI. A UI deve consumir capabilities derivadas do banco.

## Modelo recomendado

Tabelas centrais:

- `usuarios`
- `perfis`
- `modulos`
- `acoes`
- `permissoes`
- `perfil_permissoes`
- `usuario_permissoes`
- `usuario_lojas`

### Permissao efetiva

Permissao efetiva = permissao do perfil + concessoes individuais - revogacoes individuais + escopo de loja.

Campos importantes em `usuario_permissoes`:

- `usuario_id`
- `permissao_id`
- `efeito`: `grant` ou `deny`
- `escopo`: global, modulo, loja, registro quando necessario
- `loja_id` opcional
- `expires_at` opcional
- auditoria.

## Acoes padrao

- `read`
- `create`
- `update`
- `delete`
- `approve`
- `reopen`
- `cancel`
- `admin`
- `export`
- `upload`
- `remove_file`

## Modulos iniciais

- dashboard
- implantacao
- lojas
- checklist
- checklist_mestre
- suprimentos
- itens_necessidades
- cotacoes
- aprovacoes
- compras
- financeiro
- arquivos
- acessos
- historico
- configuracoes

## Escopo de loja

Substituir `Lojas_Permitidas` por tabela relacional:

```text
usuario_lojas
  usuario_id
  loja_id
  escopo_tipo
  created_at
```

Pode existir um marcador de acesso global, mas a leitura/escrita deve continuar resolvida por dados relacionais. Opcoes:

1. `usuario_lojas` com todas as lojas para o usuario.
2. `usuarios.all_stores = true` apenas para simplificar policy.

Recomendacao: usar `all_stores` somente para perfis administrativos e manter `usuario_lojas` para escopos especificos.

## Funcoes SQL auxiliares

Criar funcoes estaveis para policies:

```sql
app.current_usuario_id()
app.can(module_key text, action_key text)
app.can_store(module_key text, action_key text, loja_id uuid)
app.has_store_access(loja_id uuid)
```

Essas funcoes devem:

- usar `auth.uid()`;
- localizar `usuarios.auth_user_id`;
- negar usuario inativo/bloqueado;
- considerar grants/denies individuais;
- considerar perfil;
- considerar loja.

## RLS por categoria

### Usuarios e Acessos

- Usuario comum ve apenas dados minimos proprios.
- Administrador com `acessos.admin` gerencia usuarios.
- CPF completo, se existir, deve ter acesso extremamente restrito.

### Lojas

SELECT:

- permitido se usuario tem `lojas.read` e acesso a loja.

INSERT/UPDATE/DELETE:

- permitido somente via policy/RPC para usuario com acao correspondente.

### Implantacao

SELECT:

- `implantacao.read` + acesso a loja.

Escritas criticas:

- preferir RPC para iniciar ciclo, atualizar atividade, bloquear, reprogramar e publicar checklist.

### Suprimentos

SELECT:

- `suprimentos.read` ou permissao especifica do submodulo + loja.

Propostas agrupadas:

- uma proposta com loja fora do escopo nao deve retornar parcialmente se isso distorcer total financeiro.

### Financeiro

SELECT/WRITE:

- mais restrito que implantacao;
- separar permissoes de leitura financeira de permissao operacional.

### Arquivos

SELECT:

- permitido se usuario pode ver o registro vinculado e tem permissao de arquivos.

Upload:

- permitido se usuario tem `arquivos.upload` e permissao no contexto.

Remocao:

- sempre logica e auditada.

## RPCs `security definer`

Usar com cuidado:

- fixar `search_path`;
- validar usuario com `auth.uid()`;
- chamar funcoes `app.can*`;
- inserir auditoria;
- retornar erro normalizado;
- nao expor service role no cliente.

## Capabilities para frontend

Criar endpoint/query que retorna capacidades agregadas:

```json
{
  "modules": {
    "implantacao": { "read": true, "create": false },
    "financeiro": { "read": false }
  },
  "stores": ["..."]
}
```

O menu usa isso para visibilidade. RLS continua sendo a autoridade.

## Testes de RLS obrigatorios

- usuario sem sessao nao le nada privado;
- Consulta le lojas permitidas, nao escreve;
- Prospector le/escreve Implantacao conforme permissao e nao ve Suprimentos sem grant;
- Administrador acessa todos os modulos;
- usuario sem LOJ-006 nao consegue consultar LOJ-006 manipulando request;
- deny individual supera grant de perfil;
- Financeiro nao herda automaticamente permissao de Implantacao;
- Storage respeita loja/modulo/registro;
- RPC critica falha se usuario nao tem permissao.

## Auditoria de acesso

Auditar:

- criacao/edicao/inativacao de usuario;
- alteracao de perfil;
- concessao/revogacao de permissao;
- alteracao de lojas;
- reset de senha;
- bloqueio/desbloqueio;
- tentativas suspeitas.

Nao auditar CPF completo, senha ou token.
