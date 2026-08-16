# Plano Mestre V2

Produto: **Implanta 27 Implantacao, Compra & entrega**

Status: proposta para aprovacao. Esta rodada nao implementa telas, banco, autenticacao, storage, Netlify ou Supabase operacional.

## 1. Decisao central

A V2 deve ser reconstruida do zero sobre:

- GitHub como repositorio;
- Netlify para frontend, deploys e previews;
- React + TypeScript, preferencialmente Vite;
- Supabase para PostgreSQL, Auth, RLS, Storage e funcoes quando necessarias.

Decisoes negativas ja aprovadas:

- nao usar Vercel;
- nao usar Google Apps Script como backend;
- nao usar Google Sheets como banco operacional;
- nao usar Google Login;
- nao converter `Code.gs` para Supabase;
- nao reproduzir estruturas tecnicas criadas por limitacoes de planilha.

## 2. Objetivo da V2

Reconstruir o dominio do sistema atual com uma arquitetura relacional, segura, testavel e responsiva, preservando as regras funcionais maduras do legado e eliminando o acoplamento com Sheets/Apps Script.

O sistema deve controlar:

- implantacao das 27 lojas;
- checklist mestre e checklists por loja;
- atividades, bloqueios, pendencias, comentarios, timeline e auditoria;
- itens e necessidades como experiencia unica;
- cotacoes, propostas agrupadas, aprovacoes, compras e entregas;
- anexos e evidencias em multiplos contextos;
- financeiro integrado a implantacao e compras;
- reembolsos ao banco custeador;
- usuarios, perfis, permissoes e acesso por loja.

## 3. Mudancas principais em relacao ao legado

- Dashboard principal passa a ser Implantacao.
- Dashboard de Suprimentos continua existindo, mas como modulo proprio.
- Loja deve abrir por padrao na aba Implantacao.
- Loja tera abas: Implantacao, Resumo e Necessidades, Anexos.
- Itens e Necessidades devem virar uma experiencia funcional unica na UX, ainda que permaneçam entidades separadas no banco.
- Checklist Mestre passa a ser administravel pelo Administrador, com versionamento real.
- CPF + senha substitui Google Login.
- Perfis iniciais: Administrador, Prospector, Consulta.
- Autorizacao nao deve ser hard-coded no frontend.
- Arquivos devem ser privados, com metadados relacionais e anexos por contexto.
- Financeiro entra como modulo estrutural, ligado a loja, implantacao, compras, documentos, pagamentos e reembolsos.

## 4. Arquitetura recomendada

### Frontend

React + TypeScript + Vite.

Justificativa:

- o legado ja usa React/TypeScript/Vite com boa responsividade;
- Netlify hospeda SPAs Vite sem exigir Next.js;
- Next.js adicionaria complexidade que nao e requisito nesta fase;
- a aplicacao e majoritariamente operacional, autenticada e orientada a dados.

Estrutura sugerida:

```text
src/
  app/
    providers/
    routes/
    shell/
  components/
    ui/
    layout/
  features/
    dashboard/
    implantation/
    stores/
    supplies/
    quotes/
    purchases/
    financial/
    files/
    access/
  domain/
  data/
    repositories/
    supabase/
    queries/
  hooks/
  lib/
  tests/
```

### Backend e dados

- Supabase PostgreSQL como fonte oficial.
- RLS habilitado desde a primeira migration.
- CRUD simples via Supabase Client + RLS.
- Operacoes transacionais criticas via PostgreSQL Functions/RPC.
- Edge Functions/Netlify Functions apenas quando houver necessidade real de segredo, rate limit, integracao externa ou fluxo de autenticacao.

### Deploy

- GitHub -> Netlify.
- Ambientes: Local, Preview, Production.
- Supabase DEV separado de Supabase PROD.
- Migrations versionadas no Git em `supabase/migrations/`.
- Seeds de desenvolvimento em `supabase/seed.sql`.

## 5. Estrategia CPF + senha recomendada

Recomendacao: **Supabase Auth como motor de senha/sessao/JWT + funcao segura de login por CPF**.

Resumo:

- usuario digita CPF + senha;
- CPF e normalizado e validado;
- uma Edge Function ou Netlify Function aplica rate limit, verifica bloqueio e busca o `auth_user_id`/identificador interno por CPF em tabela protegida;
- a funcao autentica contra Supabase Auth usando identificador tecnico interno, nao CPF como email publico;
- Supabase Auth emite JWT/session;
- RLS usa `auth.uid()` para localizar o usuario interno e permissões;
- senha nunca e armazenada manualmente em tabela de negocio.

Ver detalhes e alternativas em [V2_AUTH_CPF.md](./V2_AUTH_CPF.md).

## 6. Modelo de autorizacao

Autorizacao deve ser orientada a dados:

- `usuarios`
- `perfis`
- `permissoes`
- `perfil_permissoes`
- `usuario_permissoes`
- `usuario_lojas`

Permissoes devem suportar:

- modulo;
- acao;
- loja;
- concessao individual;
- revogacao individual;
- leitura, criacao, edicao, exclusao, aprovacao, reabertura, administracao.

Frontend pode esconder menus, mas autoridade final deve ser RLS e/ou RPC.

## 7. Estrategia RLS

Todas as tabelas acessiveis pelo frontend devem ter RLS.

Padroes:

- `auth.uid()` aponta para `usuarios.auth_user_id`;
- funcoes SQL estaveis verificam permissao e escopo de loja;
- policies de leitura filtram por modulo + loja;
- policies de escrita validam acao especifica;
- operacoes criticas ficam em RPC `security definer` com validacao explicita e auditoria;
- `raw_user_meta_data` nao deve ser fonte de autorizacao.

Ver detalhes em [V2_AUTHORIZATION_AND_RLS.md](./V2_AUTHORIZATION_AND_RLS.md).

## 8. Banco PostgreSQL

Principios:

- UUID como PK interna;
- `codigo_negocio`/`codigo_legado` unico quando agregar valor;
- FKs reais;
- constraints reais;
- indexes por loja, status, datas, responsavel e relacoes de escopo;
- soft delete quando historico importar;
- auditoria tecnica separada;
- transacoes reais para operacoes compostas.

Ver entidades, campos e ERD em [V2_DATABASE_MODEL.md](./V2_DATABASE_MODEL.md).

## 9. Arquivos e Storage

Recomendacao:

- Supabase Storage com buckets privados;
- metadados relacionais em `arquivos`;
- vinculos em `arquivo_vinculos` para loja, atividade, compra, despesa, reembolso, cotacao, proposta etc.;
- thumbnails/previews gerados sob demanda ou por funcao;
- URLs assinadas com expiracao curta;
- RLS tambem em `storage.objects`;
- nunca carregar binarios completos ao abrir uma loja.

Ver detalhes em [V2_FILES_AND_STORAGE.md](./V2_FILES_AND_STORAGE.md).

## 10. Financeiro

Financeiro deve controlar previsto, aprovado, contratado, comprado, pago, reembolsavel, solicitado, em analise, aprovado para reembolso, reembolsado, diferenca e pendencias.

Nucleos:

- despesas por loja;
- vinculo com implantacao, compra e documentos;
- pagamentos;
- reembolsos;
- conciliacao;
- documentos financeiros/anexos;
- auditoria.

Ver desenho em [V2_FINANCIAL.md](./V2_FINANCIAL.md).

## 11. Migracao

Nao migrar dados nesta rodada.

Plano:

1. extrair dados do Google Sheets/sistema legado;
2. transformar para modelo relacional;
3. validar em staging/DEV;
4. reconciliar contagens, IDs, relacoes, status, datas e historico;
5. carregar DEV;
6. testar;
7. congelar legado;
8. carga final;
9. corte.

Ver [V2_DATA_MIGRATION.md](./V2_DATA_MIGRATION.md).

## 12. Matriz de operacoes criticas

| Operacao | Mecanismo recomendado | Justificativa |
|---|---|---|
| Login CPF + senha | Edge Function ou Netlify Function + Supabase Auth | CPF exige normalizacao, rate limit e bloqueio antes da emissao de sessao. |
| CRUD simples de lojas/itens/fornecedores | Supabase Client + RLS | Relacional simples, sem segredo e com policies suficientes. |
| Iniciar implantacao | PostgreSQL Function/RPC | Cria ciclo, snapshots de atividades, timeline, auditoria e idempotencia em uma transacao. |
| Atualizar atividade | RPC | Precisa validar transicao, progresso, permissao, versionamento, timeline e auditoria juntos. |
| Bloquear/desbloquear atividade | RPC | Evita bloqueio duplicado e garante evento + auditoria atomicamente. |
| Reprogramar inauguracao | RPC | Atualiza loja, ciclo e atividades elegiveis preservando datas originais. |
| Publicar Checklist Mestre | RPC | Fecha versao, calcula checksum, impede alteracao destrutiva e audita. |
| Criar proposta agrupada | RPC | Deriva quantidades e escopo das necessidades no banco, calcula totais e evita conflito. |
| Selecionar proposta | RPC | Atualiza proposta e necessidades vinculadas em transacao, detectando conflito. |
| Criar compra a partir de proposta | RPC | Gera compra/itens/financeiro inicial de forma atomica. |
| Registrar pagamento | RPC | Afeta financeiro, auditoria, anexos e status de despesa. |
| Solicitar reembolso | RPC | Agrupa despesas/documentos, valida elegibilidade e cria evento financeiro. |
| Upload binario | Supabase Storage direto + registro via RPC curta | Upload usa Storage privado; metadados/vinculo/auditoria precisam consistencia. |
| Gerar signed URL/thumbnail | Edge Function ou RPC + Storage API | Evita expor paths indevidos e permite controle de expiracao. |

## 13. Decisoes a confirmar

| Decisao | Contexto | Alternativas | Recomendacao | Impacto |
|---|---|---|---|---|
| Funcao de login CPF em Supabase Edge ou Netlify Function | Ambas podem guardar segredos | Edge Function fica proxima do Supabase; Netlify centraliza backend web | Preferir Edge Function para auth/RLS e Netlify Functions apenas se houver integracao Netlify-especifica | Define deploy de auth e rate limit. |
| Recuperacao de senha inicial | CPF nao e canal de recuperacao | Reset por admin, email cadastrado, SMS/WhatsApp externo | Fase 1: reset por admin; evoluir para email/SMS validado | Evita improvisar recuperacao insegura. |
| Uso de enums Postgres vs tabelas de dominio | Status precisam governanca | Enums para invariantes; tabelas para configuraveis | Enums para status centrais, tabelas para categorias/editaveis | Afeta migrations e flexibilidade. |
| Ordem exata de Suprimentos vs Arquivos | Arquivos sao base para evidencias e financeiro | Implementar arquivos antes ou depois de Implantacao | Arquivos basicos antes de atividades de campo completas | Evita retrabalho mobile. |
| Financeiro minimo da primeira entrega | Financeiro e modulo grande | Iniciar apenas despesas ou ja reembolsos | Modelar completo, implementar MVP por despesas/pagamentos/reembolso simples | Controla escopo. |
| Preservacao de IDs legados | IDs ajudam reconciliacao | Preservar todos, ou apenas entidades principais | Preservar como `codigo_legado`/`codigo_negocio`, nunca como PK | Facilita migracao e suporte. |

## 14. Riscos principais

- CPF + senha mal desenhado pode enfraquecer seguranca; mitigacao: Supabase Auth, rate limit, bloqueios e sem senha propria.
- RLS incompleta pode vazar lojas; mitigacao: testes de RLS desde Fase 1.
- Financeiro pode crescer demais; mitigacao: modelagem completa e implementacao por fatias verticais.
- Upload mobile pode ficar lento; mitigacao: thumbnails, lazy loading, limites e previews sob demanda.
- Migracao pode perder relacoes historicas; mitigacao: reconciliacao por contagem, IDs, status, datas e vinculos.
- Tentar replicar o legado tecnico; mitigacao: docs de anti-padroes e revisao antes de cada fase.

## 15. Primeira fase recomendada

Comecar pela **Fase 0 + Fase 1**:

1. fundacao do projeto Vite/React/TypeScript, Netlify e Supabase local/DEV;
2. migrations iniciais de usuarios/perfis/permissoes/lojas;
3. Auth CPF + senha com Supabase Auth;
4. RLS testado;
5. area Administracao > Acessos minima;
6. dashboard shell autenticado sem modulos de negocio complexos.

Essa fase reduz o maior risco da V2: seguranca/autorizacao. Sem isso, qualquer modulo posterior ficaria apoiado em uma base instavel.

## 16. Referencias oficiais consultadas

- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase password auth: https://supabase.com/docs/guides/auth/passwords
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Edge Functions auth: https://supabase.com/docs/guides/functions/auth
- Supabase migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Netlify deploy previews: https://docs.netlify.com/deploy/deploy-types/deploy-previews/
- Netlify environment variables: https://docs.netlify.com/build/environment-variables/overview/
