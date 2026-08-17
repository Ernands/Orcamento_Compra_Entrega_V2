# V2 Files and Storage

Status: anexos privados por loja implementados; vinculos genericos e thumbnails permanecem futuros.

O MVP usa o bucket privado `store-attachments` e a tabela
`store_attachments`. O path e `lojas/{loja_id}/loja/{arquivo_id}/{nome}`,
com limite de 15 MB e MIME types explicitamente permitidos. A leitura usa URL
assinada de 60 segundos, nunca persistida. O modelo generico descrito abaixo
continua sendo a direcao para anexos de Suprimentos e Financeiro.

## Principios

- Arquivos privados por padrao.
- Nunca usar public bucket para facilitar.
- Metadados relacionais obrigatorios.
- Arquivos podem estar vinculados a varios contextos.
- Timeline pode referenciar arquivo, mas nao deve ser o unico indice.
- Mobile e cenario primario.
- Nunca carregar todos os binarios ao abrir uma loja.

## Supabase Storage

Buckets sugeridos:

- `private-documents`: PDFs, notas, contratos, comprovantes.
- `private-images`: fotos e evidencias.
- `private-thumbnails`: miniaturas derivadas.
- `temporary-uploads`: uploads temporarios antes de confirmacao, se necessario.

Todos privados.

## Paths

Padrao sugerido:

```text
lojas/{loja_id}/{module}/{entity_type}/{entity_id}/{arquivo_id}/original
lojas/{loja_id}/{module}/{entity_type}/{entity_id}/{arquivo_id}/thumb.webp
```

Exemplos:

- `lojas/{loja_id}/implantacao/atividade/{atividade_id}/{arquivo_id}/original`
- `lojas/{loja_id}/financeiro/despesa/{despesa_id}/{arquivo_id}/original`
- `lojas/{loja_id}/suprimentos/proposta/{proposta_id}/{arquivo_id}/original`

Storage path nao deve ser autoridade de permissao. A autoridade vem de metadados + RLS.

## Metadados relacionais

Tabela `arquivos`:

- `id`
- `bucket`
- `storage_path`
- `nome_original`
- `mime_type`
- `tamanho_bytes`
- `checksum`
- `categoria`
- `uploaded_by`
- `created_at`
- `removed_at`
- `removed_by`
- `motivo_remocao`

Tabela `arquivo_vinculos`:

- `id`
- `arquivo_id`
- `loja_id`
- `modulo`
- `entidade_tipo`
- `entidade_id`
- `contexto`
- `evidencia`
- `created_at`

## Contextos suportados

- loja;
- atividade de implantacao;
- checklist;
- compra;
- despesa;
- nota fiscal;
- reembolso;
- cotacao;
- proposta;
- pagamento;
- entrega;
- outro registro autorizado.

## Upload

Fluxo recomendado:

1. Frontend valida tamanho e MIME type.
2. Se imagem, comprime no cliente quando adequado.
3. Upload para bucket privado.
4. RPC registra metadados, vinculo e auditoria.
5. Funcao opcional gera thumbnail/preview.
6. UI atualiza lista de anexos.

Variacao segura:

- para uploads sensiveis, solicitar signed upload URL via funcao.

## MIME types e limites

Sugestao inicial:

- imagens: JPEG, PNG, WebP, HEIC quando suportado;
- documentos: PDF;
- planilhas/documentos: XLSX, DOCX apenas se houver necessidade operacional.

Limites iniciais:

- imagem original: ate 8 MB;
- documento: ate 15 MB;
- thumbnail: ate 300 KB;
- rejeitar executaveis e arquivos compactados por padrao.

Valores devem ser confirmados antes da implementacao.

## Thumbnails e previews

Imagens:

- gerar thumbnail WebP;
- preservar original;
- carregar thumb na lista;
- abrir original sob demanda com signed URL.

PDF:

- listar metadados;
- preview sob demanda;
- nao renderizar todos os PDFs automaticamente.

Outros documentos:

- exibir nome, tipo, tamanho e acao de download/abrir.

## Performance

Obrigatorio:

- paginacao de anexos;
- lazy loading;
- thumbnails;
- signed URLs sob demanda;
- cache curto para previews;
- nao carregar binario completo em listagem;
- filtros por categoria/contexto.

Atelie Lica Festas: a referencia acessivel continha apenas PNGs grandes, reforcando que imagens reais podem ser pesadas.

## Segurança

RLS em `arquivos` e `arquivo_vinculos`.

Policies de Storage devem validar:

- usuario autenticado;
- arquivo privado;
- loja acessivel;
- permissao do modulo;
- permissao do registro vinculado.

Remocao:

- preferir remocao logica;
- manter metadados;
- opcionalmente mover objeto para area de retencao futura;
- auditar motivo.

## Signed URLs

Usar URLs assinadas:

- curta expiracao;
- geradas apenas para usuario autorizado;
- nao persistir em banco;
- renovar sob demanda.

## Mobile

Requisitos:

- botao de upload facil em atividade/loja/despesa;
- preview rapido com thumbnail;
- mostrar progresso de upload;
- permitir cancelar;
- tratar conexao ruim;
- comprimir imagem antes do upload quando adequado;
- permitir adicionar observacao/categoria no mesmo fluxo.

## Auditoria

Auditar:

- upload;
- vinculo criado;
- download/visualizacao sensivel quando necessario;
- remocao logica;
- alteracao de categoria;
- falhas criticas de permissao.

Nao auditar:

- conteudo binario;
- CPF completo;
- URLs assinadas.

## Testes obrigatorios

- usuario sem loja nao lista arquivo da loja;
- usuario sem permissao de arquivos nao recebe signed URL;
- upload cria metadados e vinculo;
- falha apos upload sem metadados deve ser reconciliavel;
- remocao logica oculta arquivo;
- thumbnail e carregada sem original;
- MIME proibido e rejeitado;
- arquivo grande e rejeitado;
- mobile nao quebra layout com nomes longos.
