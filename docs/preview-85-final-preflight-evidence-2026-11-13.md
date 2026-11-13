# Implanta 27 — evidências adicionais de pré-publicação da Preview #85
**13/11/2026 | Estado: NO-GO PROD | Consulta e revisão sem alterações nos bancos**

## Identificação e automação
- PR: [#85](https://github.com/Ernands/Orcamento_Compra_Entrega_V2/pull/85), branch `perf/implanta-27-system-wide-preview-85`, último código verificado `b6827c2c04621b915e2d1727d9e1335845ce2d79`, em **draft**, sem merge.
- GitHub Actions Quality **#43370441115: success** (Tests, lint, TypeScript, build); status Netlify Deploy Preview **success** nesse HEAD.
- Supabase DEV `wiynrfblfigngkvleyqg` e PROD `vskvsujhpinanthxewab`: status **ACTIVE_HEALTHY**, PostgreSQL 17.11.0.003. Não há branches extras associadas ao projeto PROD.

## Integridade somente leitura reaplicada em DEV e PROD
Scripts versionados, executados como consultas SELECT, sem DML, DDL, uploads, restaurações ou mudança de autenticação:
- [Ajustes parciais](sql/preview85-prod-adjustments-integrity-readonly.sql): PROD **10 ajustes, 120 linhas referenciadas**, e **zero** problemas nas categorias verificadas (compras/pedidos/pagamentos/linhas ausentes, inconsistência `original - refund = remaining`, tipos JSON, valores nulos). DEV não tem ajustes parciais reais: testes de paridade com esses dez casos ainda NÃO foram feitos.
- [Vínculos de Storage](sql/preview85-storage-links-integrity-readonly.sql): PROD **653/653** anexos de Compras, **6/6** de Cotações, **1.011/1.011** de Obras com caminho e metadados correspondentes; zero caminhos faltantes e zero metadados faltantes. A contagem anterior era de 1.010 documentos de Obras; dados podem mudar durante uso normal. DEV: 4/4 Compras, 2/2 Cotações; os 4 registros de documento de Obras possuem caminho ausente (não são arquivos comprovadamente perdidos). **Não comprova bytes de arquivo, download nem backup restaurável.**
- [Autorizações de esquema](sql/preview85-authorization-surface-readonly.sql): **14/14** tabelas de Compras com RLS em ambos e zero grants diretos de SELECT para `anon`. Em DEV, **23/23** funções finais estão instaladas, nenhuma das esperadas chamável anonimamente. Em PROD, **1/23** está instalada; as outras **22** dependem das migrations da #85. Permanecem **42** funções públicas `SECURITY DEFINER` executáveis por `authenticated` em ambos, legado para revisão por função.
- Advisors Supabase (security): ambos têm avisos de 42 funções definer e da proteção de senha vazada não habilitada; sem conclusões de exploração. [Guia do aviso definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

**Esses resultados são checks de consistência, não ensaio de mudança de esquema nem teste autenticado com usuário de negócio.** Guardar fingerprints e saídas detalhadas de conferência pré/pós-publicação fora do GitHub, em repositório seguro.

## Proveniência de migrações: cruzamento GitHub × históricos reais
- Diretório `supabase/migrations` da PR: **130 arquivos SQL**. Supabase: **139 entradas DEV / 111 PROD**, **99 nomes comuns**. Por nome, **40 exclusivos DEV** (14 antigos + 26 da #85) e **12 exclusivos PROD**; por *versão*, há ainda divergências históricas em múltiplos arquivos antigos. Não comparar versões como se fossem equivalentes e **não fazer `db push` automático ou editar tabela de histórico**.
- **17 nomes do histórico DEV** e **11 nomes de PROD** não têm um arquivo com o mesmo nome no diretório versionado. Isso inclui snapshots/bancos históricos, versões alternativas de patches e tabelas `purchase_delivery_*` existentes só no DEV. Inversamente, há **30 arquivos do repo sem registro de mesmo nome no PROD**, dos quais **26 pertencem à #85** e **4 são legados** (`financial_menu`, duas variantes de auditoria e `auto_partial_refund_signed_residual_adjustments`). Não aplicar esses 4 de novo sem prova de necessidade e compatibilidade.
- Os corpos e assinaturas atuais das funções `app.register_supply_purchase_partial_adjustment_freight_v4`, `public.register_supply_purchase_partial_adjustment_v2`, `public.admin_reference_audit_v1` e `public.save_finance_reimbursement_v1` têm hashes idênticos DEV/PROD. `anon` não pode executar nenhuma; `authenticated` executa as três públicas; a auxiliar `app.*_freight_v4` não é executável diretamente por `authenticated`. Isso **não** equivale à restauração do histórico de migrations nem à validação de políticas de autorização por usuário.
- Tabelas existentes somente em DEV: `purchase_delivery_items` (**54 linhas**), `purchase_delivery_destinations` (**26 linhas**), `purchase_delivery_cells` (**954 linhas**). São objetos reais e não foram criados pelas 26 novas migrações; necessidade operacional em produção requer análise específica, **fora** de qualquer sincronização cega.

## Revisão estática dos 26 arquivos do bloco de implantação
Os **26 arquivos** mencionados em [sequência controlada](preview-85-controlled-migration-sequence.md) estão presentes no GitHub. A revisão textual sinalizou:
- Bloco A: alterações substanciais de políticas RLS e funções auxiliares, incluindo `DROP POLICY IF EXISTS` seguido de `CREATE POLICY`, `GRANT/REVOKE` e `DROP FUNCTION IF EXISTS app.readable_store_ids_for(text[])`. Esta função específica está ausente **agora** em DEV/PROD, o que elimina a necessidade de excluí-la mas não demonstra que as demais instruções sejam seguras no PROD.
- Bloco B: função de Dashboard, agregações e **duas instruções `ALTER POLICY`** no catálogo. As policies `supply_items_read_capability` (em `supply_items`) e `suppliers_read_capability` (em `suppliers`) **existem** em ambos os bancos.
- Bloco C: principalmente funções de leitura e rateio financeiro, não substituem cálculos canônicos no frontend; não é validação de paridade com os dez ajustes reais.
- Bloco D: índices fiscais e RPC `SECURITY INVOKER`.
- Na inspeção textual do conjunto não foram identificadas instruções diretas `DROP TABLE`, `TRUNCATE` ou `DELETE FROM`; isso **não garante** ausência de mudanças de autorização nem permite executar SQL sem ensaio, revisão de dependências e plano de reversão.

## Gates ainda BLOQUEADOS
1. **Backup real**: não há acesso neste fluxo ao inventário de backups ou à prova de restauração do Supabase Dashboard, nem download validado dos bytes de Storage. Confirmar pelo projeto PROD em *Database → Backups*, histórico/PITR disponível e cópia independente dos objetos físicos. Documentação oficial: https://supabase.com/docs/guides/platform/backups.
2. **Migrações**: 26 SQLs permanecem **não aplicados ao PROD**; DEV e PROD têm histórico divergente, diferenças reais nas políticas e tabelas. Não há ensaio em cópia isolada do esquema PROD (decisão anterior de seguir sem novo projeto/branch mantém risco residual elevado).
3. **Login real / E2E**: H01–H14 em [checklist de homologação](preview-85-browser-homologation-checklist.md) continuam sem evidência. Fazer testes com usuário autorizado e restrito na Preview (Supabase DEV), sem compartilhar credenciais. A Preview não contém os 10 ajustes reais do PROD, portanto parte da paridade não é testável ali.
4. **Janela e autorização**: responsável técnico, suspensão de gravações, snapshots pré/pós, plano para falha de schema vs frontend, RPO/RTO e aprovação expressa de release seguem sem confirmação.

**Decisão técnica em 13/11/2026: NO-GO.** Continuar validação read-only e homologação. **Nenhum merge, deploy de PROD, migration em PROD, novo ambiente Supabase ou mutação de dados foi executado.**
