# V2 Pacote de Implantacao

Status: implementado localmente em 2026-08-16.

## Escopo entregue

- CRUD administrativo de Lojas com codigo automatico `LOJ-XXX`;
- workspace da Loja com exatamente Implantacao, Resumo e Necessidades, e Anexos;
- Checklist Mestre versionado, clonavel e publicavel;
- snapshot imutavel do checklist ao iniciar uma Loja;
- acompanhamento, progresso calculado e Pendencias consolidadas;
- Necessidades MVP preparadas para o futuro fluxo de Suprimentos;
- anexos em Supabase Storage privado;
- capabilities, RLS, auditoria e testes correspondentes.

## Modelo relacional

`checklist_master_versions` identifica drafts, versoes publicadas e arquivadas.
Somente draft aceita alteracao estrutural. A publicacao arquiva a versao
publicada anterior, mas nao remove nem altera seu conteudo.

`checklist_master_items` guarda atividades ordenadas, categoria, obrigatoriedade,
offset da inauguracao, orientacao, tipo de responsavel, evidencia e prioridade.

`store_implementations` vincula uma loja a uma versao publicada. Existe no
maximo uma implantacao ativa por loja.

`store_implementation_items` copia os campos operacionais do modelo. Prazo,
responsavel, status e observacao continuam editaveis; titulo, descricao,
categoria e demais campos snapshot nao dependem de alteracoes futuras no Mestre.

`store_needs` guarda necessidades manuais ou originadas de atividade. Quantidade
e positiva; prioridade e status usam conjuntos controlados.

`store_attachments` guarda somente metadados e o path privado. Remocao e logica.
Nenhum binario ou signed URL e persistido no PostgreSQL.

## Workflows transacionais

- `create_checklist_version`: cria draft e opcionalmente clona uma versao;
- `publish_checklist_version`: valida itens, publica e arquiva a anterior;
- `start_store_implementation`: valida loja/versao e gera o snapshot atomico;
- `update_store_implementation_item`: atualiza atividade e conclui a implantacao quando aplicavel;
- `register_store_attachment`: registra metadados apos o upload privado;
- `delete_store_attachment`: executa remocao logica e devolve o path para limpeza do objeto.

Todas as RPCs sao `security definer`, fixam `search_path`, validam capability e
escopo de loja e registram auditoria quando a operacao e relevante.

## Progresso e atraso

Percentuais nao sao armazenados. A UI calcula total, concluidas, em andamento,
pendentes, bloqueadas, atrasadas e percentual. `not_applicable` nao compoe o
denominador. Uma atividade e atrasada quando possui prazo anterior a data atual
e ainda nao foi concluida.

## Data prevista de inauguração

`store_implementations.base_date` representa a data prevista de inauguração da
loja. A data-alvo de cada atividade do snapshot segue a fórmula:

`Data prevista de inauguração + Offset da atividade = Data-alvo da atividade`

Exemplo: `25/09/2026 + (-30 dias) = 26/08/2026`. Offset negativo indica uma
atividade anterior à inauguração, `0` indica o próprio dia e offset positivo
indica uma atividade posterior.

O Checklist Mestre define o modelo e os offsets. Ele não armazena o status nem
o percentual de conclusão de uma loja, e também não persiste uma data-alvo
específica por loja. Esses dados pertencem à execução em
`store_implementations` e `store_implementation_items`; o percentual é calculado
pela interface.

## Autorizacao

Administrador possui as 19 capabilities atuais e acesso global. Prospector
recebe operacao de Implantacao, Necessidades e Anexos somente em lojas de
`usuario_lojas`. Consulta recebe apenas leitura nesses mesmos modulos. Anonimo
nao recebe grants de tabelas ou RPCs de negocio.

RLS e a autoridade. A interface usa capabilities apenas para navegacao e
visibilidade de comandos.

## Storage

Bucket: `store-attachments`, privado, limite de 15 MB.

Tipos aceitos: PDF, JPEG, PNG, WebP, DOCX e XLSX. Policies de `storage.objects`
extraem o UUID da loja do path e chamam `app.can_store`. A interface gera signed
URL de 60 segundos somente ao abrir o documento.

## Auditoria

Sao registrados, entre outros: criacao/edicao de loja, criacao/edicao/publicacao
de versao, alteracoes de itens draft, inicio/conclusao da implantacao, atualizacao
de atividade, criacao/edicao de necessidade e upload/remocao de anexo.

## Rotas

- `/lojas`;
- `/lojas/:id/implantacao`;
- `/lojas/:id/resumo-necessidades`;
- `/lojas/:id/anexos`;
- `/implantacao/pendencias`;
- `/implantacao/checklist-mestre`.

## Limites desta entrega

Nao foram implementados fornecedores, cotacoes, aprovacoes, compras, entregas,
recebimento ou Financeiro. Anexos genericos por entidade, evidencias por
atividade, thumbnails, timeline funcional e cancelamento/reabertura de uma
implantacao permanecem evolucoes planejadas.
