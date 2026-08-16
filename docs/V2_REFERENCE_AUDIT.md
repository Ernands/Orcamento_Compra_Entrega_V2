# V2 Reference Audit

Status: planejamento. Nenhuma implementacao operacional foi criada nesta rodada.

## Repositorios e fontes verificadas

- Repositorio V2: `C:\Users\RMV\Documents\Orcamento_Compra_Entrega_V2`
- Remoto V2: `https://github.com/Ernands/Orcamento_Compra_Entrega_V2.git`
- Branch V2: `main`
- Estado inicial V2: repositorio vazio, sem commits, apenas `.git`.
- Sistema legado auditado: `C:\Users\RMV\Documents\Implantação_Orçamento_Compra_Entrega`
- Atelie Lica Festas localizado parcialmente: `C:\Users\RMV\Downloads\Atelie lica festas`

## Sistema legado

### Funcionalidades encontradas

- SPA React/TypeScript com Vite, rotas para Dashboard, Lojas, Itens, Necessidades, Cotacoes, Diagnostico e Implantacao.
- Dashboard operacional de suprimentos com metricas de lojas, itens, necessidades, pendencias de definicao, cotacao, aprovacao, compra, entrega, conclusao e divergencias.
- Cadastro/listagem de 27 lojas, itens e 2.295 necessidades em snapshot local e backend Apps Script.
- Edicao versionada de lojas e itens, com validacao, razao opcional e auditoria.
- Modulo Cotacoes com fornecedores, propostas agrupadas, escopo por necessidade/loja/item, totais, frete, outros custos, prazo, pagamento, validade, status, selecao, reabertura e exclusao logica.
- Comparacao de propostas por `scopeSignature`, impedindo comparar escopos diferentes.
- Modo visitante somente leitura para dados publicos operacionais e cotacoes publicas.
- Modulo Implantacao com checklist mestre versionado, 30 atividades, 4 fases, 16 regras de evidencia, progresso, responsaveis, datas-alvo, bloqueios, timeline, pendencias e checklist por loja.
- Pre-validacoes, setup manual, rollback e testes para migracoes estruturais do Apps Script/Sheets.
- Cobertura de testes de dominio, contratos HTTP, permissoes, status, IDs, cotações e runtime de implantacao.

### Regras funcionais uteis encontradas

- Necessidade possui ciclo de status: `PENDENTE_DEFINICAO`, `NAO_INICIADO`, `EM_COTACAO`, `AGUARDANDO_APROVACAO`, `APROVADO`, `COMPRADO`, `EM_TRANSPORTE`, `ENTREGUE`, `CONFERIDO`, `CONCLUIDO`, `CANCELADO`, `DIVERGENCIA`.
- Item e necessidade sao entidades distintas no dominio, mas a UX atual fragmenta demais a experiencia.
- Proposta deve derivar loja, item e quantidade das necessidades; o cliente nao deve enviar quantidades como autoridade.
- Proposta agrupada deve conter um unico item e varias necessidades/lojas, com totais calculados no backend.
- Proposta selecionada nao deve ser excluida nem editada diretamente.
- Reabertura de proposta recebida exige motivo e respeita status do escopo.
- Selecionar proposta move necessidades vinculadas para aguardando aprovacao e deve detectar conflito de escopo sobreposto.
- Checklist Mestre publicado deve gerar snapshot de atividades por loja ao iniciar implantacao.
- Alterar Checklist Mestre nao pode alterar silenciosamente implantacoes ja iniciadas.
- `NAO_INICIADO = 0%`, `EM_ANDAMENTO = 25/50/75%`, `CONCLUIDO = 100%`.
- `BLOQUEADO`, `NAO_APLICAVEL` e `CANCELADO` preservam percentual; nao aplicavel/cancelado saem do denominador do progresso.
- Bloqueio, nao aplicavel e cancelamento exigem motivo; cancelamento e reabertura exigem permissao.
- Progresso da loja e media das atividades ativas e aplicaveis.
- Proximas inauguracoes usam janela de 30 dias; criticas usam janela de 7 dias.
- Data-alvo e derivada da data planejada de inauguracao + offset da atividade.
- Preview de reprogramacao de data deve ser leitura; aplicacao da reprogramacao preserva `Data_Alvo_Original`.
- Timeline funcional deve ser paginada e ordenada por eventos mais recentes.
- Auditoria tecnica e timeline funcional sao conceitos diferentes.

### Componentes e padroes de UX uteis

- Sidebar clara com grupos de navegacao, icones e versao mobile em Sheet/drawer.
- Cards de metricas, badges de status, progresso visual e tabelas compactas.
- Tela de loja com abas e conteudo responsivo.
- Paginas de estado para loading/erro e boundary isolado para Implantacao.
- Paginacao para cargas grandes de necessidades.
- Formularios em sheets/modais para edicao pontual.

### Problemas arquiteturais do legado

- Google Sheets atua como banco operacional; isso limita integridade, relacoes, transacoes, consultas, seguranca e performance.
- Apps Script atua como backend, exigindo contornos como `ScriptLock`, rollback manual, leitura de intervalos e auditoria em aba.
- Permissao por loja fica em celula `Lojas_Permitidas`, com listas separadas por virgula.
- IDs e versionamento sao mantidos manualmente.
- Estruturas de abas viraram tabelas por necessidade tecnica, nao por modelagem relacional.
- Google Identity e obrigatorio para fluxo autenticado, mas a V2 exige CPF + senha.
- Arquivos foram apenas preparados conceitualmente; nao ha implementacao real de storage/anexos no legado.
- Diagnostico e setup existem para contornar fragilidade estrutural da planilha.
- Publicacao via GitHub Pages nao atende a decisao V2 de Netlify + Supabase.

### Conceitos a preservar na V2

- Conhecimento do dominio: lojas, itens, necessidades, cotacoes, propostas, compras, entregas, implantacao, checklist, auditoria e status.
- Design aprovado: layout profissional, limpo, responsivo, com sidebar e bom uso de cards/badges/progresso.
- Snapshot de checklist por loja e versionamento do Checklist Mestre.
- Transicoes de status e regras de progresso.
- Timeline funcional para atividades, compras, financeiro e anexos.
- Auditoria tecnica forte e separada da timeline.
- Idempotencia em operacoes criticas.
- Testes de dominio e contratos de autorizacao.

### Conceitos a abandonar na V2

- Apps Script, `Code.gs`, Web App como backend e `LockService`.
- Google Sheets como banco operacional.
- Google Login.
- Abas como modelo de dados.
- `getDataRange`, numero de linha fisica, colunas tecnicas em planilha.
- `Lojas_Permitidas` como string em uma celula.
- Rollback manual como substituto de transacao.
- Public bucket ou Drive publico para arquivos privados.
- Frontend como autoridade de permissao.

## Atelie Lica Festas

### O que foi encontrado

Foi localizada a pasta `C:\Users\RMV\Downloads\Atelie lica festas`, contendo:

- cinco arquivos PNG grandes de artes do Atelie Lica Festa;
- um atalho `Documentos - Atalho.lnk`.

O atalho aponta para `C:\Users\CodexSandboxOffline\Documents`, caminho que nao esta disponivel no ambiente atual. A pasta encontrada nao e um repositorio Git, nao contem `package.json`, nao contem codigo de app e nao contem implementacao auditavel de login, upload, anexos, storage ou experiencia mobile.

### Login encontrado

Nao foi possivel auditar login do Atelie Lica Festas porque nenhum projeto/codigo/tela funcional foi encontrado no workspace atual.

### Arquitetura de autenticacao encontrada

Nao encontrada. Nao inventar implementacao.

### Arquivos, upload e preview encontrados

Nao ha codigo de upload ou preview. O que existe sao imagens PNG grandes, entre aproximadamente 1,6 MB e 2,0 MB cada. Isso reforca, por evidencia local, que a V2 deve tratar imagens como arquivos potencialmente pesados e nunca carregar binarios completos de forma ansiosa ao abrir uma loja.

### Experiencia mobile encontrada

Nao encontrada. As imagens sao pecas visuais/marketing, nao telas operacionais responsivas.

### Pontos fortes observaveis

- Linguagem visual clara e orientada a imagem.
- Arquivos de imagem podem ser usados como lembrete de que usuarios comuns trabalham com imagens grandes.

### Pontos fracos / lacunas

- Projeto de referencia nao esta acessivel.
- Atalho aponta para ambiente externo/inexistente.
- Nenhuma decisao tecnica sobre auth, storage, preview ou mobile pode ser inferida com seguranca.

### Conceitos recomendados para V2 a partir desta limitacao

- Registrar explicitamente artefatos e repositorios de referencia dentro de caminhos versionados ou acessiveis.
- Nao depender de atalhos locais para ativos importantes.
- Planejar anexos com thumbnails, preview sob demanda, lazy loading, paginacao e arquivos privados.
- Criar criterios de aceite mobile para upload/preview sem depender de memoria de projeto nao auditado.
