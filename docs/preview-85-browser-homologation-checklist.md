# Implanta 27 — Homologação de navegador da Preview #85
**Status:** protocolo de execução, ainda **não homologado**. O usuário realiza login na própria sessão. Não enviar senhas, CPF, tokens, cookies ou prints contendo dados pessoais para o GitHub.

## Onde executar

- **Preview #85:** acessar a publicação pelo link da PR/Netlify e confirmar que aponta para Supabase **DEV**. Nunca usar conta, token ou chave do PROD na Preview.
- Usar pelo menos **um perfil com permissão** e **um perfil restrito**. O teste da sessão com credenciais reais ainda NÃO foi executado nesta auditoria.
- O DEV contém somente **3 lojas, 6 CMP, 5 OBR e nenhum ajuste parcial real** na amostra recente. Não declarar aprovado aquilo que depende de uma massa inexistente.
- O PROD tem **28 lojas, 87 CMP, 358 OBR, 10 ajustes parciais** e anexos reais; **não** testar nele novas gravações/alterações como parte desta homologação pré-release.
- Coletar resultados por tela como PASSOU / FALHOU / NÃO TESTÁVEL, guardar data/hora e passo de reprodução. Não revelar documentos financeiros no PR.

## Checklist de interface — somente Preview DEV

| ID | Área | Ação | Critério de aprovação | Status inicial |
|---|---|---|---|---|
| H01 | Login | Entrar com usuário autorizado, recarregar sessão e sair | Login e logout funcionam; sem erros de autorização | PENDENTE |
| H02 | Restrições | Entrar com perfil sem permissão financeira | Não abre pagamentos, conciliação, conferência nem documentos proibidos, mesmo com URL direta | PENDENTE |
| H03 | Dashboard gerencial | Alternar lojas e abas gerenciais | Sem travamento ou “Tente novamente”; totais e filtros coerentes | PENDENTE |
| H04 | Dashboard financeiro | Alternar composição, previsão e detalhes | Comparativos por loja, pago e a pagar consistentes | PENDENTE |
| H05 | Pagamentos | Abrir Pago, A pagar programado e A pagar sem programação; filtrar lojas | Todos os registros carregam e a tela não mostra valores parciais silenciosos | PENDENTE |
| H06 | Conciliação | Abrir e filtrar lançamentos por período | Paginação e exportação não omitem linhas | PENDENTE |
| H07 | Compras | Abrir CMP com anexos, pedidos, fretes e lojas | Pedido completo e total igual ao registrado; não confundir lojas associadas à mesma CMP | PENDENTE |
| H08 | Obras e Serviços | Filtrar OBR por loja e documentação | Status “completa/incompleta/pendente” coerente com nota/recibo e pagamento | PENDENTE |
| H09 | Arquivos | Abrir e baixar nota/recibo de compra e obra | Download abre o arquivo correto; caminho/Storage sem erro de permissão | PENDENTE |
| H10 | Conferência | Selecionar loja e referência CMP/OBR | Mostra somente as referências autorizadas e não dispara consultas globais excessivas | PENDENTE |
| H11 | Conferência → Excel/ZIP | Gerar e abrir arquivos, comparar contagens | Todos os itens exibidos são exportados, nomes e vínculos corretos; sem arquivo faltante silencioso | PENDENTE |
| H12 | Reembolsos | Visualizar totais e pendências por loja | Saldos coerentes; bloqueio de documentos ausentes é visível | PENDENTE |
| H13 | Performance | Percorrer páginas e voltar rapidamente entre lojas | Sem telas “Tente novamente” persistentes nem dados de outra loja em cache | PENDENTE |
| H14 | Sessão/limites | Alternar usuário e loja durante carregamento | Resultado antigo não sobrescreve a loja ou sessão nova | PENDENTE |

## Casos necessários que o DEV não reproduz integralmente

- **Ajustes reais de CMP-00097 e outros 9 ajustes do PROD:** invariantes dos 10 ajustes e 120 linhas foram examinados em PROD somente por leitura; precisa homologação funcional de negócio após liberação controlada.
- **Notas fiscais iguais com espaçamentos/caixa diferentes, referências externas CMP/OBR:** há testes unitários e de consulta, mas sem massa correspondente no DEV atual não se deve afirmar validação visual.
- **Documentos de Obras em volume real:** PROD possui 1.010 vínculos ativos e o DEV quatro documentos de teste com caminho vazio; os resultados de interface serão diferentes.

## Bloqueios que não são resolvidos por estes testes

1. Backup recuperável do **PostgreSQL** ainda não comprovado.
2. Cópia/restauração dos **bytes físicos do Storage** ainda não comprovada (metadados presentes não bastam).
3. As 26 migrações ainda **não foram ensaiadas sobre uma cópia realista do esquema PROD**; o usuário optou por não criar projeto/branch adicional.
4. Compatibilidade real de novas permissões após aplicação das migrações em PROD não pode ser comprovada somente pela comparação em SQL. A verificação atual encontrou **0 divergências projetadas em 13 perfis de PROD sobre 87 CMP e 28 lojas**, mas os perfis não cobrem necessariamente todos os cenários futuros de permissões.
5. Publicar apenas o frontend falha: **22 das 23 funções SQL finais** da #85 ainda não estão presentes no PROD.

## Critério de encerramento

- Registrar cada ID H01–H14 como PASSOU / FALHOU / NÃO TESTÁVEL e evidência resumida.
- Qualquer falha financeira, RLS indevida, arquivo errado ou exportação parcial é **NO-GO**.
- Não liberar publicação sem **autorização expressa separada** após ciência do risco de migrar sem ambiente isolado.
- Não transformar “NÃO TESTÁVEL” em “PASSOU”.
