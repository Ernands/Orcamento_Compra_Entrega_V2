# Implanta 27 — Release gates da PR #85 (13/11/2026)

**Decisão atual: NO-GO para PROD.** Documento de preparação; **não autoriza** execução de SQL, merge na `main`, mudança de variáveis Netlify, cópia de banco ou restauração.

## Evidência técnica verificada

- Branch `perf/implanta-27-system-wide-preview-85`; PR #85 mantida **draft**.
- Conflitos com `main` resolvidos preservando proteção de recuperação de linhas de CMP ajustadas e seu teste da `main`. Merge de duas origens, commit `ffb23d9c3841075d1bf427cfb170fe8c71858248`. O GitHub passou a indicar `mergeable=true`. **Não houve merge da PR.**
- [CI depois da integração](https://github.com/Ernands/Orcamento_Compra_Entrega_V2/actions/runs/43363112604): **113/113 suítes, 612/612 testes**, ESLint, TypeScript e build aprovados.
- Netlify: Header/Redirect success; Pages changed neutral. A publicação de código da Preview não prova prontidão das migrações.
- As **26 migrações SQL** adicionadas pela PR incluem funções de relatório e mudanças **reais** em helpers de permissões e políticas RLS. Não se identificaram instruções explícitas de exclusão maciça de linhas nas alterações revisadas. Isso não garante compatibilidade do esquema ou da autorização.
- SECURANÇA: Linter Supabase sinalizou **42 funções SECURITY DEFINER chamáveis por authenticated** tanto em DEV quanto em PROD, com os **mesmos nomes**. Também sinaliza proteção contra senhas vazadas não habilitada em ambos. São avisos existentes que merecem revisão independente; não equiparar igualdade de contagens a auditoria de autorização concluída.

## Comparação read-only (sem alteração de registros)

| Indicador | DEV | PROD |
|---|---:|---:|
| Lojas | 3 | 28 |
| Compras | 6 | 87 |
| Obras | 5 | 358 |
| Ajustes parciais de compras | 0 | 10 |
| Anexos de compras ativos | 4 | 653 |
| Documentos cadastrados de obras | 4 | 1.010 |
| Metadados de objetos no Storage | 6 | 2.049 |

São **ambientes com massas diferentes**. Comparar seus valores monetários como se fossem cópias não demonstra paridade. As dez compras com ajustes em PROD não têm equivalentes reais no DEV.

- Migrações registradas: **139 no DEV e 111 no PROD**. Por **nome**, existem **40 somente no DEV** e **12 somente no PROD**; algumas equivalem a versões publicadas com nomes diferentes, outras podem ser efetivamente distintas. **Não executar `supabase db push`/sincronização automática sem reconciliação e revisão das dependências.**
- A consulta no PROD foi apenas SELECT para baseline agregado; **não houve migração, DDL, DML, escrita de Storage ou restauração em PROD**.
- Script reproduzível e testado no DEV: [`docs/sql/preview85-readonly-prod-snapshot.sql`](sql/preview85-readonly-prod-snapshot.sql). Executar no PROD **imediatamente antes/depois** da janela aprovada, com gravações pausadas, armazenando saídas em local protegido. Divergências não explicadas são **NO-GO**. O script não substitui backup.

### Verificação adicional de ajustes reais (SELECT no PROD)

- Script: [`docs/sql/preview85-prod-adjustments-integrity-readonly.sql`](sql/preview85-prod-adjustments-integrity-readonly.sql).
- PROD: **10 ajustes parciais**, **120 referências de linhas ajustadas**, **zero vínculos ausentes** a compra/pedido/pagamento/linha, **zero diferenças** na identidade `original_cents - refund_cents = remaining_cents`, zero campos monetários nulos e zero JSONs de linhas/entradas com tipos inválidos.
- DEV: zero ajustes reais, portanto não é um teste comparativo dos dez casos de PROD.
- Essa verificação é somente **integridade referencial/aritmética básica**, não garante que o rateio, lançamentos ou reembolsos sejam interpretados da mesma maneira pelo código novo.

### Decisão operacional — seguir sem ambiente isolado (13/11/2026)

O usuário optou por **não contratar/criar uma branch ou projeto adicional de homologação**. A tentativa de criação exigiu uma confirmação adicional de custo e **não criou ambiente**. Portanto:

- **Não** executar migrações em PROD para simular seu resultado; **não** sobrescrever DEV, criar contas de teste em PROD, copiar dados reais ou iniciar uma restauração.
- Continuar apenas com revisões estáticas, testes de código/CI, consultas **SELECT** em DEV/PROD, preparação de backup e uma rodada de homologação autenticada na Preview.
- A ausência de ensaio das migrações sobre um esquema correspondente ao PROD **permanece um risco residual material**; não pode ser compensada somente com os 612 testes de JavaScript. A decisão de não criar ambiente **não equivale à aprovação do deploy**.

**Pré-verificação repetível:** [`docs/sql/preview85-preflight-schema-readonly.sql`](sql/preview85-preflight-schema-readonly.sql), executada com sucesso em DEV e PROD, sem escritas:

| Verificação | DEV | PROD |
|---|---:|---:|
| Funções esperadas na versão final da #85 | 23 | 23 |
| Funções ausentes | 0 | **22** |
| Tabelas de Compras verificadas | 14 | 14 |
| Tabelas verificadas sem RLS | 0 | 0 |
| Políticas do conjunto de Compras | 27 | 27 |

As **24 de 27** políticas de Compras com mesmo nome possuem regras distintas entre DEV e PROD; essas alterações são compatíveis com as otimizações de RLS da #85, mas exigem revisão de autorização antes de eventual implantação. **Não há evidência de paridade real de permissões após migração no PROD**.

Testes negativos de permissão por consultas read-only com troca de papel local: papel `anon` recebeu erro de acesso à tabela `supply_purchases` em ambos; `authenticated` sem identidade de usuário retornou **zero** registros de compras, pagamentos, anexos, obras e documentos de obras nos dois. São controles básicos, **não** testes de perfis reais e não garantem permissão correta para cada usuário.

**Restrições e gates mantidos:** sem cópia isolada, não há teste da aplicação das migrações nem de reversão de esquema. Backup **restaurável** do banco e **arquivos físicos** do Storage continuam sem confirmação; não há homologação autenticada do fluxo completo. Necessária **autorização separada e expressa antes de qualquer publicação em PROD**, com ciência do risco residual e plano de recuperação. O status continua **NO-GO**.

### Validação estrutural ampliada — somente consultas (13/11/2026)

- Das **18 tabelas principais** de Compras, Obras e Financeiro,
  DEV e PROD possuem **321 definições de coluna** equivalentes, e **230
  constraints** (chaves, checks e integridade referencial) equivalentes.
- Índices dessas tabelas: **92 no DEV / 88 no PROD**; os **quatro extras**
  no DEV são os índices fiscais criados pela #85; os 88 demais coincidem.
- Revisão estática das 26 migrações: foram identificadas **26 relações
  referenciadas por nome**, todas encontradas no PROD. Isso não garante
  que a execução SQL completa seja compatível nem que as permissões
  pós-migração funcionem.
- 15 nomes de funções auxiliares foram identificados em referências;
  as funções atualmente compartilhadas entre os ambientes não
  apresentam divergências de assinatura, resultado ou atributo
  SECURITY DEFINER. As auxiliares ausentes de PROD ainda serão criadas
  pela sequência de migrações.
- Verificação read-only de Storage:
  **653/653** anexos ativos de Compras, **6/6** anexos ativos de
  Cotações e **1.010/1.010** documentos de Obras em PROD possuem
  metadados de objeto correspondentes. Não prova bytes existentes,
  downloads funcionais nem recuperação de arquivos.
- Script de integridade do Storage, testado em DEV e PROD:
  [`docs/sql/preview85-storage-links-integrity-readonly.sql`](sql/preview85-storage-links-integrity-readonly.sql).
  Gera também fingerprint de vínculos por tipo para comparação
  pré/pós-publicação, sem mostrar nomes de arquivos.
- Script que captura as **27 definições de política e o helper
  original da PROD** (somente leitura, validado em DEV/PROD):
  [`docs/sql/preview85-rollback-rls-source-readonly.sql`](sql/preview85-rollback-rls-source-readonly.sql).
  Guardar seu resultado **fora do GitHub** em local protegido. Ele é
  fonte para recuperação DBA, não SQL de rollback executável.
- Ordem condicionada, **sem autorização para executar**:
  [`docs/preview-85-controlled-migration-sequence.md`](preview-85-controlled-migration-sequence.md).
  Quatro blocos de 4 + 3 + 17 + 2 migrações, com gates de
  autorização, disponibilidade e paridade financeira.

## Gate 1 — Compatibilidade das migrações (BLOQUEADO)

- [ ] Inventariar esquemas e dependências de `public`, `app`, `private` e políticas RLS de PROD, comparando com a origem histórica das 26 migrações.
- [ ] Reconciliar os **40 nomes DEV-only / 12 nomes PROD-only**, identificando renomes/equivalências sem manipular indevidamente `supabase_migrations.schema_migrations`.
- [ ] Criar um **ambiente isolado com esquema PROD real**; quando necessário, massa representativa sanitizada contendo ajustes parciais, compras multi-loja, comprovantes e documentos de obras. Não utilizar o DEV existente como destino de sobrescrita.
- [ ] Aplicar **exclusivamente as migrações aprovadas** na ordem correta, em teste; validar scripts de reversão quando viáveis e documentar passos irreversíveis.
- [ ] Testar após cada grupo as políticas RLS (usuário autorizado, usuário restrito e sem autorização) e 10 cenários de ajuste parcial, incluindo rateios e somas de centavos.
- [ ] Comparar resultados financeiros legados com RPCs shadow: divergência ou `is_complete=false` impede a promoção.

**Custo e autorização:** um branch/projeto Supabase separado pode gerar cobrança de compute, disco, tráfego e Storage. A criação requer autorização específica antes de incorrer no custo. Branches Supabase não incluem dados de PROD por padrão; a opção de incluir dados depende de configuração/recursos e aumenta os cuidados de segurança. Nada disso foi criado nesta etapa. Documentação: https://supabase.com/docs/guides/deployment/branching/dashboard e https://supabase.com/docs/guides/platform/manage-your-usage/branching

## Gate 2 — Recuperação real (BLOQUEADO)

- [ ] Confirmar em **Database → Backups** do projeto PROD a data/hora e o ponto de recuperação aplicável; confirmar elegibilidade e período de retenção. Não inferir que um arquivo/migração com prefixo `backup_` seja um backup restituível.
- [ ] Garantir recuperação em **ambiente isolado** (não restaurar PROD para provar que a restauração funciona).
- [ ] Planejar backup/exportação independente dos **objetos físicos do Storage** e validar leitura de arquivos de teste restaurados. Backup do PostgreSQL inclui metadados mas **não os bytes dos arquivos no Storage**.
- [ ] Registrar responsável, local seguro, horário, integridade e janela aceitável de perda de dados (RPO/RTO). Se a recuperação falhar, **NO-GO**.

Referência oficial: https://supabase.com/docs/guides/platform/backups

### Comparação de acesso com os 13 perfis ativos do PROD (read-only)

Foi simulada, **sem gravar no banco**, a projeção da nova função
`private.readable_supply_purchase_ids_for` contra a função atualmente
instalada `app.can_read_supply_purchase`, mantendo o mesmo `auth.uid()`
por perfil e percorrendo as **87 compras**. Resultado: **zero
ampliações ou perdas previstas** nos 13 perfis examinados (7 tinham 87/87
compras; 6 tinham 0/87).

Comparação análoga entre
`app.can_store('finance','document_audit_view', store)` e a regra nova
`private.readable_store_ids_for('finance.document_audit_view')`, com o
gate `app.can('finance','view')`: **13 perfis × 28 lojas**, também com
**zero ampliações ou perdas previstas**. Um perfil tinha acesso a 28/28
lojas; os outros 12, a 0/28. Não havia overrides ativos de **grant
por loja** para as permissões analisadas; regras de bloqueio/concessão
globais foram consideradas.

**Escopo limitado:** as consultas foram executadas como leitura
administrativa com contexto `auth.uid()` simulado, sem login real
no navegador. Esses 13 perfis atuais não exercitam cenários futuros
de acesso apenas a parte das lojas. Nenhuma função ou política foi
alterada em PROD; o resultado **não substitui** homologação após
migrações.

Checklist de interface com critérios de aceite:
[`docs/preview-85-browser-homologation-checklist.md`](preview-85-browser-homologation-checklist.md).
Os itens de navegador continuam pendentes até teste autenticado real.

## Gate 3 — Homologação com login real (BLOQUEADO)

Em uma única rodada de testes autenticados na Preview #85, com dados preparados e perfis legítimos:

- [ ] Acessar Dashboard (visões gerencial/financeira) e comparar os totais exibidos com fonte canônica.
- [ ] Financeiro → Pagamentos, Conciliação, Pagos/A pagar, Reembolsos: filtros por loja/status, totais, exportações.
- [ ] Compras: CMP compartilhada entre lojas, pedidos parcelados, fretes, **cancelamento parcial com reembolso e linha omitida de paginação** (regressão da `main`).
- [ ] Obras: pagamento, anexação, abertura e download de recibo/nota; documento com metadados sem caminho no Storage deve sinalizar falta.
- [ ] Conferência de Compras e Obras: documentos fiscais em outras referências (possível duplicidade, não identidade comprovada); abrir arquivo, exportar Excel e ZIP; falha de consulta deve bloquear relatório incompleto.
- [ ] Verificar que usuário sem permissão de Conciliação/Administração/Conferência não acessa dados protegidos.
- [ ] Testar tempo de carregamento, volume e fluxo completo no navegador; registrar evidência sem compartilhar CPF ou dados sensíveis.

O CI **não** substitui essa homologação nem a validação de abertura de URL assinada em sessão real.

## Gate 4 — Publicação controlada e reversão (BLOQUEADO)

- [ ] Agendar janela e orientar usuários a interromper gravações; conferir backup e baseline antes da primeira mudança.
- [ ] Verificar conexões Netlify e os refs DEV/PROD. A Preview não deve apontar para produção.
- [ ] Executar somente migrações aprovadas e testadas, observando permissões e integridade. Se ocorrer erro, **interromper**, não tentar automaticamente tudo de novo.
- [ ] Publicar código compatível após o esquema estar pronto, validar telas/exports com dois perfis, depois liberar gravações.
- [ ] Reexecutar o SQL read-only de baseline e comparar com o pré-release. Totais podem variar legitimamente se houver novas gravações; por isso é necessária janela controlada.
- [ ] Se falha no código: reverter deploy de frontend. **Isso não reverte migrations.**
- [ ] Se falha de esquema ou dados: executar plano específico de recuperação aprovado, com entendimento de indisponibilidade e perda de transações; **nunca restaurar PROD automaticamente**.
- [ ] Monitorar erros de carregamento, RLS, finanças, anexos e logs; encerrar janela apenas com critérios aprovados.

## Critérios objetivos para liberar

**GO** somente com: compatibilidade das migrações demonstrada em cópia isolada; backup de banco e Storage verificável; 100% de checks CI e Preview verdes no HEAD; paridade financeira aprovada nos casos reais e sintéticos; login real homologado; plano de reversão e responsável definidos.

**Estado desta revisão:** os conflitos de Git foram resolvidos e CI de integração passou; os Gates 1–4 ainda **não** foram atendidos integralmente. **PROD continua intacto.**

## Revisão adicional — permissões e incidentes observados em PROD (13/11/2026)

**Escopo e limites:** apenas consultas de leitura em PostgreSQL e logs das últimas 24 horas. Nenhuma configuração ou dado alterado; números de HTTP e PostgreSQL são fontes distintas, sem correspondência 1:1 entre os eventos.

- GitHub Actions Quality do HEAD `af3b131d324bddc8f017ebd85298f9c8c7fe17d4`: execução [#43366495592](https://github.com/Ernands/Orcamento_Compra_Entrega_V2/actions/runs/43366495592) concluída com **sucesso**; jobs Tests, Lint, Typecheck e Build aprovados. Netlify Preview do mesmo HEAD com status `success`.
- Em PROD nos logs Supabase: **4.265 requisições HTTP** no recorte; **147 respostas 500** (65 em `supply_purchase_attachment_stores`, 47 em `supply_purchase_destinations`, 26 em `supply_purchase_attachments`, 9 em `supply_purchase_items`). Os logs PostgreSQL contêm **152 ocorrências 57014 / statement timeout**. As respostas 500 dessas quatro rotas tiveram tempo de origem médio aproximado de 8,5–8,7 segundos. Os números são evidência de gargalo ainda presente em produção, **não** prova de que a Preview já eliminou os timeouts.
- Comparação de RLS: as políticas `supply_purchases_read_scoped`, `supply_purchase_stores_read_scoped` e as políticas de auditoria estão mais agregadas no DEV que na PROD, como previsto no escopo da #85; não é demonstração suficiente de equivalência para perfis reais. Nenhuma mudança de política foi aplicada à PROD.
- Script adicional de segurança **somente leitura**: [`docs/sql/preview85-authorization-surface-readonly.sql`](sql/preview85-authorization-surface-readonly.sql), testado tanto em DEV quanto em PROD. Verifica simultaneamente USAGE do schema + EXECUTE nas 23 funções esperadas, presença de RLS em 14 tabelas e grants anônimos, sem expor conteúdo de documentos.
- **Resultado DEV:** 23/23 funções presentes; nenhuma das esperadas chamável por `anon`; 14 RPCs públicas disponíveis a `authenticated`, todas `SECURITY INVOKER`; nenhuma das 2 auxiliares privadas acessível a `authenticated`; 14/14 tabelas com RLS e nenhuma com SELECT concedido diretamente a `anon`. **PROD:** 1/23 funções presentes, 22 ainda faltantes; 14/14 tabelas com RLS; nenhuma das funções presentes da lista permite `anon`. Ausência de funções em PROD é esperado antes do deploy, não autorização para executá-las.
- Em ambos, permanecem **42 funções SECURITY DEFINER em `public` executáveis pelo papel `authenticated`**. São alertas de superfície existente: revisar checagem de autorização *por função* antes de qualquer endurecimento, porque revogar indiscriminadamente pode quebrar operações de negócio.

**Gates inalterados (NO-GO):** backup realmente restaurável (banco + bytes físicos do Storage), compatibilidade/ordem das 26 migrations e histórico divergente DEV/PROD, homologação com sessão real e autorização separada para produção. O usuário decidiu seguir sem ambiente isolado adicional, portanto o risco de não ensaiar as migrations sobre o esquema de PROD permanece explícito.

## Continuação — inventário de migrações e baseline de consultas (13/11/2026)

- **CI anterior:** Quality #920 no commit `2041ef5` foi concluído com sucesso; Netlify Preview #85 também reportou sucesso para esse commit. Os commits documentais posteriores requerem novo CI antes de promover. PR #85 permanece draft.
- **Histórico nominal:** 139 migrations DEV / 111 PROD / 99 nomes comuns; 40 nomes exclusivos DEV = **14 antigos + 26 novos da #85**, contra 12 exclusivos PROD. Inventário nominal completo em [reconciliação de histórico](preview-85-migration-history-reconciliation-2026-11-13.md). Os 14 legados incluem proteções financeiras e de ajustes; os 12 PROD-only incluem alterações funcionais e snapshots. Igualdade de nomes não prova igualdade de SQL, nem diferenças de nomes provam funcionalidade ausente.
- **Baseline reproduzível:** [`docs/sql/preview85-pgstat-purchase-read-baseline.sql`](sql/preview85-pgstat-purchase-read-baseline.sql) validado via SELECT no Supabase DEV e PROD. Os números são **acumulados desde o último reset do pg_stat_statements** e devem ser comparados por deltas, não como latência de tela.
- **PROD — médias ponderadas históricas** das consultas PostgREST correspondentes: `supply_purchase_destinations` 3.099,46 ms (3.640 chamadas), `supply_purchase_items` 3.384,21 ms (1.765), `supply_purchase_attachment_stores` 3.695,68 ms (1.605), `supply_purchase_attachments` 2.868,62 ms (1.751). Extremos em torno de 8 segundos. Os logs recentes também apontaram 152 `statement_timeout` e 147 HTTP 500 no recorte anterior.
- **DEV — médias ponderadas históricas:** destinos 53,37 ms (15 chamadas); itens 30,12 ms (21); vínculos de anexos 48,38 ms (18); anexos 27,41 ms (18). **Não concluir que a #85 produzirá essa velocidade em PROD:** massas, RLS atual, intensidade de uso e período de estatísticas são diferentes.
- **Próxima necessidade técnica:** benchmark com sessão autenticada e dados representativos, com registro de número de queries, bytes transportados, número de linhas, tempo p50/p95 e timeout por módulo. Os read models financeiros da #85 permanecem `shadow`, sem substituição das somas canônicas.

**Decisão:** Produção continua **NO-GO** até recuperação real validada, reconciliação das migrações e homologação autenticada. Nenhuma alteração em dados/estrutura de PROD nesta continuidade.

## Evidência incremental de pré-publicação — 13/11/2026 (rodada final)

- O HEAD `b6827c2` passou em Quality #43370441115 e Netlify Preview com `success`; nenhum merge ocorreu. **O CI do commit de documentação mais recente deve ser checado novamente.**
- Consultas SELECT repetidas em PROD confirmaram 10 ajustes, 120 linhas referenciadas e nenhum erro nas invariantes consultadas; anexos com metadados encontrados: Compras 653/653, Cotações 6/6, Obras 1.011/1.011. Esses resultados não garantem backup dos bytes de Storage.
- Conferência de histórico × SQL: 130 arquivos versionados, 139 migrations no DEV e 111 no PROD; nomes antigos e *versões* divergem. 17 nomes DEV e 11 nomes PROD não estão presentes como arquivos de mesmo nome no repositório, enquanto as 26 migrations da PR estão versionadas. Quatro outros SQLs legados estão sem registro de mesmo nome no PROD; principais funções de reembolso/auditoria/financeiro já apresentam hash igual nos bancos. **Não tentar sincronizar tudo.**
- O DEV tem 54/26/954 linhas nas três tabelas `purchase_delivery_items`, `purchase_delivery_destinations`, `purchase_delivery_cells`, inexistentes no PROD; não confundir esse conjunto anterior com as 26 migrations novas.
- Revisão estática dos 26 arquivos concluiu que Bloco A altera várias policies RLS, Bloco B contém `ALTER POLICY` sobre duas policies presentes em ambos e Blocos C/D são predominantemente RPCs de leitura/índices. Sem ensaio em cópia do esquema PROD e sem login real, os gates 1–4 permanecem BLOQUEADOS.
- [Registro completo e reproduzível desta rodada](preview-85-final-preflight-evidence-2026-11-13.md). **Nenhuma migração ou dado de PROD foi modificado.**

## Backup da organização Free — revisão confirmada em 13/11/2026

A consulta `get_organization` identificou o plano Supabase **Free**, o qual não recebe a rotina de backup automático diário descrita para Pro/Team/Enterprise. Backup verificado: **não**. O inventário SELECT do PROD indicou **17** contas `auth.users`, **17** usuários em `public.usuarios`, cinco buckets, dos quais quatro têm no total **2.052** objetos de Storage (metadados somam **354.163.344 bytes**). Não confundir este inventário com backup físico ou funcional. O dump padrão da Supabase CLI omite schemas `auth` e `storage`; exigir cobertura específica, objetos físicos e prova de recuperação.

[Runbook para backup manual do plano Free](preview-85-free-plan-backup-and-recovery-runbook-2026-11-13.md) preparado com comandos de exportação e cuidados de autenticação/Storage. **Nenhuma exportação foi realizada** por esta investigação. O Gate 2 segue BLOQUEADO, com prioridade máxima antes da liberação.
