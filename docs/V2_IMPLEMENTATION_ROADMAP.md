# V2 Implementation Roadmap

Status: Fase 1 concluida; pacote integrado antecipou entregas das Fases 2 a 5.

O pacote atual conclui CRUD de Lojas, Checklist Mestre versionado, Implantacao
por snapshot, Pendencias, Necessidades MVP e Anexos privados por loja. Dashboard
geral, timeline detalhada, bloqueios historicos, evidencias por atividade e o
fluxo de Suprimentos permanecem nas proximas rodadas.

## Fase 0 - Fundacao

Objetivo:

- criar base tecnica V2 sem regras complexas.

Banco:

- configurar Supabase local/DEV;
- estrutura de migrations;
- seed minimo.

Backend/functions:

- nenhum fluxo operacional;
- preparar convencoes de RPC e auditoria.

Frontend:

- Vite + React + TypeScript;
- shell basico;
- tema inicial inspirado no legado;
- roteamento;
- estados de loading/erro.

Testes:

- build;
- lint/typecheck;
- teste inicial de render;
- CI.

Aceite:

- app abre local;
- deploy preview Netlify configurado;
- nenhuma secret versionada.

## Fase 1 - Auth, Acessos e RLS

Objetivo:

- resolver o maior risco: CPF + senha, usuarios, perfis, permissoes e loja.

Banco:

- usuarios;
- perfis;
- permissoes;
- perfil_permissoes;
- usuario_permissoes;
- lojas;
- usuario_lojas;
- audit_logs;
- RLS inicial.

Backend/functions:

- login CPF;
- criar usuario;
- reset de senha admin;
- capabilities;
- funcoes SQL `can`/`can_store`.

Frontend:

- login CPF;
- logout;
- Administracao > Acessos MVP;
- menu filtrado por capabilities.

Testes:

- CPF;
- login;
- RLS;
- usuario sem loja nao acessa loja;
- consulta nao escreve;
- logs sem CPF completo.

Aceite:

- usuario autenticado ve apenas o permitido;
- admin gerencia acesso minimo;
- Prospector nao ve Suprimentos por padrao.

## Fase 2 - Dashboard e Lojas

Objetivo:

- entregar navegacao util com dados de lojas e dashboard principal.

Banco:

- completar lojas;
- responsaveis;
- campos de status e datas.

Backend/functions:

- CRUD simples via RLS;
- RPC somente se houver alteracao composta.

Frontend:

- Dashboard principal;
- visao por UF;
- visao por responsavel;
- listagem de lojas;
- detalhe de loja abrindo em Implantacao, ainda com placeholders controlados se modulo nao estiver completo.

Testes:

- responsivo desktop/mobile;
- RLS por loja;
- filtros.

Aceite:

- dashboard rapido;
- mobile usavel;
- usuario ve apenas lojas permitidas.

## Fase 3 - Checklist Mestre e Implantacao

Objetivo:

- implementar nucleo operacional de implantacao.

Banco:

- checklist_modelos;
- checklist_fases;
- checklist_atividades;
- checklist_evidencia_regras;
- implantacoes;
- implantacao_atividades;
- atualizacoes;
- bloqueios.

Backend/functions:

- publicar checklist mestre;
- iniciar implantacao;
- atualizar atividade;
- bloquear/desbloquear;
- reprogramar inauguracao;
- timeline.

Frontend:

- loja > Implantacao;
- checklists;
- pendencias;
- Checklist Mestre admin;
- timeline.

Testes:

- transicoes;
- progresso;
- snapshot;
- transacoes;
- idempotencia;
- RLS por loja.

Aceite:

- iniciar loja cria atividades em transacao;
- checklist publicado nao altera ciclos antigos;
- bloqueio/timeline/auditoria consistentes.

## Fase 4 - Arquivos e Anexos

Objetivo:

- anexos privados e mobile-first para loja/atividade.

Banco:

- arquivos;
- arquivo_vinculos;
- policies Storage.

Backend/functions:

- signed URLs;
- registro de metadados;
- thumbnails/previews quando necessario.

Frontend:

- loja > Anexos;
- anexos em atividade;
- upload mobile com progresso;
- preview sob demanda.

Testes:

- RLS storage;
- arquivo de loja negada;
- MIME/limite;
- lazy loading.

Aceite:

- anexos nao carregam binario em massa;
- usuario sem permissao nao acessa arquivo.

## Fase 5 - Itens e Necessidades

Objetivo:

- criar experiencia unica de suprimentos base.

Banco:

- itens;
- necessidades_loja;
- status e constraints.

Backend/functions:

- CRUD simples via RLS;
- operacoes em lote via RPC se necessario.

Frontend:

- Suprimentos > Itens e Necessidades;
- visao por item;
- lojas/quantidades;
- pendencias de definicao.

Testes:

- totais;
- filtros;
- RLS por loja;
- status.

Aceite:

- usuario entende item + necessidades em uma unica experiencia.

## Fase 6 - Cotacoes e Propostas

Objetivo:

- propostas agrupadas relacionais.

Banco:

- fornecedores;
- cotacoes;
- propostas;
- proposta_itens;
- aprovacoes inicial.

Backend/functions:

- criar proposta agrupada;
- editar/reabrir;
- selecionar;
- excluir logico;
- comparar escopos.

Frontend:

- Cotacoes;
- fornecedores;
- comparacao;
- selecao.

Testes:

- totais derivados;
- escopo equivalente;
- conflitos;
- idempotencia;
- RLS.

Aceite:

- frontend nao envia quantidade como autoridade;
- proposta selecionada atualiza escopo corretamente.

## Fase 7 - Compras e Entregas

Objetivo:

- transformar proposta/aprovacao em compra e acompanhar entrega.

Banco:

- compras;
- compra_itens;
- entregas;

Backend/functions:

- criar compra de proposta;
- atualizar entrega;
- conferir entrega.

Frontend:

- Compras;
- detalhe de compra;
- entregas por loja.

Testes:

- transacao proposta -> compra;
- loja/item;
- status.

Aceite:

- compra preserva vinculo com proposta, lojas e itens.

## Fase 8 - Financeiro

Objetivo:

- controlar custos, pagamentos e reembolsos.

Banco:

- despesas;
- pagamentos;
- reembolsos;
- reembolso_itens;
- documentos financeiros.

Backend/functions:

- registrar pagamento;
- solicitar reembolso;
- registrar aprovacao/recebimento;
- conciliacao.

Frontend:

- Financeiro > Visao Geral;
- Por Loja;
- Reembolsos;
- Documentos;
- Pendencias.

Testes:

- permissoes financeiras;
- valores;
- idempotencia;
- documentos obrigatorios;
- RLS por loja.

Aceite:

- usuario sem financeiro nao ve valores;
- reembolso rastreavel do pedido ao recebimento.

## Fase 9 - Migracao e corte

Objetivo:

- carregar dados atuais com reconciliacao.

Banco:

- scripts de carga;
- staging;
- validacoes.

Backend/functions:

- sem novas funcoes operacionais, salvo ferramentas internas controladas.

Frontend:

- smoke tests das telas reais.

Testes:

- contagens;
- FKs;
- status;
- totais;
- IDs legados.

Aceite:

- 27 lojas reconciliadas;
- necessidades reconciliadas;
- cotacoes/propostas e implantacoes validadas;
- usuarios iniciais prontos.

## Ordem recomendada

Fase 0 -> Fase 1 -> Fase 2 -> Fase 3 -> Fase 4 -> Fase 5 -> Fase 6 -> Fase 7 -> Fase 8 -> Fase 9.

Motivo:

- Auth/RLS vem antes de qualquer dado sensivel.
- Dashboard/Lojas dão navegação e escopo.
- Implantacao e prioridade funcional e depende de lojas.
- Arquivos devem entrar antes de evidencias/financeiro ficarem pesados.
- Suprimentos/Cotacoes/Compras constroem o fluxo financeiro.
- Financeiro depende de compras, documentos e lojas.
- Migracao final vem depois de modelo validado.
