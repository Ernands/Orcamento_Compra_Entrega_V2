# Conferência de Compras e Obras

Rota: `/financeiro/conferencia-compras-obras`, abaixo de Conciliação Conta. Requer `finance.view` e `finance.document_audit_view`. A nova permissão aparece em Acessos; apenas o perfil administrator a recebe inicialmente. As políticas novas permitem somente SELECT, preservando o escopo de lojas e as permissões de escrita existentes.

A tela lista compras e obras, inclusive sem pagamento, com seleção individual/múltipla. O ZIP contém os documentos originais, o Excel com três abas e extrações de texto identificadas em `Leituras/`. Compras canceladas/devolvidas e pedidos cancelados permanecem identificados e não compõem os totais ativos. Dados aprovados sem compra registrada não são apresentados como compra realizada. O rateio reutiliza `purchaseOrderStoreCosts`; nenhum rateio é inventado. Frete/desconto/outros valores permanecem na origem em que foram cadastrados.

## Documentos e totais

Os nomes dos anexos usam o mesmo planejador do reembolso. Arquivos de conteúdo idêntico são incluídos uma vez por SHA-256. Notas com a mesma chave fiscal somam uma vez no resumo documental, preservando versões diferentes e seus vínculos. Versões da mesma chave com totais diferentes impedem conclusão automática. Notas compartilhadas entre referências são comparadas por grupo; vínculos externos à seleção impedem atribuição integral automática. Recibos são apresentados separadamente e não somados às notas do mesmo lançamento.

A aba Itens do sistema distingue linhas de itens, totais por referência e total da seleção: não some indiscriminadamente essas linhas. A aba Notas fiscais distingue documentos de itens; o resumo de notas únicas é o total documental consolidado. Esse valor pode abranger outras lojas. A aba Conferência e divergências mostra resultados e evidências sem corrigir cadastros ou arquivos.

## Destinatários

Nomes aceitos explicitamente pelo solicitante: **TERCEIRIZAÇÕES** e **Thiago Lima Perdigao**. A comparação ignora caixa, acentos e pontuação, mas não presume que outra razão social contendo uma palavra parecida seja a mesma entidade. Nome conferido não equivale a CNPJ/CPF conferido.

Não foi fornecido CNPJ/CPF e o aplicativo não possui um cadastro fiscal desse destinatário. O número fica Não verificável até ser configurado com informação oficial. Opcionalmente, `VITE_FISCAL_RECIPIENTS_JSON` recebe uma lista de `{ "name": "razão social completa oficial", "taxId": "número oficial", "storeId": "ID opcional da loja" }`. CNPJ/CPF é informação pública de configuração; nunca inserir credenciais nessa variável. A variável é opcional. Configuração malformada interrompe a geração, em vez de aceitar um cadastro incorreto silenciosamente.

A cidade do emitente não participa da validação de loja. Endereço de faturamento diferente, sem local de entrega explícito, é revisão manual. Destino explícito incompatível com vínculo exclusivo à loja gera divergência.

## Leitura automática

- XML NF-e/NFC-e: leitura estruturada de emitente/destinatário, entrega, itens e totalizadores. Campos ausentes continuam ausentes. XML malformado, com DTD/entidades ou contendo várias notas não é concluído automaticamente. Outros layouts, como NFS-e, exigem revisão manual.
- PDF: PDF.js extrai texto. Páginas sem texto suficiente podem ser rasterizadas e lidas por OCR. Layout DANFE reconhecido pode fornecer itens provisórios; tabelas diferentes, descrições quebradas e campos não reconhecidos continuam sinalizados.
- Imagens: OCR local por Tesseract, opcional na tela. OCR e PDF não estruturado exigem revisão manual e não confirmam divergência automaticamente.
- Limite explícito de 50 páginas por PDF para leitura automática; páginas excedentes são indicadas no relatório e o original completo é preservado.
- Leitura do arquivo anexado não consulta SEFAZ nem verifica assinatura/autenticidade fiscal.

Recursos de OCR, português e WASM são copiados de dependências fixadas para `public/fiscal-ocr/` pelos scripts predev/prebuild. Não há chamada a OCR externo/CDN nem envio das notas a outro serviço. O leitor é carregado somente na geração. Falhas de leitura não removem um arquivo já obtido do ZIP. Falhas de download são discriminadas, sem exportar URLs assinadas ou tokens.

## Ambiente e validação

A migração `20261027125118_finance_document_audit_readonly.sql` foi aplicada apenas ao DEV `wiynrfblfigngkvleyqg`, utilizado pela Deploy Preview #72. Produção permanece sem essa migração e sem alteração de dados financeiros. O SQL também permite anexar XML nos dois buckets já existentes; não modifica objetos armazenados.

Cobertura: XML, centavos, destinatários aceitos/divergentes, dados ausentes, recibos, rateio, notas compartilhadas/duplicadas, cancelamento de geração, preservação binária, falhas no ZIP, três abas, links relativos e acesso à tela. As verificações SQL em DEV confirmam capacidade para administrador, ausência de acesso para identidade inexistente e SELECT nas novas políticas. Não é necessário testar gravação de pagamentos para usar a conferência.
