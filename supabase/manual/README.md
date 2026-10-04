# Scripts manuais

Arquivos desta pasta **não são migrations** e não devem ser executados automaticamente em deploy.

Eles existem para cargas e conciliações históricas que dependem de documentos previamente conferidos. Antes de executar um script em qualquer ambiente:

1. conferir a fonte documental;
2. revisar o relatório/escopo do script;
3. executar somente no ambiente explicitamente autorizado;
4. validar contagens, totais e diferenças depois da execução.

O arquivo `20261004_purchase_payment_occurrences_proof_backfill.sql` preenche apenas o detalhamento de datas/valores/formas dos comprovantes de compras já conferidos. Ele não altera o valor oficial dos pagamentos/CMPs.
