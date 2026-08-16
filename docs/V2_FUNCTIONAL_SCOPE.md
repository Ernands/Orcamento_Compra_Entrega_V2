# V2 Functional Scope

Status: escopo funcional para aprovacao.

## Produto

Nome oficial: **Implanta 27 Implantacao, Compra & entrega**.

Aplicar consistentemente em:

- tela de login;
- titulo da aplicacao;
- shell/cabecalho;
- menu;
- metadata;
- documentos internos;
- mensagens de sistema.

## Perfis iniciais

### Administrador

Acesso total conforme permissoes configuradas:

- visualizar, criar, editar, excluir quando permitido;
- administrar usuarios e acessos;
- administrar checklist e Checklist Mestre;
- acessar Implantacao, Suprimentos e Financeiro;
- acessar arquivos;
- administrar configuracoes.

### Prospector

Foco em Implantacao.

Regras:

- acesso a Implantacao conforme permissoes;
- sem acesso padrao a Suprimentos;
- Financeiro nao liberado automaticamente;
- pode receber concessao adicional individual, se configurada.

### Consulta

Somente leitura.

Nao pode:

- criar;
- editar;
- excluir;
- aprovar;
- cancelar;
- alterar status;
- anexar quando upload representar alteracao;
- administrar configuracoes.

## Navegacao V2 proposta

Menu inicial recomendado:

```text
Dashboard

Implantacao
  Lojas
  Checklists
  Pendencias
  Checklist Mestre

Suprimentos
  Itens e Necessidades
  Cotacoes
  Aprovacoes
  Compras
  Dashboard Suprimentos

Financeiro
  Visao Geral
  Por Loja
  Reembolsos
  Documentos
  Pendencias

Administracao
  Acessos
  Historico
  Configuracoes
```

Ajuste importante:

- `Dashboard` ja e a visao principal de Implantacao.
- Evitar duplicar `Implantacao > Visao geral` se for a mesma tela.
- O menu deve ser filtrado por permissao real.

## Dashboard principal

Dashboard principal = Implantacao.

Ao entrar apos login, o usuario deve cair nele.

Conteudos:

- total de lojas;
- lojas em implantacao;
- planejamento;
- atrasadas;
- prontas;
- proximas inauguracoes;
- progresso geral;
- atividades vencidas;
- bloqueios;
- pendencias importantes;
- visao por UF;
- visao por responsavel;
- acesso claro ao Dashboard Suprimentos, somente se permitido.

Principios:

- simples;
- bonito;
- visual;
- rapido;
- responsivo;
- util para decisao;
- sem virar relatorio pesado.

## Dashboard por UF

Mostrar progresso e riscos por UF.

Informacoes sugeridas:

- UF;
- quantidade de lojas;
- progresso medio;
- atrasadas;
- bloqueios;
- proximas inauguracoes.

Visualizacao recomendada:

- ranking compacto em desktop;
- cards agrupados em mobile;
- grafico pequeno apenas se trouxer leitura mais rapida;
- mapa somente se houver valor real, nao por decoracao.

## Dashboard por responsavel

Mostrar:

- responsavel;
- lojas atribuídas;
- progresso medio;
- pendencias;
- bloqueios;
- atividades vencidas.

Objetivo: orientar gestao de carga e risco sem criar uma tela de relatorio pesada.

## Lojas

Na listagem e no Dashboard, cada loja deve exibir:

- nome;
- cidade;
- UF;
- responsavel;
- progresso;
- status;
- inauguracao;
- pendencias relevantes.

Preferencia visual:

```text
Nome da loja
Cidade / UF
Responsavel
```

Desktop:

- tabela/card hibrido;
- colunas enxutas;
- acoes alinhadas.

Mobile:

- cards escaneaveis;
- acao principal clara;
- sem tabela larga.

## Detalhe da loja

Ao abrir uma loja, a aba padrao deve ser **Implantacao**.

Abas:

1. Implantacao
2. Resumo e Necessidades
3. Anexos

Nao criar abas separadas `Resumo` e `Necessidades`.

## Implantacao da loja

Preservar conceitos do legado:

- checklist;
- fases;
- atividades;
- status;
- progresso;
- responsaveis;
- datas-alvo;
- data de inauguracao;
- bloqueios;
- pendencias;
- criticidade;
- timeline;
- comentarios;
- anexos/evidencias;
- auditoria.

Regras preservadas:

- iniciar implantacao gera snapshot das atividades do Checklist Mestre publicado;
- versoes futuras do mestre nao alteram implantacoes ja iniciadas;
- reprogramacao de data deve preservar datas originais;
- bloqueio/desbloqueio deve manter historico;
- timeline funcional deve ser diferente de auditoria tecnica.

## Resumo e Necessidades

Uma unica tela/aba consolidando:

### Dados da loja

- identificacao;
- nome;
- cidade;
- UF;
- endereco;
- responsavel;
- contatos;
- status;
- datas;
- observacoes;
- demais dados relevantes.

### Necessidades

- itens necessarios;
- quantidade;
- situacao;
- cotacao;
- compra;
- fornecedor, quando aplicavel;
- observacoes;
- totais;
- evolucao.

Objetivo: o usuario deve entender a loja sem alternar entre `Resumo` e `Necessidades`.

## Anexos da loja

Toda loja deve possuir area propria de anexos.

Arquivos tambem podem estar vinculados a:

- loja;
- atividade de implantacao;
- checklist;
- compra;
- despesa;
- nota fiscal;
- reembolso;
- cotacao;
- proposta;
- outro registro autorizado.

Requisito: anexos nao podem ficar presos apenas em timeline.

## Checklist Mestre

Administrador deve administrar Checklist Mestre:

- criar;
- editar;
- adicionar atividade;
- remover atividade quando seguro;
- alterar ordem;
- criar fase;
- alterar fase;
- organizar atividades;
- definir offset;
- definir responsavel padrao;
- definir obrigatoriedade;
- definir criticidade;
- definir evidencia;
- criar nova versao;
- publicar;
- inativar;
- excluir somente quando tecnicamente permitido.

Regra central: modelo ja usado nao pode ser alterado de forma destrutiva.

## Itens e Necessidades

UX recomendada: **Itens e Necessidades** como uma experiencia unica.

Exemplo de leitura:

```text
Cadeira de Atendimento
LOJ-001   8
LOJ-006  10
LOJ-014   6
Total    24
```

No banco, manter entidades separadas e relacionais:

- `itens`;
- `necessidades_loja`.

A interface deve permitir alternar rapidamente entre:

- visao por item;
- lojas que precisam do item;
- totais;
- status de cotacao/compra/entrega;
- pendencias de definicao.

## Cotacoes

Preservar:

- fornecedores;
- propostas;
- proposta agrupada;
- itens;
- lojas;
- quantidades derivadas;
- precos;
- prazos;
- pagamento;
- selecao;
- comparacao por escopo equivalente;
- historico.

Redesenhar relacionalmente:

- cotacao como processo;
- proposta como resposta comercial de fornecedor;
- linhas/vinculos de proposta com necessidades;
- selecao/aprovacao separadas.

## Compras

Relacionamentos esperados:

```text
Cotacao
  -> selecao/aprovacao
  -> compra
  -> entrega
  -> financeiro

Compra
  -> loja(s)
  -> itens
  -> documentos
  -> financeiro
```

Escopo inicial de V2 deve deixar compras modeladas mesmo que implementacao venha depois de Implantacao/Arquivos/Suprimentos.

## Financeiro

Financeiro integra:

- Implantacao;
- Compras;
- documentos;
- pagamentos;
- reembolsos.

Objetivo: controlar custos por loja e organizar documentos para reembolso junto ao banco custeador.

Ver [V2_FINANCIAL.md](./V2_FINANCIAL.md).

## Acessos

Area `Administracao > Acessos` deve permitir futuramente:

- listar usuarios;
- criar usuario;
- editar usuario;
- ativar;
- inativar;
- alterar perfil;
- conceder permissoes;
- remover permissoes;
- definir lojas;
- consultar ultimo acesso;
- redefinir acesso/senha;
- consultar historico de alteracoes de acesso.

## Mobile

Mobile e requisito primario, nao adaptacao posterior.

Priorizar:

- lojas;
- atividades;
- checklist;
- pendencias;
- atualizacao;
- fotos;
- anexos;
- comentarios;
- responsaveis.

## Fora do escopo desta rodada

Nao fazer:

- frontend operacional;
- banco real;
- migrations operacionais;
- login CPF;
- Supabase Storage;
- Edge Functions;
- Netlify Functions;
- Netlify deploy;
- migracao de dados;
- push.
