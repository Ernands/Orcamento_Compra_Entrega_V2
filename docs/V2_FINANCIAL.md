# V2 Financial

Status: desenho inicial completo. Nao implementar nesta rodada.

## Objetivo

Controlar financeiramente cada loja e organizar documentos para solicitacao de reembolso ao banco que custeia a loja.

Financeiro integra:

- Implantacao;
- Suprimentos;
- Compras;
- Entregas;
- Arquivos;
- Auditoria.

## Conceitos principais

### Despesa

Registro financeiro base.

Pode nascer de:

- atividade de implantacao;
- compra;
- contratacao;
- despesa manual autorizada;
- documento fiscal;
- reembolso importado/ajustado.

Campos conceituais:

- loja;
- categoria;
- origem;
- implantacao;
- atividade;
- compra;
- fornecedor;
- valor previsto;
- valor aprovado;
- valor contratado;
- valor comprado;
- valor pago;
- reembolsavel;
- status;
- competencia;
- observacoes.

### Pagamento

Representa saida financeira.

Campos:

- despesa;
- valor;
- data;
- metodo;
- status;
- comprovante;
- observacoes.

### Documento financeiro

Arquivo/metadado vinculado a:

- despesa;
- pagamento;
- compra;
- reembolso;
- loja.

Tipos:

- nota fiscal;
- recibo;
- contrato;
- comprovante de pagamento;
- comprovante de entrega;
- aprovacao;
- outro.

### Reembolso

Agrupa despesas/documentos para solicitacao ao banco.

Campos:

- loja;
- status;
- valor solicitado;
- valor aprovado;
- valor reembolsado;
- solicitado_em;
- aprovado_em;
- reembolsado_em;
- protocolo/referencia;
- observacoes.

### Item de reembolso

Vinculo entre reembolso e despesa.

Campos:

- despesa;
- valor solicitado;
- valor aprovado;
- motivo de glosa/diferenca;
- status.

## Estados financeiros

Estados sugeridos para `despesas`:

- `prevista`
- `aprovada`
- `contratada`
- `comprada`
- `paga_parcial`
- `paga`
- `reembolsavel`
- `solicitada_reembolso`
- `em_analise`
- `aprovada_reembolso`
- `reembolsada`
- `pendente`
- `cancelada`

Estados de `reembolsos`:

- `rascunho`
- `solicitado`
- `em_analise`
- `ajuste_solicitado`
- `aprovado`
- `parcialmente_aprovado`
- `reembolsado`
- `rejeitado`
- `cancelado`

## Fluxo conceitual

```text
Previsto
  -> Aprovado
  -> Contratado/Comprado
  -> Pago
  -> Elegivel para reembolso
  -> Solicitado para reembolso
  -> Em analise
  -> Aprovado/parcial/rejeitado
  -> Reembolsado/pendente
```

## Vinculo com Implantacao

Uma atividade pode gerar despesa:

- obra;
- CFTV;
- alarme;
- fachada;
- internet;
- mobiliario;
- cofre/transporte;
- treinamento;
- inauguracao.

No detalhe da loja, a aba Implantacao deve mostrar indicativos financeiros relevantes quando permitido, sem expor valores a usuarios sem permissao financeira.

## Vinculo com Compras

Compra gera:

- compra_itens;
- entregas;
- despesas;
- documentos;
- pagamentos;
- possivel reembolso.

Selecionar proposta/aprovar compra nao deve automaticamente marcar despesa como paga. Cada etapa financeira precisa de evento proprio.

## Documentos e anexos

Financeiro depende de anexos:

- nota fiscal;
- recibo;
- comprovante de pagamento;
- contrato;
- documento de aprovacao;
- evidencia de entrega quando exigida.

Regras:

- documento fica em Storage privado;
- metadado relacional obrigatorio;
- documento pode servir a despesa e reembolso;
- remocao e logica e auditada.

## Diferencas e conciliacao

Registrar:

- valor previsto vs aprovado;
- aprovado vs contratado;
- comprado vs pago;
- pago vs reembolsado;
- solicitado vs aprovado;
- aprovado vs reembolsado.

Criar pendencia quando:

- documento obrigatorio ausente;
- valor pago maior que aprovado;
- reembolso aprovado menor que solicitado;
- pagamento sem comprovante;
- despesa marcada reembolsavel sem documento minimo.

## Dashboards financeiros

### Visao Geral

- total previsto;
- total aprovado;
- total pago;
- total reembolsavel;
- total solicitado;
- total reembolsado;
- diferenca aberta;
- pendencias.

### Por Loja

- resumo financeiro da loja;
- despesas por categoria;
- pagamentos;
- documentos pendentes;
- reembolsos.

### Reembolsos

- filas por status;
- valores solicitados/aprovados/reembolsados;
- pendencias de documento;
- aging.

### Documentos

- documentos financeiros por loja, categoria e status.

## Permissoes

Financeiro nao deve ser liberado automaticamente para Prospector.

Permissoes:

- financeiro.read
- financeiro.create
- financeiro.update
- financeiro.approve
- financeiro.pay
- financeiro.reimburse
- financeiro.export
- financeiro.admin
- financeiro.documents.read/upload/remove

RLS deve considerar loja e modulo financeiro.

## Operacoes criticas

Usar RPC transacional para:

- criar despesa a partir de compra;
- registrar pagamento;
- cancelar pagamento;
- marcar despesa reembolsavel;
- criar solicitacao de reembolso;
- aprovar/rejeitar item de reembolso;
- registrar recebimento do reembolso;
- conciliar diferenca.

## Auditoria

Auditar:

- criacao/edicao de despesa;
- mudanca de status;
- pagamento;
- anexos financeiros;
- solicitacao de reembolso;
- aprovacao/rejeicao;
- recebimento;
- conciliacao.

Auditoria deve guardar before/after, actor, entidade, correlation id e origem.

## Idempotencia

Obrigatoria para:

- registrar pagamento;
- criar reembolso;
- registrar recebimento;
- integrar compra -> despesa.

Modelo:

- `idempotency_keys`;
- chave por operacao;
- request hash;
- resposta persistida;
- expiracao.

## Testes obrigatorios

- usuario sem financeiro nao ve valores.
- usuario com loja A nao ve financeiro da loja B.
- pagamento nao aceita valor negativo/zero.
- reembolso nao inclui despesa nao elegivel.
- documento obrigatorio ausente cria pendencia.
- registrar pagamento cria auditoria.
- retry idempotente nao duplica pagamento.
- cancelamento preserva historico.
