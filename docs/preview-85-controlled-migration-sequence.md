# Implanta 27 — Sequência CONTROLADA e CONDICIONAL das migrações #85

**Estado: PLANO / NO-GO.** Elaborado para revisão técnica. **Não autoriza**
aplicação em produção, merge da PR, criação de outro ambiente ou cópia de
dados reais. O usuário optou por **não criar um ambiente adicional** no
Supabase; o ensaio integral do esquema de PROD continua indisponível.

## Inventário congelado

Foram inventariados **26 arquivos** de migrações novos na PR #85, listados
abaixo por ordem de versão. Qualquer alteração futura no conjunto deve
invalidar esta versão do plano até nova revisão.

- Supabase DEV: `wiynrfblfigngkvleyqg`
- Supabase PROD: `vskvsujhpinanthxewab`
- DEV/PROD possuem as mesmas **321 definições de coluna e 230 constraints**
  nas 18 tabelas principais comparadas. Nos índices dessas tabelas,
  quatro índices fiscais novos existem somente em DEV.
- As 26 migrações referenciam **26 relações existentes no PROD** (checagem
  estática de nomes; não garante paridade da lógica SQL).
- **23 funções esperadas na versão final**: 23 instaladas em DEV; só
  uma já existia no PROD antes da #85. **22 funções ainda não existem no PROD.**
- **27 políticas** de Compras analisadas em cada banco; 24 têm diferenças
  de expressão/regra entre DEV e PROD; todas as 14 tabelas de Compras
  verificadas têm RLS habilitada.
- **Histórico divergente:** 40 nomes de migração DEV-only e 12 PROD-only.
  É proibido executar uma sincronização cega de `supabase db push` ou alterar
  a tabela de histórico de migrações para silenciar essa diferença.

## Gate obrigatório ANTES de qualquer deploy (NÃO EXECUTADO)

1. Confirmar backup **recuperável** e independente dos dados PostgreSQL;
   confirmar também o backup/restauração dos bytes do Supabase Storage.
   **Metadados de Storage não são os arquivos físicos.**
2. Capturar os resultados dos scripts versionados:
   - `docs/sql/preview85-readonly-prod-snapshot.sql` — totais financeiros
     e quantidades gerais
   - `docs/sql/preview85-prod-adjustments-integrity-readonly.sql` —
     integridade de valores e vínculos dos ajustes reais
   - `docs/sql/preview85-storage-links-integrity-readonly.sql` —
     vínculos entre documentos e Storage, incluindo fingerprints
   - `docs/sql/preview85-preflight-schema-readonly.sql` — presença
     das funções e RLS de compras
   - `docs/sql/preview85-rollback-rls-source-readonly.sql` — definições
     originais de políticas e helper; **guardar resultados em armazenamento
     protegido, fora do GitHub**, para orientar um DBA na reversão
3. Reconciliar migrações com histórico PROD e revisar dependências, `GRANT`,
   `SECURITY DEFINER`, `WITH CHECK`, RLS e custos operacionais. Confirmar
   compatibilidade com o código que está atendendo usuários.
4. Homologar login real, anexos, ZIP, Excel, Dashboard, Compras, Obras,
   Conciliação, Pagamentos e Reembolso. Registrar comparações financeiras.
5. Obter autorização **específica** para a janela de release, incluindo
   responsabilidade, rollback e risco residual de não existir um ensaio
   em cópia isolada. Sem isso, **NO-GO**.

## Sequência PRETENDIDA de execução (somente após aprovação futura)

**Não executar este documento como script**: é inventário e checklist.
A ordem abaixo é a ordem versionada das 26 migrações; cada uma exige
revisão por responsável de banco antes de qualquer uso.

### Bloco A — Funções auxiliares e RLS de Compras (risco ALTO)

Substitui políticas e funções SECURITY DEFINER em esquemas privados/app. Precisa preservar integralmente a matriz de acesso; um erro pode ocultar compras ou liberar escopo indevido.

- `20261111194525_cache_purchase_read_scope_initplan.sql`
- `20261111194748_optimize_purchase_permission_matrix_set_based.sql`
- `20261111194929_cache_purchase_store_permission_scope.sql`
- `20261111200028_fixed_store_permission_scope_helpers.sql`

### Bloco B — Dashboard e leitura do catálogo

RPCs gerenciais e otimização da política de catálogo. Conferir totalizações e permissões específicas do dashboard.

- `20261111202109_dashboard_implementation_store_metrics.sql`
- `20261111202641_dashboard_supply_metrics.sql`
- `20261111203131_optimize_supply_catalog_read_policy_initplan.sql`

### Bloco C — Financeiro, pagamentos e rateios

RPCs paginadas de fontes, obras, pagamentos, reembolsos, ajustes, origens e rateio por loja. Não substituir cálculos canônicos se paridade divergir.

- `20261112135448_finance_payment_sources_page_v1.sql`
- `20261112141704_finance_work_commitments_page_v1.sql`
- `20261112142002_finance_work_commitments_label_fallback.sql`
- `20261112144333_finance_purchase_events_page_v1.sql`
- `20261112144448_finance_purchase_events_keep_zero_paid.sql`
- `20261112185940_finance_purchase_adjustment_reconciliation_v1.sql`
- `20261112190731_finance_purchase_events_page_v2_reconciled_refunds.sql`
- `20261112192222_finance_purchase_unscheduled_page_v1.sql`
- `20261112192305_finance_purchase_unscheduled_positive_weight_tiebreak.sql`
- `20261112193058_finance_purchase_store_costs_page_v1.sql`
- `20261112194403_finance_purchase_combined_groups_page_v1.sql`
- `20261112195028_finance_purchase_payment_origins_page_v1.sql`
- `20261112195222_finance_purchase_payment_origins_source_coverage_gate.sql`
- `20261112201222_finance_purchase_store_origin_weights_page_v1.sql`
- `20261112202132_finance_purchase_payment_store_origins_page_v1.sql`
- `20261112202258_finance_purchase_payment_store_origins_drop_zero_rows.sql`
- `20261112204537_finance_purchase_payment_store_origins_integer_division.sql`

### Bloco D — Índices e conferência fiscal

Índices de consulta fiscal e RPC SECURITY INVOKER normalizada; conferir RLS, desempenho e ZIP/Excel.

- `20261113032359_document_audit_cross_store_number_indexes.sql`
- `20261113033534_finance_document_audit_normalized_candidates_invoker.sql`

**Gate em cada bloco:** interromper se houver falha de SQL, erro de login,
registros invisíveis, diferença de valores/centavos, timeout anormal ou
exposição indevida. Uma migração SQL aplicada pode alterar políticas
imediatamente, inclusive para o frontend antigo. Definir janela com
gravações pausadas. **Não presumir que rollback do Netlify desfaça SQL.**

## Depois da publicação APROVADA (ainda não realizada)

- Validar `23/23` funções esperadas, RLS e diferenças de política
  aprovadas, sem abrir acesso à conta anônima.
- Fazer login real com conta autorizada e conta restrita. Conferir
  pagamentos, lançamentos, compras compartilhadas, 10 ajustes parciais,
  documentos e exportações.
- Conferir novamente snapshots financeiros, integridade de ajustes,
  fingerprint de vínculos do Storage, quantidades e totais por status,
  enquanto as gravações permanecerem suspensas.
- Liberar gravações só após paridade confirmada. Monitorar timeout,
  "Tente novamente", erros de RLS, upload/download e ZIP.
- Se houver falha, **interromper** e acionar recuperação aprovada.
  Reversão do frontend não reverte alterações no PostgreSQL. Nunca
  restaurar PROD automaticamente nem sem avaliar transações posteriores.

## Status desta etapa

**Nenhuma dessas 26 migrações foi aplicada ao PROD durante esta etapa.**
Não houve novo ambiente, migração, atualização de registros, alteração
de Storage, merge da PR ou deploy de frontend para produção.
