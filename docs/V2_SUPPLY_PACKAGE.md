# V2 Pacote de Suprimentos - Etapa 1

Status: implementado e validado localmente em 2026-08-17.

## Escopo

Esta etapa implementa o fluxo informacional:

`Loja -> Necessidade -> Item -> Cotacao -> Comparativo`

Foram entregues catalogo de itens e servicos, vinculo com necessidades existentes,
fornecedores com canais, cotacoes historicas com multiplos itens e comparativo por
loja ou contexto consolidado.

Nao existem nesta etapa aprovacao, escolha oficial, pedido de compra, compra,
pagamento, entrega, recebimento, nota fiscal operacional, reembolso, Financeiro ou
Dashboard geral.

## Modelo de dados

### Itens e necessidades

`supply_items` e o catalogo global reutilizavel. O UUID e a identidade interna e o
codigo `ITM-XXXX` e apenas identificador humano. Produto e servico usam o mesmo
catalogo, com categoria, unidade padrao, referencia, especificacao e inativacao.

`store_needs` continua sendo a unica origem de necessidades. A coluna opcional
`supply_item_id` relaciona uma necessidade ao catalogo sem copiar descricao,
quantidade, prioridade ou observacoes especificas da loja. O RPC
`link_store_need_item` valida `needs.edit`, escopo da loja e item ativo.

A tela consolida quantidade total e por loja. Essa soma e informativa e nao cria
compra centralizada.

### Fornecedores e canais

`suppliers` guarda cadastro, contato, localidade, documento opcional e estado
ativo/inativo. O documento nao e chave primaria.

`supplier_channels` permite mais de um canal por fornecedor. Os canais disponiveis
sao cidade da loja, capital do estado, regional, nacional e e-commerce. Cada canal
pode registrar cidade, UF e cobertura nacional. O RPC `save_supplier` salva
fornecedor e canal principal na mesma transacao.

### Cotacoes

`supply_quotes` e o cabecalho historico. Ele guarda fornecedor, canal, origem,
data, validade, contato, contexto, status e snapshots do nome do fornecedor e da
origem. Os status sao `draft`, `received`, `expired` e `cancelled`; nao existe
`approved`.

`supply_quote_stores` normaliza as lojas atendidas. Nenhum array ou JSON de lojas e
usado para autorizacao.

`supply_quote_items` guarda item, necessidade opcional, loja opcional, quantidade,
unidade, preco unitario, desconto, frete, outros custos, prazo, quantidade minima,
marca/modelo, URL e data de captura. Linhas sem loja representam preco consolidado
e so sao permitidas no contexto consolidado.

O RPC `save_supply_quote` cria ou substitui atomicamente cabecalho, lojas e linhas.
Ele valida capabilities, todas as lojas, item e fornecedor ativos, necessidade,
quantidade, dinheiro, frete, prazo e validade. Apenas cotacoes `draft` podem ser
editadas. Uma nova proposta deve gerar nova cotacao, preservando o historico.

## Calculo

Para cada linha:

```text
subtotal = quantidade x preco unitario
total = subtotal + frete + outros custos - desconto
```

Valores monetarios sao `numeric(14,2)` no PostgreSQL. Quantidade usa
`numeric(14,3)`. No frontend os calculos usam inteiros em centavos com `BigInt`,
incluindo arredondamento da multiplicacao por quantidade, sem usar float como fonte
do total.

Frete possui estados distintos:

- `free`: valor historico zero;
- `informed`: valor obrigatorio maior ou igual a zero;
- `pending`: valor nulo e exibicao "A consultar".

Alternativas com frete pendente nao recebem destaque de menor custo conhecido.

## Comparativo

O Comparativo pode filtrar por loja, item, necessidade e contexto. Cada alternativa
mostra fornecedor, origem, marca/modelo, quantidade, preco unitario, subtotal,
frete, total, prazo, validade e status.

Os destaques sao independentes:

- menor preco unitario;
- menor custo total conhecido;
- menor prazo informado.

Nenhum destaque representa vencedor, escolha ou aprovacao.

## Capabilities

- `items.view` e `items.manage`;
- `suppliers.view` e `suppliers.manage`;
- `quotes.view`, `quotes.create` e `quotes.edit`.

Administrador e Prospector recebem as operacoes desta etapa. Consulta recebe apenas
as tres capabilities de leitura. Nao foi criada `quotes.approve`.

## RLS e multiloja

Todas as seis tabelas novas possuem RLS. Catalogo e fornecedor sao globais por
capability e nunca ficam abertos para anonimo.

Uma cotacao somente e visivel quando o usuario possui `quotes.view` e acesso a
**todas** as lojas em `supply_quote_stores`. Essa decisao conservadora impede que
cabecalho, observacoes ou linhas consolidadas de LOJ-002 vazem para um Prospector
que possui apenas LOJ-001. Filtro frontend nao participa da autorizacao.

Escritas de cotacao nao recebem grants diretos. O RPC transacional valida
`quotes.create` ou `quotes.edit` loja por loja. Todas as funcoes `security definer`
fixam `search_path` e possuem grants minimos.

## Auditoria

Sao registrados:

- `item.created` e `item.updated`;
- `supplier.created` e `supplier.updated`;
- alteracoes de canal;
- `quote.created` e `quote.updated`;
- `quote.item_added` e `quote.item_updated`.

O documento do fornecedor e removido dos snapshots de auditoria. Leituras nao sao
auditadas.

## Rotas

- `/suprimentos/itens-necessidades`;
- `/suprimentos/fornecedores`;
- `/suprimentos/cotacoes`;
- `/suprimentos/comparativo`.

## Migrations

- `014_supply_domain`: tipos, tabelas, relacionamentos, constraints e indices;
- `015_supply_capabilities_rls`: capabilities, perfis, grants e policies;
- `016_supply_workflows_audit`: vinculo de necessidade, fornecedor, cotacao e auditoria.

Depois de homologadas, essas migrations deverao ser aplicadas ao Supabase DEV na
ordem 014, 015 e 016. Esta implementacao nao executa `supabase db push`.

## Validacao manual

1. Entrar como Administrador e cadastrar um produto e um servico.
2. Abrir Itens e Necessidades, filtrar uma loja e vincular uma necessidade.
3. Cadastrar fornecedor local e fornecedor com canal e-commerce.
4. Criar cotacao de uma loja com dois itens, um frete gratis e outro informado.
5. Criar cotacao consolidada para duas lojas com uma linha sem loja especifica.
6. Conferir subtotais e totais na listagem e no Comparativo.
7. Filtrar o Comparativo por loja e confirmar os tres destaques independentes.
8. Entrar como Consulta e confirmar ausencia dos botoes de criar/editar.
9. Entrar como usuario com apenas uma das lojas e confirmar que a cotacao multiloja
   nao e exibida.

## Proximas etapas

A evolucao planejada parte de uma alternativa historica do Comparativo para um
processo separado de aprovacao e, depois, compra, entrega e recebimento. Nenhum
campo temporario de aprovacao ou compra foi introduzido nas tabelas desta etapa.
