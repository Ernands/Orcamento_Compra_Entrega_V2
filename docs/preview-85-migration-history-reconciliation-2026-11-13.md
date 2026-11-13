# Preview #85 — reconciliação de nomes de migrações DEV/PROD
**Estado:** inventário somente leitura; **NÃO É PLANO PARA EXECUÇÃO AUTOMÁTICA**. Atualização 13/11/2026.

## Método e limites
Inventário diretamente de `list_migrations` nos projetos DEV `wiynrfblfigngkvleyqg` e PROD `vskvsujhpinanthxewab`. Compara **nomes** reportados pelo Supabase, não hashes, conteúdo das migrações nem estado funcional completo de schemas; nomes iguais também não provam identidade de SQL. Não foram criados projetos/branches, feitos dumps ou executados `db push`, DDL, DML ou mudanças no histórico.

| Métrica | Contagem |
|---|---:|
| Registradas em DEV | 139 |
| Registradas em PROD | 111 |
| Nomes comuns | 99 |
| Apenas DEV (total) | 40 |
| Apenas DEV, anteriores à #85 | 14 |
| Apenas DEV, pertencentes à #85 | 26 |
| Apenas PROD | 12 |

## Pendências antigas de DEV (não pertencem à #85)
**Não presumir que estão ausentes funcionalmente em PROD**: podem ter sido reempacotadas, executadas em outra versão ou substituídas. Revisar por diff de SQL, objetos efetivos, segurança e dependências.

| Versão DEV | Nome | Investigação prioritária |
|---|---|---|
| 20260910143136 | `financial_menu_v1` | Permissões e financeiro |
| 20260910143520 | `financial_reimbursement_invoker_fix` | Permissões e financeiro |
| 20260910144056 | `financial_partial_reimbursement_balance` | Permissões e financeiro |
| 20260910145149 | `financial_reimbursement_fk_indexes` | Permissões e financeiro |
| 20260922140951 | `finance_consolidated_payments_permission` | Permissões e financeiro |
| 20260929160655 | `purchase_delivery_management` | Fluxo de entrega/Compras |
| 20260929160753 | `purchase_delivery_issue_status` | Fluxo de entrega/Compras |
| 20260929160933 | `purchase_delivery_legacy_visual_statuses` | Fluxo de entrega/Compras |
| 20260929165301 | `purchase_delivery_expected_delivery` | Fluxo de entrega/Compras |
| 20261028214654 | `partial_adjustment_immutability_guard_v2` | Guardas de ajuste imutável, escopo e integridade |
| 20261028214818 | `partial_adjustment_uuid_store_scope_fix` | Guardas de ajuste imutável, escopo e integridade |
| 20261028215445 | `partial_adjustment_store_allocation_guard` | Guardas de ajuste imutável, escopo e integridade |
| 20261028215613 | `partial_adjustment_finance_scope_read` | Guardas de ajuste imutável, escopo e integridade |
| 20261028215954 | `verify_complete_purchase_partial_adjustment_migration_v2` | Guardas de ajuste imutável, escopo e integridade |

## Migrações registradas exclusivamente em PROD
**Não apagar, renomear ou sincronizar automaticamente**. Snapshots/backup nomeados como migrations podem fazer parte do histórico sem equivalência no DEV; a presença desse nome **não comprova backup restaurável**.

| Versão PROD | Nome | Grupo |
|---|---|---|
| 20260818174200 | `quote_attachments_editing` | Alteração funcional ou segurança — requer diff |
| 20260819210331 | `optimize_quote_read_access` | Alteração funcional ou segurança — requer diff |
| 20260819210658 | `cache_quote_view_capability_in_rls` | Alteração funcional ou segurança — requer diff |
| 20260903195641 | `predeploy_safety_snapshot_pr14_20260903` | Snapshot/backup — verificar natureza |
| 20260911134455 | `financial_menu_release_20260911` | Alteração funcional ou segurança — requer diff |
| 20261002203338 | `optimize_quote_rls_read_policies` | Alteração funcional ou segurança — requer diff |
| 20261008205349 | `backup_finance_pre_release_54_20261008` | Snapshot/backup — verificar natureza |
| 20261008205521 | `backup_public_complement_pre_release_54_20261008` | Snapshot/backup — verificar natureza |
| 20261009172345 | `backup_public_pre_release_54_20261009` | Snapshot/backup — verificar natureza |
| 20261009172524 | `finance_planned_payment_revoke_anon` | Alteração funcional ou segurança — requer diff |
| 20261009185403 | `backup_purchase_payments_pre_pr56_20261009` | Snapshot/backup — verificar natureza |
| 20261026152824 | `backup_public_pre_release_70_20261026` | Snapshot/backup — verificar natureza |

## Mudanças da Preview #85 que ainda não devem subir para PROD
- `20261111194525_cache_purchase_read_scope_initplan.sql`
- `20261111194748_optimize_purchase_permission_matrix_set_based.sql`
- `20261111194929_cache_purchase_store_permission_scope.sql`
- `20261111200028_fixed_store_permission_scope_helpers.sql`
- `20261111202109_dashboard_implementation_store_metrics.sql`
- `20261111202641_dashboard_supply_metrics.sql`
- `20261111203131_optimize_supply_catalog_read_policy_initplan.sql`
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
- `20261113032359_document_audit_cross_store_number_indexes.sql`
- `20261113033534_finance_document_audit_normalized_candidates_invoker.sql`

## Sequência de reconciliação ainda necessária
1. Localizar SQL real e objeto alterado de cada versão exclusiva; fazer pareamento **por comportamento verificável**, não por semelhança de nome. Verificar particularmente revogação de permissões anônimas, `financial_menu_*` e as cinco guardas de ajustes parciais.
2. Para cada objeto alterado, comparar `pg_get_functiondef`, policies RLS, triggers, grants e dependências relevantes entre DEV/PROD, sem executar funções mutáveis nem tocar registros. Observar que a comparação por nome da migration não demonstra aplicação das mesmas alterações.
3. Exigir revisão de compatibilidade com as 26 migrações novas (dependências, `SECURITY DEFINER`, `WITH CHECK` e ordem controlada) e evidência de testes de autorização de usuários reais.
4. **Não executar `supabase db push` nem editar `supabase_migrations.schema_migrations` para forçar igualdade.** Sem ensaio em cópia do esquema PROD, o risco residual permanece material e só pode ser aceito explicitamente, com backup restaurável e plano de rollback do banco/Storage.

## Observações
As 26 migrations da #85 estão enumeradas em [sequência controlada](preview-85-controlled-migration-sequence.md); comparação estrutural, RLS e integridade de arquivos está em [release gates](preview-85-release-gates-2026-11-13.md). Produção permanece **NO-GO**.
