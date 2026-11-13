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
