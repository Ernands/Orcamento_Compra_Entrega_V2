# Implanta 27 — Diagnóstico e plano de desempenho sistêmico
**Data:** 11/11/2026  
**Escopo:** Dashboard, Financeiro, Compras V2, Cotações, Obras e Serviços, Suprimentos, Lojas, Implantação e módulos administrativos.  
**Ambientes:** DEV/Preview para alterações; PROD somente leitura para diagnóstico.  
**Objetivo:** diminuir "Tente novamente", tempo de carregamento, consultas concorrentes e risco de saturação do PostgreSQL, preservando dados e permissões.

## Evidências observadas em produção
- Logs do Supabase PROD em uma janela móvel de ~24 horas: **333 respostas HTTP 500 e 147 respostas HTTP 504** no endpoint Data API; PostgreSQL registrou centenas de `statement timeout` (código `57014`). São fontes correlacionadas; não somar essas contagens como incidentes independentes.
- `supply_purchase_attachment_stores`: ~62,8% das requisições GET observadas responderam com HTTP 500/504; `supply_purchase_destinations`: ~39,8%; `supply_purchase_attachments`: ~44,7%; `supply_purchase_items`: ~41,1%. As taxas são da janela observada, não indicam disponibilidade histórica.
- `works_services`, `works_service_payments`, `supply_quotes` e suas tabelas principais tiveram 0 respostas HTTP 500/504 na amostra observada. Isso **não** prova ausência de gargalos futuros.
- `pg_stat_statements`: diversas consultas de compras concentram segundos de execução, com picos relevantes. Várias RLS executam `app.can_read_supply_purchase[_fast]`, `app.can_store`, `app.can_read_supply_purchase_for` por linha/loja. É preciso comparar os planos com identidade de usuário real, e testar estritamente escopo/autorização.
- Estatísticas do planejador em tabelas como `supply_purchase_stores` (estimativa ~5 versus 989 linhas reais) e `supply_purchase_destinations` (estimativa ~109 versus 1330 reais) podem distorcer o plano. Priorizar `ANALYZE` controlado e conferir seus efeitos.
- O sistema já possui paginação de 500 registros, introduzida/corrigida na PR #84 para evitar perda dos itens após 1000; **não reverter essa proteção**.

## Matriz de dependências e impactos
| Área | Código/telas | Leitura atual e principal risco |
| --- | --- | --- |
| Dashboard / Previsão Orçamentária | `budget-forecast-dashboard-page.tsx` | 7 carregadores, incluindo `listSupplyPurchasesV2()` com 14 coleções filhas; falha em uma chamada invalida o conjunto |
| Dashboard / Composição Financeira | `financial-composition-page.tsx` | 6 carregadores, dependência completa de compras, obras, orçamento e lojas |
| Dashboard / Reembolso | `managerial-reimbursement-page.tsx` | 7 carregadores, incluindo compras e obras integrais |
| Dashboard / Implantação e Suprimentos | `dashboard-page.tsx` | loaders próprios de implementação/suprimentos; revisar cardinalidade, filtro por status e cálculos agregados |
| Financeiro / Visão Geral | `finance-page.tsx` | 6 carregadores; depende de compras integrais |
| Financeiro / Pagamentos | `finance-payments-page.tsx` | 4 carregadores; depende de compras integrais e obras |
| Financeiro / Conciliação | `finance-account-reconciliation-page.tsx` | 6 carregadores; mistura dados de leitura operacional com lançamentos da conciliação |
| Financeiro / Conferência | `finance-document-audit-page.tsx` | leitura integral de compras + obras + lojas, válida apenas para conferência; deve ser paginada/segmentada de forma segura |
| Compras V2 | `supply-purchases-page.tsx` | `listSupplyPurchasesV2()`, 14 coleções paginadas; ainda carrega todos os documentos/itens/destinos ao abrir |
| Cotações | `supply-quotes-page.tsx` | 7 carregadores (cotações, itens, necessidades, fornecedores, lojas, frete e anexos); sucesso HTTP atual, mas risco de escala |
| Obras e Serviços | `works-page.tsx` | 2 carregadores; `listWorkServices()` reúne 4 coleções completas |
| Lojas, Implantação, Suprimentos e Administração | rotas em `src/app/app.tsx` | mapear chamadas por rota, payload, tempo p50/p95, contagem e componentes compartilhados |

## Etapas da otimização
### Fase A — Menor risco, melhoria global (Preview #85)
1. **Code splitting de 29 rotas protegidas** com `React.lazy` e `Suspense`; reduz bundle inicial sem mudar valores, RLS ou dados. A tela de login permanece eager, e o menu permanece durante o carregamento.
2. Validar CI: testes, lint, TypeScript, build e Netlify Preview.
3. Instrumentar medições controladas e estabelecer linha-base (requisições por abertura de tela, bytes, p50/p95, timeout e erros por endpoint), sem gravar informações sensíveis de usuário.

### Fase B — Prioridade máxima no banco (DEV antes de PROD)
1. Atualizar estatísticas com `ANALYZE` **na janela controlada** e comparar `EXPLAIN (ANALYZE, BUFFERS)` em DEV para as consultas críticas. Não habilitar `pgrst.db_plan_enabled` em PROD.
2. Analisar RLS e seus planos de execução com usuários de permissões distintas, inclusive permissões restritas à loja, negação explícita, documentos, auditoria, financeiro e contas.
3. Otimizar índices/comportamento das políticas sem elevar privilégios; confirmar com suíte de autorização antes de migração. Preferir views `security_invoker=true` e manter RLS quando aplicável. Evitar `SECURITY DEFINER` exposto.
4. Reavaliar concorrência do cliente após otimização no banco. Não resolver `57014` apenas elevando timeout.

### Fase C — Contratos de leitura por módulo (Preview subsequente da #85)
1. Compras: endpoint/listagem resumida paginada com `count` e filtros no servidor, detalhes, pagamentos e documentos **on demand**; manter 100% dos dados no detalhe e no ajuste.
2. Financeiro: leituras específicas de pagamentos/conciliacão/composição, em vez de reconstituir todas as compras em todas as telas.
3. Dashboard: agregados por loja/UF/status no banco com atualização/invalidação adequada após transações; evitar recalcular todos os históricos em cada acesso.
4. Cotações e Obras: paginação no servidor, consultas por necessidade da aba, carregar anexos apenas ao abrir o detalhe.
5. Lojas e demais módulos: implementar a mesma política de paginação, filtros e métricas de latência.
6. Compartilhar cache **apenas de dados não sensíveis e com escopo de sessão**, invalidando após qualquer edição; evitar cache desatualizado de valor, reembolso, status ou documento.
7. Isolar falhas por seção e manter dados válidos já carregados sem mascarar erros. Desabilitar tempestades de retry; aplicar backoff e limite para GET somente. Nunca repetir automaticamente escritas financeiras sem idempotência.

### Fase D — Testes e critérios de liberação
- Nenhuma alteração nos registros contábeis, compras, documentos e pagamentos; valores totais e vínculos devem bater antes/depois, inclusive CMP-00097 e CMP-00038.
- Não perder itens acima do limite 1000, nem restringir indevidamente documentos, relatórios completos ou Excel/ZIP.
- Testar todos os perfis: administrador, leitura, restrição por loja, usuários com negações, módulos ocultos e auditoria.
- Conferir listagens, detalhamentos, filtros, downloads, pagamentos parciais, estornos, reembolsos, conciliação e fechamento.
- Metas propostas (a validar com baseline): nenhum timeout nos fluxos principais, erro HTTP 5xx < 1% dos GET de aplicação e p95 < 3 s de consultas de listagem. Separar métricas de backend, carregamento da página e renderização.
- Publicar somente após CI + testes de regressão em DEV e aprovação explícita; em caso de regressão, rollback do frontend e, para DDL futura, migrações reversíveis/testadas.

## Segurança e delimitação
- Nesta fase não houve SQL de escrita/DDL em PROD, alteração de permissão, migração, atualização de pagamentos, comprovantes ou exclusão de dados.
- A Preview #85 não significa que os timeouts já tenham sido eliminados: a causa principal está no custo das consultas/RLS e precisa da Fase B/C.
- Fontes: código da branch `main` e ferramentas de diagnóstico Supabase no dia 11/11/2026.
