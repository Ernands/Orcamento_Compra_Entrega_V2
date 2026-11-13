# Implanta 27 — recuperação antes da Preview #85 (Supabase Free)
**13/11/2026 — RUNBOOK, NÃO EXECUTADO.** Este documento não autoriza migração ou restauração em PROD. **Nenhum backup foi criado por este chat.**

## Por que isto bloqueia o release
Consulta oficial da organização Supabase que hospeda DEV e PROD: plano **Free**. Documentação atual: backups automáticos diários estão disponíveis nos planos **Pro/Team/Enterprise**; o plano Free deve fazer exportação independente via CLI. Não presumir um ponto restaurável no painel sem evidência. Fontes:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/storage/management/download-objects

**Inventário agregado PROD (SELECT, sujeito a mudanças durante uso normal):**

| Componente | Contagem | Bytes reportados nos metadados |
|---|---:|---:|
| `purchase-attachments` | 808 | 39.288.828 |
| `quote-attachments` | 7 | 10.035.595 |
| `store-attachments` | 8 | 8.118.019 |
| `works-documents` | 1.229 | 296.720.902 |
| **Total de arquivos com metadados** | **2.052** | **354.163.344 (~354 MB)** |
| Buckets cadastrados | 5 | (4 têm objetos no snapshot) |
| Usuários em `auth.users` | 17 | Não são arquivos |
| Usuários em `public.usuarios` | 17 | Dados de banco |

**Estes tamanhos são valores de metadados, não uma verificação dos bytes efetivamente baixados.** O inventário dos documentos ativos de Compras (653), Cotações (6) e Obras (1.011) é um **subconjunto** dos objetos; exportar só os ativos omite histórico que pode ser necessário à auditoria.

## Etapa 1 — preparo local e controles de segurança
1. Definir responsável pelo backup, destino protegido com espaço livre, prazo de execução, horário, janela sem escritas, criptografia, retenção e teste de restauração. Evitar máquinas compartilhadas.
2. No Windows, instalar **Supabase CLI** compatível e **Docker Desktop**, seguindo os links oficiais. Conferir `supabase --version` e `supabase db dump --help` (na CLI v3 o alvo remoto explícito é `--remote`; versões anteriores diferem).
3. No projeto Supabase PROD `vskvsujhpinanthxewab`, abrir **Connect** e confirmar o alvo. Não passar senha, URI com senha, token, chave S3, CPF ou arquivo financeiro no chat, nos commits, nas Actions ou na PR.
4. Jamais executar `db push`, `migration repair`, `db reset`, operações de restauração ou comandos que alterem PROD como parte deste backup. **Exportação é leitura.**
5. Se o acesso exigir string com senha, fornecê-la apenas na estação administrada de forma privada, sem gravar a senha em logs, arquivos versionados ou comandos persistentes do histórico.

## Etapa 2 — exportar banco e histórico de migrações
Com Supabase CLI v3 e autenticação local apropriada, em pasta **privada e fora do checkout GitHub**, verificar as opções no `--help` e iniciar por:

```powershell
supabase db dump --remote=vskvsujhpinanthxewab -f roles.sql --role-only
supabase db dump --remote=vskvsujhpinanthxewab -f schema.sql
supabase db dump --remote=vskvsujhpinanthxewab -f data.sql --use-copy --data-only
supabase db dump --remote=vskvsujhpinanthxewab -f history_schema.sql --schema supabase_migrations
supabase db dump --remote=vskvsujhpinanthxewab -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

Verificar códigos de saída, integridade e conteúdo dos arquivos (não aceitar arquivos vazios). Documentar versão do CLI e do PostgreSQL.

**Alerta crucial:** o dump padrão da CLI **exclui esquemas gerenciados como `auth` e `storage`**. Os arquivos acima **não são, sozinhos, uma cópia completa recuperável da plataforma**. O procedimento final de proteção deve contemplar também:
- Identidades em `auth.users` e personalizações de schemas gerenciados, inclusive políticas/triggers (há 17 contas no inventário). Validar método de migração/restauração com a documentação oficial e um DBA; não copiar senhas ou tokens para arquivos não protegidos.
- Objetos de Storage **físicos**, metadados de `storage.objects` / `storage.buckets`, e os buckets (ver etapa 3).
- Edge Functions, variáveis de ambiente, configurações Auth e regras de acesso que uma exportação PostgreSQL não recupera automaticamente.
- Histórico original `supabase_migrations`: preservar como evidência, **não sincronizar nem aplicar de volta ao PROD** sem estudo de dependências.

## Etapa 3 — copiar objetos físicos de Storage
1. Listar todos os cinco buckets e copiar **todos** os objetos necessários, preservando caminhos, nomes, buckets e tamanho. A referência agregada desta leitura é 2.052 objetos e ~354 MB nos quatro buckets não vazios.
2. Utilizar cliente S3 compatível com Supabase Storage (rclone, Cyberduck ou AWS CLI) ou `supabase storage` com `--remote`, conforme opções atuais. O Supabase documenta ambas as alternativas:
   https://supabase.com/docs/guides/storage/management/download-objects
3. Guardar credenciais S3 em gerenciador de segredos e nunca incluir em repositório/artefatos de CI. Preferir credenciais de menor privilégio quando disponíveis e revogar credenciais temporárias ao final.
4. Conferir inventário por bucket, tamanho total, seleção de hashes e abertura efetiva de amostras de PDF/imagens/documentos. **Metadados 1:1 não provam a existência dos bytes.**
5. Proteger cópia criptografada em mídia/local independente da conta Supabase.

## Etapa 4 — prova de restauração, sem tocar a produção
- Restaurar arquivos SQL e dados/usuários cobertos pelo plano em ambiente **isolado**, idealmente PostgreSQL/Supabase local descartável ou projeto aprovado para ensaio. Não usar DEV como alvo de sobrescrita.
- Validar schemas, funções, grants, 17 identidades, políticas, vínculos, contagens, 10 ajustes financeiros e documentos. Restaurar amostra real dos objetos físicos em ambiente seguro e testar abertura.
- Registrar RPO/RTO, diferença entre snapshot e momento de teste, códigos de erro, tempo de recuperação e medidas restantes. O simples sucesso do `db dump` não basta para declarar backup restaurável.
- Para uma janela real de release: pausar **gravações**, obter cópia final e conferir fingerprints financeiros/Storage no mesmo intervalo. Restaurar sobre produção **somente** por processo de incidente aprovado.

## Estado do gate
**Não comprovado:** arquivos de dump criados, download integral de Storage, cobertura Auth/Storage, restauração de ensaio, responsável/janela. Portanto **NO-GO**.

Como a atual conversa não tem uma sessão de terminal com CLI/Docker e credenciais de banco, não é possível executar nem certificar esses procedimentos aqui. O projeto continua sem alterações pela preparação deste runbook.

## Manifesto automatizado para comparação pré/pós

Foi criado e **testado por SELECT em DEV/PROD** o script [`docs/sql/preview85-backup-coverage-manifest-readonly.sql`](sql/preview85-backup-coverage-manifest-readonly.sql). Retorna apenas contagem de usuários Auth/app, buckets, quantidade e bytes declarados de objetos por bucket, sem dados pessoais nem caminhos de arquivos.

**Observação de volatilidade real:** a primeira consulta ao PROD encontrou **2.052 objetos (354.163.344 bytes declarados)**. Uma nova leitura da mesma base durante esta preparação apontou **2.053 objetos (354.360.522 bytes declarados)**, com um novo objeto em `works-documents`. Isso pode representar atividade normal de usuários, não uma exclusão/erro da PR. **Não comparar snapshots de horários diferentes como prova de equivalência**; o snapshot de release exige pausa de gravações e registro dos resultados no mesmo intervalo.

Nenhuma das duas leituras criou backup, baixou arquivo ou alterou a produção. Registros/fingerprints devem ser guardados fora do GitHub, em local seguro.
