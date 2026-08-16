# V2 Data Migration

Status: plano. Nao migrar dados nesta rodada.

## Fonte

Sistema atual:

- Google Sheets / planilha DEV/produção;
- dados do frontend legado;
- documentos de regras;
- IDs amigaveis existentes;
- historico/auditoria quando util.

Destino:

- Supabase PostgreSQL V2.

## Principios

- Migracao primeiro em DEV.
- Preservar dados uteis, nao estruturas tecnicas legadas.
- UUID como PK no destino.
- IDs legados viram `codigo_legado` ou `codigo_negocio`.
- Nao usar numero de linha.
- Nao copiar abas como tabelas identicas.
- Validar relacoes, status, datas e totais.

## Etapas

### 1. Inventario

Listar origem:

- lojas;
- itens;
- necessidades;
- fornecedores;
- cotacoes/propostas;
- aprovacoes;
- compras;
- entregas;
- usuarios;
- permissoes;
- checklist mestre;
- implantacoes;
- atividades;
- atualizacoes;
- bloqueios;
- arquivos, se existirem;
- historico.

### 2. Extracao

Gerar exports controlados:

- CSV/JSON por entidade;
- encoding validado;
- snapshots datados;
- checksum dos arquivos;
- sem secrets.

### 3. Transformacao

Mapear:

- IDs legados -> UUIDs;
- perfis antigos -> perfis V2;
- `Lojas_Permitidas` -> `usuario_lojas`;
- status Sheets -> enums/status V2;
- cotacoes legadas/propostas agrupadas -> cotacoes/propostas/proposta_itens;
- checklist V1 -> checklist_modelos/fases/atividades/regras;
- implantacoes -> ciclos/atividades snapshots;
- historico -> audit_logs ou timeline, quando fizer sentido.

### 4. Carga DEV

Carregar no Supabase DEV:

- tabelas base;
- relacoes;
- dados operacionais;
- auditoria selecionada;
- usuarios sem senhas reais, com fluxo de convite/reset.

### 5. Reconciliacao

Validar contagens minimas:

```text
origem: 27 lojas
destino: 27 lojas

origem: itens catalogados
destino: mesmos itens ativos/inativos relevantes

origem: 2.295 necessidades
destino: 2.295 necessidades ou divergencia justificada
```

Validar tambem:

- IDs legados preservados;
- FKs completas;
- necessidades apontam para loja e item corretos;
- propostas apontam para fornecedor e necessidades;
- totais recalculados batem;
- status equivalentes;
- datas validas;
- checklists com 30 atividades e 16 regras de evidencia;
- progresso derivado confere;
- bloqueios ativos conferem;
- historico relevante preservado.

### 6. Testes

Executar:

- testes de dominio;
- testes de RLS;
- testes de dashboards;
- testes de cotacao/proposta;
- testes de implantacao;
- testes financeiros quando modulo existir.

### 7. Carga final

Antes da carga final:

- comunicar congelamento do legado;
- bloquear escritas no legado ou definir janela;
- extrair snapshot final;
- recalcular checksums;
- carregar staging/prod;
- reconciliar novamente;
- liberar V2.

### 8. Corte

Plano de corte:

- backup completo da origem;
- backup do Supabase antes da carga;
- checklist de smoke tests;
- usuarios iniciais;
- DNS/Netlify pronto;
- plano de rollback operacional.

## IDs existentes

Preservar como codigo amigavel quando houver valor:

- `LOJ-001`
- `ITM-00001`
- `NEC-000001`
- `FOR-000001`
- `PRP-000001`
- `IMP-000001`
- `ATV-001`

Nao usar como PK.

## Tratamento de usuarios

Nao migrar senha.

Usuarios:

- importar cadastro, perfil e lojas;
- normalizar CPF se existir;
- criar usuarios no Auth por fluxo controlado;
- exigir definicao/troca de senha.

## Historico e auditoria

Separar:

- timeline funcional util ao usuario;
- auditoria tecnica.

Nem todo `12_HISTORICO` precisa virar timeline visivel. Migrar eventos com valor operacional e manter auditoria tecnica quando ajudar rastreabilidade.

## Validacoes automatizadas recomendadas

- contagem por tabela;
- contagem por status;
- contagem por loja;
- FKs sem orfaos;
- valores monetarios recalculados;
- propostas selecionadas sem conflito;
- uma implantacao ativa por loja;
- um bloqueio ativo por atividade;
- documentos com arquivo existente;
- usuarios sem CPF duplicado.

## Riscos

- dados inconsistentes no Sheets;
- acentos/encoding;
- cotações parcialmente migradas no legado;
- historico com formatos variados;
- usuarios sem CPF confiavel;
- arquivos externos nao acessiveis;
- status antigos sem equivalente direto.

## Decisoes antes da migracao real

- Qual planilha sera origem oficial final?
- Quais historicos devem virar timeline?
- Quais usuarios entram na primeira onda?
- Havera corte seco ou convivencia temporaria?
- Como tratar anexos preexistentes, se houverem fora do sistema?
