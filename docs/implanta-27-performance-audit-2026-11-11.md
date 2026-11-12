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


## Execução da Fase B em DEV — 11/11/2026

### Mudanças aplicadas exclusivamente em DEV
- Atualizadas as estatísticas das 59 tabelas públicas com `ANALYZE`.
- Removida a camada customizada de retry do cliente Supabase. O cliente passa a usar o retry nativo do SDK, sem repetir automaticamente respostas 500/504.
- Adicionadas as migrations:
  - `20261111194525_cache_purchase_read_scope_initplan.sql`
  - `20261111194748_optimize_purchase_permission_matrix_set_based.sql`
  - `20261111194929_cache_purchase_store_permission_scope.sql`
  - `20261111200028_fixed_store_permission_scope_helpers.sql`
- As políticas de leitura de Compras e seus filhos agora calculam o escopo de compras/lojas uma vez por statement (InitPlan), em vez de reexecutar verificações completas de permissão por linha.
- O escopo de anexos é separado do escopo de compras. Acesso de documentos e pagamentos consolidados não concede leitura do registro de compra.
- O caminho de auditoria continua exigindo `finance.view` + `finance.document_audit_view`; políticas de vínculos por loja continuam store-scoped.

### Validação funcional e de segurança
- **43 verificações pgTAP** do arquivo `supabase/tests/purchase_read_scope_cache.test.sql` aprovadas em DEV.
- Comparação com as funções de autorização anteriores: 3 usuários ativos × 6 compras, sem divergência nos escopos de Compras, Anexos ou Auditoria.
- Comparação do escopo de lojas com `app.can_store_any`: 3 usuários × 3 lojas × 4 conjuntos de permissões, sem divergências.
- Testes em transações revertidas cobriram concessão limitada a uma loja, permissão global de documentos, negação por loja e compras multiloja. O usuário com apenas concessão escopada de `purchases.view` continuou sem acesso ao registro da compra.
- Nenhuma concessão, negação ou dado de teste permaneceu gravado; os testes transacionais terminaram com `ROLLBACK`.

### Medições de plano em DEV
As medições abaixo usam `EXPLAIN (ANALYZE, BUFFERS)` com usuário autenticado e os dados reduzidos existentes em DEV (3 lojas, 6 compras). Os valores finais são a mediana de três execuções consecutivas após as quatro migrations; a primeira execução variou mais por aquecimento. Servem para comparar o plano local, não para projetar diretamente a latência de PROD.

| Consulta | Medição anterior observada | Medição final em DEV | Variação |
| --- | ---: | ---: | ---: |
| `supply_purchase_stores` | 34,65 ms | 14,12 ms | -59% |
| `supply_purchase_order_line_stores` | 60,49 ms após a primeira otimização de escopo | 16,28 ms | -73% |
| `supply_purchase_attachment_stores` | 22,57 ms após a primeira otimização de escopo | 11,88 ms | -47% |

Os planos confirmam a redução de avaliações repetidas de RLS por linha. Ainda é necessário validar com volume representativo e medir novamente após os carregadores por módulo.

### Limites desta entrega
- Esta etapa trata o gargalo compartilhado de autorização das tabelas de Compras que também alimentam Financeiro, Dashboard, Reembolso e Conferência.
- Cotações e Obras e Serviços não apresentaram HTTP 500/504 nos endpoints observados, mas seus repositórios ainda têm consultas integrais que serão tratadas na fase de carregamento seletivo/paginação.
- As agregações dos Dashboards de Implantação e Suprimentos foram entregues nesta fase; indicadores financeiros, paginação visual e anexos sob demanda permanecem como trabalho seguinte.
- **PROD não foi alterado.** As migrations foram aplicadas somente ao projeto DEV; nenhuma migration foi aplicada ao projeto de produção.


## Primeira entrega da Fase C — carregadores por módulo

Além da otimização compartilhada de RLS, a Preview #85 passou a restringir as consultas filhas aos registros-pai que a tela realmente carregou:

- **Obras e Serviços:** lista de serviços com paginação estável; pagamentos, documentos e componentes são buscados por `service_id`, em lotes de até 100 IDs e páginas de 500.
- **Cotações:** cotações paginadas; lojas e itens por `quote_id`; destinos por `quote_item_id`; vínculos por `quote_destination_id`; catálogo, necessidades e lojas somente pelos IDs referenciados.
- **Fornecedores:** fornecedores paginados; canais e datas de cotação filtrados pelos fornecedores visíveis.
- **Catálogo e Necessidades:** itens e necessidades paginados; lojas somente para as necessidades retornadas.
- **Detalhe do item:** necessidades e usos em cotações filtrados pelo próprio `supply_item_id`, sem carregar a lista completa de necessidades para depois descartá-la no navegador.
- Novo utilitário `fetchAllPagesForIds`: deduplica IDs, consulta lotes sequenciais de até 100 IDs e pagina cada lote, evitando URLs excessivas e rajadas de requisições.

Foram adicionados testes unitários para paginação por IDs, deduplicação, lotes, páginas, listas vazias e validação do tamanho de lote.

### Segunda entrega da Fase C — agregação do Dashboard de Implantação

- Migration `20261111202109_dashboard_implementation_store_metrics.sql` aplicada exclusivamente em DEV.
- Criada a função `public.dashboard_implementation_store_metrics_v1(p_today date)`, SQL `STABLE SECURITY INVOKER`, com `search_path` vazio e permissões de execução restritas a `authenticated`. Não usa `SECURITY DEFINER`.
- A consulta agrega no PostgreSQL a implantação mais recente por loja, progresso, pendências, atrasos, atividades críticas e próximo vencimento. A data é recebida do cliente para manter o mesmo calendário local da tela.
- O frontend deixou de buscar as coleções completas de `store_implementations` e `store_implementation_items` e passou a consumir uma única RPC com uma linha por loja visível. As consolidações por UF e responsável continuam no cliente, mas operam sobre esse conjunto reduzido.
- Teste unitário compara o resultado do novo agregador de linhas com o cálculo anterior e exige igualdade dos indicadores apresentados.
- **5 verificações pgTAP** adicionadas: existência, execução como invoker, permissão para autenticados, bloqueio para anon e respeito à RLS. A verificação de usuário sem vínculo/permissão retornou zero lojas.
- Teste de três usuários ativos de DEV: a função retornou as mesmas 3 lojas visíveis por RLS. No conjunto reduzido de DEV, as 1 implantação + 30 atividades deixam de ser transferidas ao navegador; a RPC retorna 3 linhas agregadas.
- `EXPLAIN (ANALYZE, BUFFERS)` sob usuário autenticado: 19,21–19,71 ms nas três execuções (mediana 19,56 ms; 2.569 buffers hit). O volume de DEV é pequeno e não havia baseline equivalente; portanto, esse número não é apresentado como redução de tempo, e sim como referência inicial do novo caminho.
- Os advisors não apontaram a nova função como `SECURITY DEFINER`; alertas existentes em outras funções e políticas não foram alterados nesta etapa.

### Terceira entrega da Fase C — Dashboard de Suprimentos e InitPlans

- Migration `20261111202641_dashboard_supply_metrics.sql` aplicada exclusivamente em DEV; criada a RPC `public.dashboard_supply_metrics_v1(p_today date)`, `STABLE SECURITY INVOKER`, `search_path` vazio e execução restrita a `authenticated`.
- A RPC calcula no banco contagens de itens ativos, necessidades abertas/não vinculadas, fornecedores ativos, cotações totais/recebidas/comparáveis e os cinco agrupamentos do dashboard. A ordenação e o limite de seis linhas continuam aplicados no cliente, preservando o mesmo critério de desempate em português.
- O frontend deixou de chamar `listSupplyItems()`, `listSupplyNeeds()`, `listSupplyQuotes()` e a contagem separada de fornecedores para montar o Dashboard. A RPC não carrega destinos e lojas de destino das linhas de cotação, dados que `listSupplyQuotes()` buscava mas o Dashboard não utiliza.
- No DEV, o caminho anterior consultava 106 linhas distribuídas entre itens, necessidades, cotações, lojas/itens de cotação, destinos e lojas de destino; o novo contrato retorna uma linha agregada com os indicadores e agrupamentos. Em PROD, a inspeção anterior encontrou 1.813 destinos de itens de cotação, que deixam de ser transferidos para esta tela.
- A função respeita a RLS de `supply_items`, `store_needs`, `suppliers`, `supply_quotes`, `supply_quote_stores`, `supply_quote_items` e `lojas`. Três usuários ativos tiveram os sete indicadores de contagem iguais aos SELECTs diretos sob RLS; usuário sem vínculo/permissão recebeu todos os indicadores zerados.
- **5 verificações pgTAP** da RPC e **4 verificações pgTAP** da política de leitura do catálogo/fornecedores adicionadas. O teste unitário compara o novo mapeamento agregado com o resultado do cálculo anterior.
- Migration `20261111203131_optimize_supply_catalog_read_policy_initplan.sql`: as capacidades constantes de leitura de catálogo e fornecedores passaram a ser avaliadas por InitPlan, uma vez por statement, em vez de repetir `app.can(...)` por linha. Os planos mostram InitPlans e os totais visíveis permaneceram 53 itens e 1 fornecedor para os usuários ativos testados; usuário sem permissão continuou vendo zero.
- Medição em DEV para a leitura de itens ativos: **36,82 ms → 3,60 ms** (aprox. -90%). Para a RPC completa do Dashboard de Suprimentos, mediana de três execuções: **132,33 ms → 98,11 ms** (aprox. -26%), após a otimização de InitPlan. Os dados de DEV são reduzidos; não extrapolar diretamente para PROD.

### Próxima parte da Fase C
- Agregações SQL dos indicadores financeiros, sem reconstruir todos os registros operacionais no cliente.
- Paginação visual no servidor nas tabelas com grande volume, mantendo filtros e totais.
- Carregamento por aba e anexos sob demanda em Pagamentos, Conciliação, Cotações e Obras.
- Revisão das leituras de lojas, implantação e administração que ainda carregam coleções completas.


### Evidência de limite de 1.000 registros em PROD
A consulta de contagem em produção encontrou **1.001 registros em `works_service_documents`**. O carregador antigo consultava essa coleção sem paginação e poderia retornar no máximo 1.000 registros. A nova implementação pagina os documentos e restringe a consulta aos `service_id` carregados, evitando a omissão do registro excedente. Também foram verificados os índices existentes que suportam os filtros por `service_id`, `quote_id`, `quote_item_id` e `quote_destination_id`; não foi necessário criar índices redundantes nesta etapa.


### CI e Preview (histórico)
- Os testes de 11/11 concluídos antes das novas alterações de Financeiro não certificam a revisão atual; acompanhar o workflow Quality do commit mais recente.
- Deploy Preview #85: https://deploy-preview-85--implanta-27.netlify.app/.
- PR #85 continua em rascunho; sem autorização para merge ou deploy de produção.

## Continuação da Fase C — Financeiro, 12/11/2026

### Conciliação — redução de carregamento
- `FinanceAccountReconciliationPage` passou a chamar `listSupplyPurchasesV2({ includeAttachments: false })` e `listWorkServices({ includeDocuments: false, includeComponents: false })`.
- As funções de montagem de eventos financeiros `buildUnifiedFinancePayments`, `financePaymentOccurrences`, `buildFinanceAccountDaySummaries` e `buildFinanceAccountConsolidated` permanecem **inalteradas**. Seus insumos de valores, parcelas, rateios por loja, datas, ocorrências e status continuam completos.
- Anexos de lançamentos manuais da conta permanecem disponíveis através do repositório específico de Conciliação, respeitando o escopo dos registros visíveis por RLS.
- Os caminhos de Pagamentos, Reembolso e Conferência **não** foram alterados para o modo sem documentos: seguem carregando notas/recibos/comprovantes necessários para status fiscal e reembolso.
- Contagem somente de inventário em PROD (sem escrita): `works_service_documents` = 1.002, `works_service_components` = 44, anexos ativos de Compras = 647, vínculos de anexos a lojas = 1.078. O novo caminho de Conciliação evita solicitar essas coleções de anexos/componentes, reduzindo até 2.771 linhas potenciais de leitura, além dos anexos de Cotações. O número efetivamente visível depende de RLS; **não** é uma medição de latência.

### Paginação e correção de integridade de leitura
- `listFinanceAccountDays`, `listFinanceAccountEntries` e `listSupplyPurchasePaymentOccurrencesV2` agora usam `fetchAllPages` com ordenação determinística por ID adicional. Evitam truncamento após 1.000 resultados.
- Anexos de lançamentos manuais são consultados por `entry_id` dos lançamentos visíveis, em lotes/páginas com `fetchAllPagesForIds`, em vez de uma consulta integral seguida de filtros quadráticos no navegador.
- Tabelas de **Financeiro > Pagamentos** e **Financeiro > Conciliação Conta** exibem até **50 linhas por página**. O conjunto original permanece em memória para indicadores, filtros, demonstrativos, exportações, detalhes e saldos globais. Os testes unitários verificam limites e navegação entre páginas.
- A paginação da **renderização** ainda é local, não paginação SQL do conjunto financeiro. Para trazer poucas linhas do banco, é necessário construir um read model consolidado no servidor sem perder as regras de rateio, reembolso e ocorrências.

### Isolamento da Deploy Preview
- Adicionada verificação em tempo de execução na URL padrão `deploy-preview-N--implanta-27.netlify.app`: se `VITE_SUPABASE_URL` não for o hostname do Supabase DEV `wiynrfblfigngkvleyqg.supabase.co`, a aplicação lança erro antes de criar o cliente Supabase.
- Testes automatizados cobrem DEV permitido, PROD bloqueado na Preview e não interferência nas URLs de produção/local.
- **Limite:** a verificação não comprova como as variáveis estão configuradas no painel Netlify nem cobre eventuais domínios alternativos; ainda é necessário conferir presencialmente a configuração da Preview.

### Validação, riscos remanescentes e próximas etapas
- O CI inicial desta entrega encontrou quatro asserções de tipos redundantes em repositórios paginados e um teste visual acoplado à sintaxe da lista anterior. As correções foram feitas na branch; conferir conclusão de **Tests, Lint, Typecheck e Build** para o head mais recente antes da liberação.
- Contratos `as never` das novas RPCs dos Dashboards ainda precisam ser substituídos pela tipagem gerada do schema DEV, após reconciliar o histórico de migrations.
- Histórico remoto observado na revisão: DEV = 120 migrations, PROD = 111; 73 nomes comuns têm números de versão distintos. Não presumir que as histories são intercambiáveis. Comparar definições/efeitos e planejar a promoção de DDL sem aplicar novamente migrações já existentes em PROD.
- **Próxima etapa:** read model financeiro paginado no banco para Pagamentos/Conciliação, com filtros, contagem e totais globais reproduzíveis; agregações de Previsão Orçamentária, Composição Financeira e Reembolso; cenários RLS, conciliação e documentação financeira com massa representativa.
- **Nenhuma escrita em PROD ou dado financeiro foi realizada nesta entrega.** PR #85 segue em rascunho; não mesclar sem autorização.


### Continuação adicional — projeção de leitura financeira sem destinos de Compras

- \`listSupplyPurchasesV2\` agora aceita as opções opt-in \`includeDestinations\` e \`includeQuoteAttachments\`; o comportamento padrão permanece completo para Compras e demais módulos.
- **Financeiro > Pagamentos** chama \`listSupplyPurchasesV2({ includeDestinations: false, includeQuoteAttachments: false })\` e \`listWorkServices({ includeComponents: false })\`. Continua trazendo anexos das compras e documentos das obras para os estados fiscais, links e reembolsos.
- **Financeiro > Conciliação Conta** mantém o modo sem anexos, documentos ou componentes e também desativa destinos e anexos de cotação.
- As consultas dispensadas retornam seus campos aninhados como arrays vazios no objeto em memória; \`orders.lines.stores\`, pagamentos, ajustes e catálogo financeiro de itens permanecem inalterados. O domínio de cálculos financeiros não foi modificado.
- Um teste com compra multiloja simplificada \`CMP-00097\` confere, na mesma massa, a leitura operacional completa e a projeção financeira; as linhas/pagamentos e o resumo de valores devem permanecer idênticos. Também exige que o modo financeiro não dispare requisições às quatro tabelas não utilizadas (destinos, lojas de destino, anexos de cotação, e anexos da compra quando a opção já existente é falsa).
- Inventário **somente leitura de PROD** em 12/11: 1.330 registros de destinos de Compras, 1.330 vínculos destinos/lojas, 6 anexos ativos de cotações. **Potencial redução:** até 2.666 registros consultados/transferidos por abertura dessas telas para perfis com acesso a todos os dados; resultado real depende da RLS e do payload de cada tabela. São quantidades, não métricas de duração.
- **Não houve migration nova, escrita no banco, alteração de permissões nem qualquer atualização de PROD.**
- Próximo estágio: materializar um read model financeiro SQL com paginação/filtros/totais consistentes no servidor; exigir antes comparação exata com os cálculos em centavos (inclusive reembolsos, ajustes parciais e lançamentos de múltiplas lojas) e escopo RLS, para evitar regressões.


## Read model de fontes de pagamento — experimento controlado em DEV (12/11/2026)

### Escopo implementado
- Migration `20261112135448_finance_payment_sources_page_v1.sql`, aplicada **somente ao Supabase DEV**.
- RPC read-only `public.finance_payment_sources_page_v1(p_page, p_page_size, p_status, p_source, p_date_from, p_date_to, p_query)`, com `STABLE SECURITY INVOKER` e `search_path` restrito.
- Fontes: `supply_purchase_payments` + `supply_purchases` e `works_service_payments` + `works_services`, respeitando a RLS de todas as tabelas e exigindo `app.can('finance','payments_view')`.
- Paginação SQL estável por data decrescente, origem e ID de pagamento; até 100 registros por chamada, mais contagem total, somas **brutas das origens** e filtros por origem, situação, período e referência/prestador.
- Valores são transmitidos como inteiros de centavos em **string**, e convertidos para `bigint` no novo repositório `src/data/finance/finance-payment-sources-repository.ts`. Assinatura da função incluída na tipagem do Supabase, sem `as never`.
- Arquivo de 7 verificações pgTAP: `supabase/tests/finance_payment_sources_page.test.sql`. Testes unitários cobrem contrato RPC, conversão exata de centavos, propagação de falhas e parâmetros de filtros.

### Paridade de fontes e segurança (dados pequenos de DEV)
- Com perfil autenticado autorizado: contagem de origens não canceladas **16/16** (9 pagamentos de Compras + 7 pagamentos de Obras), de acordo com SELECTs sob o mesmo contexto RLS.
- Soma bruta de origem **2.359.270 centavos** = **R$ 23.592,70** tanto na RPC quanto nas consultas originais, sob o mesmo usuário.
- A página 1 e a página 2 de tamanho 1 devolvem IDs distintos, o parâmetro de tamanho 9.999 é limitado a 100, e os filtros por pagamentos de compras, período e referência foram testados.
- Dois perfis DEV com permissão financeira obtiveram a mesma contagem de 16; um terceiro sem `finance.payments_view` recebeu **0 registros**, 0 centavos e nenhum detalhe.
- `prosecdef=false`; `authenticated` pode executar, `anon` e `PUBLIC` não podem executar.
- A função não foi sinalizada como `SECURITY DEFINER` pelo advisor; existem avisos históricos em funções antigas, separados deste experimento.

### Limites deliberados — **NÃO substituir o financeiro oficial ainda**
- Esta é uma **API de fontes brutas**, não o read model completo nem a soma oficial das telas.
- Não expande parcelas, não cria saldos sem programação, não consolida pagamentos multi-CMP, não calcula rateios por loja, não incorpora ocorrências detalhadas por data e **não líquida créditos de reembolso**. Por exemplo, a soma bruta de R$ 23.592,70 não é apresentada como valor contábil do Financeiro.
- A interface de **Pagamentos, Conciliação, Reembolso e Dashboard Gerencial** permanece ligada à implementação financeira anterior; **não foi trocada pela RPC**.
- A consulta inicial validou apenas o conjunto DEV de pequeno volume; faltam cenários de dezenas de milhares de registros, perfis com concessões/negações por loja, estornos e ajustes parciais com datas reais.
- Para substituição gradual, a próxima etapa deve criar um **modelo completo de eventos e alocações** com equivalência linha a linha e centavo a centavo contra `buildUnifiedFinancePayments` e `decorateFinancePaymentsWithOccurrences`. Exigir também paginação sem perda de totais, filtros e relatório completo.
- Até a compatibilidade ser demonstrada, a RPC tem uso restrito ao repositório técnico e testes, evitando regressões nas telas.

### Segurança de implantação
- Migration adicional somente DEV; PROD não recebeu esta função. A PR #85 segue rascunho e não foi mesclada.
- O histórico de migrations DEV/PROD continua divergente e deverá ser reconciliado antes de qualquer promoção.
- Testes do GitHub Actions para a revisão de código com a nova RPC devem ser conferidos separadamente dos testes manuais do banco.

## Projeção paginada das Obras em DEV — 12/11/2026

### Implementação
- Nova RPC `public.finance_work_commitments_page_v1` somente no Supabase DEV, `STABLE SECURITY INVOKER`, respeitando RLS de `works_services` e `works_service_payments` + autorização `finance.payments_view`.
- Filtragem server-side por situação (`paid`, `planned`, `unscheduled`), lojas permitidas, período e pesquisa textual; paginação estável limitada a **100 registros por página**; devolve contagens e totais de todas as linhas do filtro, não apenas da página.
- A consulta espelha o domínio `workPaymentRows` em `src/domain/finance-payments.ts`: obras canceladas são ignoradas; pagamentos cancelados não entram no somatório; situações `overdue` integram `planned`; saldo sem programação = max(valor contratado - soma de pagamentos não cancelados, 0).
- Status pago usa `paid_at` em UTC; programado usa `due_date`; saldo sem programação não possui data. `store_id`, código e estado são os da obra, como no domínio.
- Importâncias transmitidas como strings de centavos (BigInt no TypeScript). O repositório `src/data/finance/finance-work-commitments-repository.ts` rejeita respostas inválidas e totais cuja soma dos status não coincide com o compromisso.
- A segunda migration `20261112142002_finance_work_commitments_label_fallback.sql` replica a regra de exibição do domínio para `source_label` e `installment_label` quando o valor estiver em branco. A migration anterior `20261112141704_finance_work_commitments_page_v1.sql` permanece registrada no histórico do DEV.
- Testes pgTAP em `supabase/tests/finance_work_commitments_page.test.sql` (9 verificações) e testes TypeScript em `src/tests/finance-work-commitments-repository.test.ts`, com massa sintética incluindo pagamento cancelado, adiantamento, parcela e saldo residual.

### Validação real em DEV (consulta sob sessão autenticada e RLS)
| Situação | Registros | Valor |
|---|---:|---:|
| Pago | 4 | R$ 8.800,00 |
| A pagar | 3 | R$ 9.600,00 |
| Sem programação | 2 | R$ 2.500,00 |
| **Compromisso** | **9** | **R$ 20.900,00** |

- 5 obras visíveis, 7 pagamentos não cancelados e 2 saldos não programados. Conferência de 7 eventos do banco por ID, valor exato em centavos, status, data e rótulo de origem: **0 divergências**.
- A busca pelas quatro páginas de 3 registros encontrou **9 IDs únicos / 9 registros**, sem perdas/duplicações.
- Testados filtros por `paid`, `planned`, `unscheduled`, código da obra, seleção vazia de lojas e tamanho de página; os totais respondem ao conjunto filtrado.
- Dois usuários autorizados no DEV obtiveram o mesmo resultado (RLS sobre os dados que podem ver). Usuário sem `finance.payments_view`: **0 linhas e R$ 0**.
- Verificado: `prosecdef = false`, função `STABLE`, sem `EXECUTE` para `anon`. Security Advisor não indicou essa função. Os demais alertas preexistentes do projeto não foram tratados neste estágio.

### Limites e próximos passos
- **Essa implementação é um recorte de paridade de Obras.** O modelo de Compras, sobretudo rateios de itens/lojas e os ajustes parciais de cancelamento e frete, ainda depende do domínio TypeScript original. Não somar a nova API ao Financeiro oficial sem remover duplas contagens.
- **Não há alteração nas telas oficiais de Pagamentos/Conciliação/Dashboards** nesta etapa; o repositório é preparatório para substituição gradual quando houver a projeção integral.
- A amostra do DEV é pequena: não há benchmark representativo de PROD nem homologação de todos os cenários de restrição de lojas, obras canceladas e pagamentos em atraso no ambiente real.
- Validar compras com parcelas, reembolso por item, consolidação CMP-00002/CMP-00003 e sobra sem programação contra `buildUnifiedFinancePayments` e `decorateFinancePaymentsWithOccurrences`; habilitar gradualmente apenas depois de paridade linha a linha, centavo a centavo.
- **Nenhuma mudança em PROD, nenhuma migration promovida e nenhuma PR mesclada**. O histórico de migrations continua divergente entre DEV e PROD; não executar `db push` automático.
- O GitHub Actions **ainda não publicou execução para os commits recentes** nesta verificação; os testes SQL foram executados em DEV, mas o novo código TypeScript aguarda CI. Não marcar como homologado sem a confirmação de testes, lint, typecheck e build.


## Fase de paridade — eventos de Compras (DEV, 12/11/2026)

### Projeção implementada
- Nova RPC read-only `public.finance_purchase_events_page_v1(p_page,p_page_size,p_status,p_date_from,p_date_to,p_query)`, aplicada **somente no DEV**, em duas migrations:
  - `20261112144333_finance_purchase_events_page_v1.sql`
  - `20261112144448_finance_purchase_events_keep_zero_paid.sql` (preserva pagamento realizado mesmo com valor zero, conforme o domínio).
- `SECURITY INVOKER`, `STABLE`, `search_path=''`, com autorização `finance.payments_view` e RLS de Compras, pagamentos e ajustes parciais. `authenticated` autorizado, `anon` e `PUBLIC` não autorizados. Avisos gerais do Security Advisor são preexistentes; nenhum indica a nova função.
- Paginação SQL com limite de 100 eventos por página, ordenação determinística e filtros de status, data e pesquisa por CMP, fornecedor e identificação de pagamento.
- Emula `buildFinancePaymentEvents` para compras sem ajuste: pagamento realizado (inclusive zero); entrada prevista; parcelas mensais; `entry_amount` limitado ao total; vencimento em meses curtos; distribuição de centavos por índice em ordem lexicográfica (para respeitar o desempate atual do domínio).
- Compras com `supply_purchase_partial_adjustments` e pagamentos com mais de 120 parcelas são **excluídos e contabilizados** como não suportados. A RPC retorna `unsupported_purchase_count`, `unsupported_payment_count` e `is_complete=false`.
- `src/data/finance/finance-purchase-events-repository.ts` falha **por padrão** quando houver exclusões. O parâmetro `allowIncomplete` existe apenas para diagnóstico, sem uso nas telas. Exibição oficial permanece no domínio anterior.
- `src/domain/finance-purchase-event-parity.ts`: valida somente um conjunto **completo de páginas**, confrontando ID, compra, ordem, data, método, etiqueta, status, valores em `bigint` e totais com `buildFinancePaymentEvents`. Recusa duplicações, centavos divergentes, qualquer evento faltante ou indicador de incompletude.
- Testes: `src/tests/finance-purchase-events-repository.test.ts`; novos casos de paridade em `src/tests/finance-payments.test.ts`; `supabase/tests/finance_purchase_events_page.test.sql` (9 verificações pgTAP).

### Comparações executadas no DEV
- Usuário autenticado autorizado: **9 pagamentos pagos**, `519270` centavos = **R$ 5.192,70**. Contagem e valor idênticos aos pagamentos visíveis por SELECT direto com o mesmo usuário/RLS; **0 divergências** por ID, código CMP, fornecedor, data, valor e vínculo de pedido.
- Paginação com tamanho de 3: **3+3+3+0 = 9 registros**, **9 IDs distintos**.
- Dois perfis DEV com acesso Financeiro: mesma paridade na amostra. Perfil sem `finance.payments_view`: 0 eventos e 0 valores.
- Sem registros atuais de pagamentos parcelados nem de ajustes parciais no DEV, **não existe ainda conferência da nova RPC sobre dados reais desses cenários**.
- Foram verificadas as fórmulas SQL em fixture sem escrita: vencimento 31/01/2027 → 28/02/2027 → 31/03/2027 e R$ 100,01 com entrada R$ 10,00, três parcelas **R$ 30,01 + R$ 30,00 + R$ 30,00**. Teste de 11 centavos em 12 parcelas confirma que a parcela 10 fica com zero na regra atual de desempate lexicográfico; isso foi documentado para evitar divergências futuras.
- O novo contrato SQL e as verificações de acesso/anonimação passaram no DEV (9 pgTAP).

### Riscos que impedem integração à tela
- A projeção **ainda não calcula** saldo sem programação de Compras, rateios por loja/origem, pagamentos consolidados de CMPs, ocorrências de pagamento e eventos de créditos/reembolsos.
- Excluir compras ajustadas é deliberado: documentos/cancelamentos parciais (ex.: CMP-00038) exigem recomposição dos valores líquidos, de frete retido, residual e do crédito por item antes de substituir `applyPurchasePartialAdjustments`.
- A validação de pagamento parcelado ainda precisa de fixtures integradas na RPC com controle de RLS, além dos testes de fórmula e testes TypeScript.
- Código TypeScript recente ainda sem execução própria do GitHub Actions identificável no momento desta atualização; não considerar CI homologado.
- Não trocar `finance-payments-page.tsx` ou dashboards pela nova RPC antes da paridade integral; nenhuma publicação em PROD, merge ou migração em PROD.


## Auditoria automática das quatro etapas na Preview #85 — 12/11/2026

### Implementação sem substituição dos saldos oficiais
- Nova auditoria pura `src/domain/finance-projection-audit.ts`: faz verificações de conservação por pagamento, rateio, crédito e consolidação, confrontando `buildFinancePaymentEvents` com o resultado efetivamente exibido por `buildUnifiedFinancePayments`.
- Novo executor `src/data/finance/finance-parity-comparison.ts`: carrega todas as páginas elegíveis de `finance_purchase_events_page_v1` em lotes de 100; valida totais, contagem de páginas, ausência de linhas perdidas/duplicadas e confronta campo a campo com o algoritmo atual por `assertPurchaseEventParity`.
- Na tela **Financeiro → Pagamentos** (`src/pages/finance-payments-page.tsx`), ativa automaticamente **somente** em `deploy-preview-85--*`, em modo somente leitura, após o carregamento da tela. Consulta SQL executada como o usuário autenticado, com `SECURITY INVOKER` e RLS, sem SQL de escrita. `?financeParity=0` desativa o diagnóstico.
- O executor reutiliza as linhas já calculadas para a tela; não repete o processamento do consolidado no diagnóstico.
- A **PR #85 permanece em rascunho**; as telas de produção não foram alteradas e o Financeiro continua usando os cálculos originais em todas as KPIs e exports.

### Verificações e limites por etapa
1. **Parcelamentos e pagamentos:** cada ID de evento legado deve existir uma vez (inclusive nos grupos combinados), manter data/status/centavos e conciliar a soma dos eventos por pagamento; eventuais entradas e parcelas permanecem sob o algoritmo atual.
2. **Cancelamentos e créditos:** confirma bruto = líquido + reembolso, crédito por item, cancelamento + redução líquida de frete = reembolso, registro histórico preservado e reembolso consolidado sem dupla dedução. Não altera a classificação de frete ou o histórico fiscal.
3. **Rateios:** soma por loja + não alocado deve bater centavo a centavo com cada evento; valida classificação por origem, ausência de loja duplicada e valor inalterado ao aplicar filtro de loja individual.
4. **CMPs combinadas:** verifica que os eventos individuais são representados uma única vez no pagamento consolidado, que as referências das CMPs estão corretas, e que os pedidos sem pagamento geral tenham saldos sem programação calculados por contrato menos registros.

**Avisos bloqueiam resultado global "aprovado".** Pagamentos gerais sem vinculação a pedidos e itens sem origem válida não são considerados plenamente homologados por esta auditoria. Divergências também bloqueiam. O SQL não aprovado por compras com ajuste parcial retorna `incomplete`, com contagens excluídas — nunca é interpretado como valor zero ou paridade completa.

### Matriz de testes adicionada
- Consolidação CMP-00002 + CMP-00003 com pagamento e parcela combinados; injeção de discrepância de R$ 0,01 para testar detecção.
- Parcela em 31/jan (31/jan → 28/fev → 31/mar), entrada prevista e total de R$ 100,01.
- Cancelamento parcial de CMP-00038 (fixture sintética, não dados reais): pagamento bruto R$ 100,00, cancelamento R$ 40,00, frete retido R$ 5,00 e residual retido R$ 0,10; crédito R$ 34,90, saldo R$ 65,10; ocorrência original + crédito; injeção de divergência para exigir falha.
- Crédito residual acima do frete comprovado: cancelamento R$ 40,00, frete R$ 10,00 e crédito residual R$ 3,00, reembolso total R$ 53,00, saldo líquido R$ 47,00. Ajuste virtual `AJ-CREDITO` separado, não registrado falsamente como frete.
- Rateio de R$ 0,05 para três lojas (R$ 0,02 + R$ 0,02 + R$ 0,01), inclusive detecção de centavo perdido.
- Rateio misto Equipamentos/Mobiliário de R$ 101,03 em três lojas, com origem Equipamentos R$ 50,01 e Mobiliário R$ 51,02.
- Pagamento geral sem pedido específico: a auditoria apresenta ressalva, sem indicar paridade completa.
- Executor SQL: caso sem dados, exclusões por ajustes, divergência de paginação, página incompleta e falha de permissão/conexão.

### Evidência e pendências
- Netlify Preview para commits da PR #85 compila `npm run build` (`tsc -b && vite build`); deploy confirmado como `success` após integrar o diagnóstico.
- **Os casos Vitest recém-adicionados ainda não tiveram execução do GitHub Actions para o HEAD mais recente**; não marcar regressões novas como executadas/homologadas. Execução manual/CI é pré-requisito antes de qualquer merge.
- Revalidada por SQL read-only em DEV a projeção básica: 9 eventos pagos de Compras = R$ 5.192,70 e 9 eventos de Obras = R$ 20.900,00 (4 pagos, 3 programados, 2 sem programação). Esta validação SQL NÃO significa homologação dos fixtures complexos por execução de Vitest.
- A projeção SQL de Compras continua sem rateios por loja, créditos de cancelamento e consolidação entre CMPs. A auditoria atual protege a migração para esse futuro modelo, **mas não é a própria substituição SQL integral**.
- PROD não recebeu migrations ou dados desta PR. A cópia integral de PROD para DEV/backup permanece **suspensa conforme orientação do usuário**.


## Projeção SQL v2 de reembolsos — 12/11/2026

### Implementação, somente DEV e Preview #85
- Migration `20261112185940_finance_purchase_adjustment_reconciliation_v1.sql`: função SQL estável, somente leitura, RLS/SECURITY INVOKER, verifica registro imutável do pagamento original, componentes de cancelamento, frete retido, residual, créditos por item e bruto − reembolso = líquido; identifica ajustes repetidos ou inconsistentes.
- Migration `20261112190731_finance_purchase_events_page_v2_reconciled_refunds.sql`: nova versão paginada, preservando v1, com `gross_amount_cents` e `refund_cents` por evento, e totais globais `gross_paid_cents`, `refunds_cents`, `paid_cents`. Pagamentos com exatamente um ajuste financeiramente conciliado entram pelo valor líquido; situações inválidas ou múltiplas geram `is_complete=false` e contagens excluídas.
- Dupla auditoria na Preview: `assertPurchaseAdjustmentParity` compara cada ajuste com `PurchaseV2.adjustments`; `assertPurchaseEventParity` compara eventos v2 contra `buildFinancePaymentEvents`. Ambas checam páginas completas, IDs, valores BigInt, status, datas e diferenças de centavos. Falhas impedem aprovação global. A nova consulta não substitui a fonte oficial das KPIs ou dos relatórios.
- A tela Financeiro → Pagamentos da Preview #85 mostra o resultado desses dois testes, sem ações de escrita.
- Todas as novas funções têm `SECURITY INVOKER`, `STABLE`, autorização `finance.payments_view`, RLS das tabelas base, execução concedida somente a `authenticated`. `anon` e `PUBLIC` não possuem `EXECUTE`.

### Evidência DEV
- Comparação real v1 vs v2 no usuário autorizado: **9 eventos**, **R$ 5.192,70**, 0 divergências; v2 bruto 519270 centavos, crédito 0 e líquido 519270. Usuário sem permissão financeira: 0 eventos e 0 valores.
- O DEV possui **0 registros reais de ajustes parciais**; por isso não há homologação real da nova função nesse cenário. Testes sintéticos conferem R$ 100,00 bruto − R$ 34,90 reembolsado = R$ 65,10 líquido, incluindo frete retido assinado.
- Arquivos de teste `supabase/tests/finance_purchase_adjustment_reconciliation.test.sql` e `supabase/tests/finance_purchase_events_page_v2.test.sql` executados em DEV: 10 verificações cada. Casos Vitest adicionados para reembolso, distorção de centavo e recusa de registros inválidos.
- Netlify compilou a Preview para o HEAD verificado; **não houve execução recente confirmada do GitHub Actions para as novas alterações**. CI continua pendente.

### Próximas restrições
- V2 cobre o valor líquido do evento e tem auditoria do histórico, mas **ainda não produz rateios SQL por loja/origem, saldo sem programação de Compras, agrupamentos de CMPs nem desmembramento de ocorrências**.
- Antes de integrar a tela oficial, exige-se paridade completa e CI, além de validação com registros reais de ajuste. A cópia da produção para DEV permanece suspensa por orientação do usuário.
- Sem migração, alteração de dados ou publicação em PROD. PR #85 ainda DRAFT.


## Etapa SQL: saldos não programados e pesos de custo por loja — 12/11/2026

### Somente DEV e Preview #85
- `finance_purchase_unscheduled_page_v1`, migration `20261112192222` + correção `20261112192305`: consulta read-only de saldos sem programação **por pedido**. Deduz pagamentos diretamente vinculados e distribui pagamentos gerais proporcionalmente aos valores dos pedidos ativos com rateio de centavos e desempate lexical pelo ID; pedidos com peso zero não recebem centavos residuais.
- Compras ajustadas, linhas sem `line_total` e outros dados que o SQL ainda não pode reproduzir com segurança são **explicitamente excluídos da projeção**; o indicador `is_complete=false` impede aprovação da paridade. Nenhuma escritura de dados ou alteração de saldo real é feita.
- `finance_purchase_store_costs_page_v1`, migration `20261112193058`: projeta pesos/custos contratados por pedido e por loja quando a distribuição da linha está confirmada. Lojas com quantidade positiva recebem centavos pela regra de maiores restos; pedidos ainda sem distribuição mantêm `unallocated_cents`. São excluídos casos com ajustes imutáveis, linha de valor indefinido/negativo ou repetição de loja em uma mesma linha.
- A consulta por loja ainda é **peso/custo do pedido**, não o rateio final de cada pagamento por origem (`equipment/furniture/works`). Essa separação é deliberada para não trocar indevidamente custos orçados por pagamentos executados.
- Ambas as RPCs são `STABLE`, `SECURITY INVOKER`, RLS-scoped, autorizadas somente a usuário autenticado com `app.can('finance','payments_view')`; `anon` e `PUBLIC` sem `EXECUTE`.
- `src/data/finance/finance-purchase-unscheduled-repository.ts` e `src/data/finance/finance-purchase-store-costs-repository.ts` usam tipos `bigint`, checagem de valores e rejeitam projeções incompletas por padrão (exceto diagnóstico explícito).
- `assertPurchaseUnscheduledParity` compara todos os saldos SQL contra `buildUnifiedFinancePayments`, confrontando ordem, compra, total contratado, pagamentos vinculados e centavos não programados.
- `assertPurchaseStoreCostParity` confere cada pedido e cada valor por loja, inclusive `unallocated_cents`, contra `purchaseOrderStoreCosts`; difere de uma comparação superficial de total global.
- O executor automático da Preview #85 `runFinancePreviewParity` carrega todas as páginas das duas consultas e só permite `passed` quando as quatro camadas de SQL (eventos v2, reembolsos, saldo sem programação e custos por loja) mais a auditoria de domínio estiverem conciliadas. A tela continua exibindo **exclusivamente o cálculo financeiro legado**.

### Evidências diretas do DEV
- Consulta de saldos sem programação no perfil financeiro de teste: **1 pedido**, `340` centavos (**R$ 3,40**) associado à **CMP-00014**. Perfil sem `finance.payments_view` recebeu 0 linhas e 0 valores.
- Projeção de custos: **7 pedidos ativos**, total contratado `505160` centavos (**R$ 5.051,60**), custo distribuído `498950` (**R$ 4.989,50**) e custo ainda não alocado `6210` (**R$ 62,10**). Contagens de páginas 3+3+1+0 com 7 IDs distintos e nenhuma divergência entre soma total, valor distribuído e não distribuído.
- Acesso RLS negado também retornou 0 para custos por loja.
- pgTAP executados em DEV: `supabase/tests/finance_purchase_unscheduled_page.test.sql` (11 assertions) e `supabase/tests/finance_purchase_store_costs_page.test.sql` (11 assertions). Testes Vitest novos: contrato de RPC, conservação de centavos entre dois pedidos com pagamento geral, rateio de 5 centavos entre três lojas e custo não distribuído.
- Netlify `npm run build` (TypeScript + Vite) passou para a Preview durante a implementação. GitHub Actions ainda não executou as novas suítes Vitest do HEAD, portanto **não considerar regressões automaticamente homologadas**.

### Limites e próximos gates
- A SQL de custos por loja **não implementa ainda a distribuição efetiva por origem financeira**, nem a consolidação SQL de parcelas entre CMPs com notas `compra única`/`parcela combinada`. Esses casos permanecem no domínio atual.
- A SQL de saldos ainda exclui compras com cancelamentos parciais; seu pagamento geral é alocado apenas para compras sem ajustes, com paridade a ser aferida automaticamente no ambiente autorizado.
- Dados de produção NÃO foram copiados para DEV e não foram alterados. Sem merge, deploy em PROD ou mudanças nas telas financeiras oficiais. PR #85 continua em rascunho.


## Etapa SQL: grupos CMP combinados e origens financeiras dos eventos — 12/11/2026

### Consulta de agrupamento de CMPs (DEV)
- Migration `finance_purchase_combined_groups_page_v1` (versão `20261112194403`): RPC `STABLE SECURITY INVOKER` somente leitura, autorização `finance.payments_view` e RLS. Agrupa eventos cujas notas contêm `compra única` ou `parcela combinada` exatamente pela chave do domínio: status, vencimento, fornecedor, meio de pagamento e `sourceLabel`.
- Produz `combined:<IDs ordenados>`, referências únicas de CMPs, IDs de eventos de origem, quantidade de eventos e valor consolidado em centavos. São explicitamente excluídos pagamentos combinados ajustados, negativos e com quantidade de parcelas acima do limite; o indicador `is_complete=false` impede homologação indevida.
- `assertCombinedPurchaseParity` exige igualdade com o agrupamento atual `buildUnifiedFinancePayments` em ID, referências, status, data, fornecedor, forma de pagamento, `sourceLabel` e valor. A consulta é paginada, e o executor Preview #85 exige todas as páginas.
- PgTAP 12 verificações de contrato, permissões e cenários sintéticos; casos de CMP-00002 + CMP-00003: entrada combinada **R$ 43.579,20** e parcela **R$ 20.336,96**. O primeiro rascunho do teste SQL tinha contagem de eventos incorreta (1 em vez de 2); o arquivo foi corrigido e a execução final concluiu com 12 testes sem falhas.
- **No DEV não há registros marcados como combinados**, logo a consulta real retornou zero grupos e a homologação de dados reais para esse cenário permanece pendente.

### Rateio de cada pagamento por origem financeira (DEV)
- Migrations `20261112195028_finance_purchase_payment_origins_page_v1` e `20261112195222_finance_purchase_payment_origins_source_coverage_gate`: retorna para cada evento de pagamento v2 o valor em centavos por `equipment`, `furniture`, `works` e `unallocated_origin_cents`.
- Classificação segue a precedência do domínio: `supply_items.financial_group` quando definido e, como fallback, subcategoria/grupo/categoria/nome do item, com normalização de caracteres portugueses e padrões de mobiliário/equipamentos.
- Rateio por maiores restos, desempate da chave textual e centavos inteiros `bigint`. Para eventos sem linha de custo, preserva a parcela não alocada em vez de inventar classificação. Compras com ajustes ou custos indefinidos são excluídas e sinalizadas; a migração de cobertura propaga a incompletude da consulta fonte de eventos.
- Repositório `finance-purchase-payment-origins-repository.ts` verifica as somas de cada página e de cada evento; `assertPurchasePaymentOriginParity` compara a soma dos eventos SQL com as linhas financeiras do domínio, mesmo quando vários eventos foram consolidados em uma linha `combined:`. A mesma auditoria verifica vínculos CMP/pedido e centavos não explicados.
- No DEV, conferência real autorizada em páginas de 3: **9 eventos distintos**, zero divergências de ID/status/data/valor comparados com a RPC v2; `equipment=508820` centavos (**R$ 5.088,20**), `furniture=10450` centavos (**R$ 104,50**), `unallocated=0`, total **R$ 5.192,70**. Perfil sem acesso Financeiro recebeu zero linhas e totais zero.
- PgTAP 12 verificações SQL, além de testes Vitest de contrato, CTE de origem, cobertura de CMPs combinadas, detecção de centavo perdido, eventos sem custo e usuário sem permissão.

### Bloqueio na publicação e no rateio final por loja
- A integração da auditoria de origens na tela Financeiro → Pagamentos foi enviada à PR #85 em modo somente leitura, sem afetar os totais oficiais.
- A primeira tentativa de SQL para rateio **final de pagamento por loja e origem simultaneamente** falhou na validação de tipos do banco (`UNION` entre bigint e texto); **a migration não foi aplicada**, nem é usada pela Preview. Continuar somente após revisão da implementação e comparação.
- Após a integração da auditoria, alguns deploys Netlify falharam. A investigação apontou import TypeScript não utilizado (`FinancePurchaseOriginPage`) na auditoria, com `noUnusedLocals=true`; o import foi removido em commit posterior. A confirmação do build final deve ser verificada no commit HEAD antes de considerar a Preview homologada.
- GitHub Actions ainda não apresentou execução para o HEAD recente da PR. Não considerar Vitest executado/CI aprovado apenas porque o Netlify eventualmente compilar. PR continua em rascunho, sem merge e com indicador de bloqueio de mesclagem.
- **PROD intacto**: nenhuma migration, pagamento, reembolso, permissão, anexo ou documento foi modificado em produção. A transferência PROD→DEV permanece suspensa.


## Preview #85 — rateio paginado de pagamento por loja e origem (12/11/2026)

### Implementação registrada somente em DEV
- Duas migrations aplicadas ao Supabase **DEV** e versionadas com os IDs efetivamente atribuídos pelo servidor: `20261112202132_finance_purchase_payment_store_origins_page_v1.sql` e `20261112202258_finance_purchase_payment_store_origins_drop_zero_rows.sql`. A segunda retira lojas com zero centavos, espelhando o algoritmo legado.
- Nova RPC `finance_purchase_payment_store_origins_page_v1(p_page,p_page_size)`: consulta **somente leitura**, pagina até 100 eventos por chamada, parte dos eventos de `finance_purchase_events_page_v2`, calcula peso da contratação por loja/origem, aplica o mesmo princípio de maiores restos e mantém o restante em `unallocated_cents`. Pagamentos sem pedido ativo ou sem distribuição não desaparecem do total.
- Segurança: `SECURITY INVOKER`, `STABLE`, `search_path=''`, RLS das tabelas de origem, autorização `finance.payments_view`, `EXECUTE` apenas para `authenticated`. Compras ajustadas ou com custos/lojas ambíguos geram `is_complete=false` e não passam na auditoria.
- Repositório tipado `src/data/finance/finance-purchase-payment-store-origins-repository.ts`, contrato da RPC em `database.types.ts`, comparador `assertFinancePaymentStoreParity` confrontando **ID/CMP/pedido, status/data, total, loja, categoria de origem, centavos não alocados e CMPs combinadas**. A tela Financeiro → Pagamentos exibe essa verificação **somente na Preview #85**. Nenhuma KPI ou exportação financeira utiliza a nova RPC.
- Testes adicionados: `src/tests/finance-purchase-payment-store-origins-repository.test.ts`, regressões em `finance-payments.test.ts` e `finance-parity-comparison.test.ts`, e `supabase/tests/finance_purchase_payment_store_origins_page.test.sql` (**12/12 verificações SQL executadas em DEV**).

### Evidências reais no DEV e limitações
- Dois perfis DEV autorizados: **9 eventos cada, R$ 5.192,70 no total**, dos quais **R$ 5.090,50 atribuídos às lojas** e **R$ 102,20 sem distribuição**. A busca em páginas de 3 resultou em **3+3+3+0**, sem eventos ausentes, extras ou duplicados. Comparação SQL com os mesmos eventos da consulta v2: **zero diferenças em ID, CMP, valor, status e data**; todas as linhas mantiveram a conservação de centavos entre lojas e valores não distribuídos.
- Perfil sem autorização financeira: **0 registros, R$ 0,00**, preservando a matriz de acesso.
- `EXPLAIN (ANALYZE, BUFFERS)` no usuário autorizado DEV: execução da RPC aproximadamente **90,1 ms**, em base pequena (9 eventos). Não é previsão de desempenho para PROD.
- Dados DEV ainda não contêm registros reais suficientes de reembolsos/cancelamentos parciais, rateios complexos ou CMPs combinadas como **CMP-00002/00003**. Casos sintéticos foram adicionados ao código de testes, mas **GitHub Actions Quality/Vitest dos commits mais recentes ainda não foram confirmados**. Netlify compilou um commit anterior; verifique o HEAD final antes de homologar.
- A nova consulta faz leitura de pesos de contratação; não altera históricos, notas fiscais, saldos, documentos nem pagamentos reais. A comparação detecta falhas, mas **não autoriza substituição dos cálculos atuais** até CI, homologação funcional e benchmarks com volume representativo.
- **PROD preservado**: sem merge, sem migrations em produção, sem cópia PROD→DEV. O histórico de migrations é diferente entre os dois ambientes; não utilizar `db push` indiscriminadamente.


## Preview #85 — auditoria sob demanda e documentos de reembolso (12/11/2026)

- A auditoria financeira da Preview executava até sete grupos de consultas SQL/RPC logo após a carga padrão de Pagamentos, que se ampliam em páginas adicionais para conferência. **O diagnóstico agora é sob demanda**: botão `Executar auditoria` ou `Reexecutar auditoria` disponível somente em `deploy-preview-85--*`. `?financeParity=1` permite execução automática explicitamente solicitada; `?financeParity=0` desabilita o painel. A consulta não recalcula nem substitui os valores oficiais.
- Teste de regressão em `finance-parity-on-demand.test.ts` confere isolamento, disparo manual, bloqueio de acionamento durante a execução e que os KPIs/exportações continuam usando os dados canônicos.
- Auditoria de anexos em Supabase **DEV**, exclusivamente por `SELECT` administrativo: 4 metadados de documentos fiscais de Compras, 4/4 com arquivo no bucket privado `purchase-attachments`; 4 metadados de documentos de Obras, **0/4** com arquivo correspondente em `works-documents`. Todos os buckets DEV têm `public=false`. O bloqueio é de **dados de teste/documentos faltantes**, não evidência de falha de autenticação ou de produção. **Não copiar arquivos PROD para DEV** sem autorização.
- Simulação RLS para três perfis DEV autenticados: perfis 1 e 3 com `finance.payments_view` acessam 4 documentos fiscais CMP e 4 documentos OBR, e somente 4 objetos válidos no bucket de Compras; perfil 2 sem permissão não vê documentos nem objetos. A autorização dos documentos é independente de `finance.payments_view`, sujeita às políticas de compras/obras/loja: não inferir permissões gerais deste recorte.
- Teste de regressão `finance-reimbursement.test.ts` reproduz anexo de compra ausente no download e confirma que a planilha apresenta `Falha ao obter arquivo` e a aba `Pendências Documentais`, sem alterar o total solicitado. O exportador existente já captura falhas dos downloads e registra as ausências no ZIP.
- Homologação visual com login real na hospedagem e clique de abertura de arquivos permanece pendente; as verificações acima são testes JSDOM/Excel e SQL com perfis autenticados simulados, não navegação end-to-end em um navegador com sessão real.
- Nenhuma migration, documento ou pagamento alterado nesta etapa. **PROD intacto**, PR #85 continua draft sem merge.
