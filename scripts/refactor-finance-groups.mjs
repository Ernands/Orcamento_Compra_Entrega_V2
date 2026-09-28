import fs from 'node:fs';

function edit(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Trecho duplicado: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

edit('src/domain/finance-overview.ts', (source) => {
  let text = source;

  text = replaceOnce(
    text,
    `  budgetBbCents: bigint;\n  itemsBudgetCents: bigint;\n  worksBudgetCents: bigint;\n  budgetTotalCents: bigint;\n  itemsRealizedCents: bigint;\n  worksContractedCents: bigint;\n  realizedTotalCents: bigint;\n  differenceCents: bigint;`,
    `  budgetBbCents: bigint;\n  equipmentBudgetCents: bigint;\n  furnitureBudgetCents: bigint;\n  itemsBudgetCents: bigint;\n  worksBudgetCents: bigint;\n  budgetTotalCents: bigint;\n  budgetVarianceToBbCents: bigint;\n  equipmentRealizedCents: bigint;\n  furnitureRealizedCents: bigint;\n  itemsRealizedCents: bigint;\n  worksContractedCents: bigint;\n  realizedTotalCents: bigint;\n  realizedVarianceToBbCents: bigint;\n  differenceCents: bigint;`,
    'campos de FinanceOverviewStoreRow',
  );

  text = replaceOnce(
    text,
    `export type FinanceStoreCompositionKey = 'equipment' | 'furniture' | 'general' | 'works';`,
    `export type FinanceStoreCompositionKey = 'equipment' | 'furniture' | 'works';`,
    'tipo FinanceStoreCompositionKey',
  );

  text = replaceOnce(
    text,
    `  if (financialGroup) return financialGroup;`,
    `  if (financialGroup === 'equipment') return 'equipment';\n  if (financialGroup === 'furniture' || financialGroup === 'general') return 'furniture';`,
    'prioridade do grupo financeiro',
  );

  text = replaceOnce(
    text,
    `  return 'general';`,
    `  return 'furniture';`,
    'fallback de Itens gerais',
  );

  text = replaceOnce(
    text,
    `    ['equipment', { key: 'equipment', label: 'Equipamentos', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],\n    ['furniture', { key: 'furniture', label: 'Mobiliário', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],\n    ['general', { key: 'general', label: 'Itens gerais', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],\n    ['works', { key: 'works', label: 'Obras e Serviços', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],`,
    `    ['equipment', { key: 'equipment', label: 'Equipamentos', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],\n    ['furniture', { key: 'furniture', label: 'Mobiliário', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],\n    ['works', { key: 'works', label: 'Obras e Serviços', budgetCents: 0n, realizedCents: 0n, paidCents: 0n }],`,
    'mapa de composição',
  );

  text = replaceOnce(
    text,
    `  const financeStore = values.purchaseStoreRows.find((row) => row.storeId === values.storeId);\n  financeStore?.purchases.forEach((purchaseRow) => {`,
    `  const financeStore = values.purchaseStoreRows.find((row) => row.storeId === values.storeId);\n  const plannedItemsCents = plannedBudgetByStore(values.plannedBudgetItems).get(values.storeId) || 0n;\n  const classifiedBudgetCents =\n    rows.get('equipment')!.budgetCents + rows.get('furniture')!.budgetCents;\n  rows.get('furniture')!.budgetCents += plannedItemsCents - classifiedBudgetCents;\n\n  const realizedItemsCents = financeStore?.realizedCents || 0n;\n  const classifiedRealizedCents =\n    rows.get('equipment')!.realizedCents + rows.get('furniture')!.realizedCents;\n  rows.get('furniture')!.realizedCents += realizedItemsCents - classifiedRealizedCents;\n\n  financeStore?.purchases.forEach((purchaseRow) => {`,
    'fechamento por grupo na composição',
  );

  text = replaceOnce(
    text,
    `  return (['equipment', 'furniture', 'general', 'works'] as FinanceStoreCompositionKey[]).map(`,
    `  return (['equipment', 'furniture', 'works'] as FinanceStoreCompositionKey[]).map(`,
    'ordem das linhas de composição',
  );

  text = replaceOnce(
    text,
    `  const approved = plannedBudgetByStore(values.plannedBudgetItems);\n  const works = worksByStore(values.works);`,
    `  const works = worksByStore(values.works);`,
    'remoção do agregado antigo de orçamento',
  );

  text = replaceOnce(
    text,
    `      const itemsBudgetCents = approved.get(store.id) || 0n;\n      const itemsRealizedCents = purchase?.realizedCents || 0n;\n      const purchasePaidCents = purchase?.paidCents || 0n;\n      const budgetTotalCents = itemsBudgetCents + work.budgetCents;\n      const realizedTotalCents = itemsRealizedCents + work.contractedCents;`,
    `      const composition = buildFinanceStoreCompositionRows({\n        storeId: store.id,\n        purchases: values.purchases,\n        plannedBudgetItems: values.plannedBudgetItems,\n        purchaseStoreRows: values.purchaseStoreRows,\n        works: values.works,\n      });\n      const equipment = composition.find((row) => row.key === 'equipment')!;\n      const furniture = composition.find((row) => row.key === 'furniture')!;\n      const equipmentBudgetCents = equipment.budgetCents;\n      const furnitureBudgetCents = furniture.budgetCents;\n      const itemsBudgetCents = equipmentBudgetCents + furnitureBudgetCents;\n      const equipmentRealizedCents = equipment.realizedCents;\n      const furnitureRealizedCents = furniture.realizedCents;\n      const itemsRealizedCents = equipmentRealizedCents + furnitureRealizedCents;\n      const purchasePaidCents = purchase?.paidCents || 0n;\n      const budgetBbCents = budgetByStore.get(store.id) || 0n;\n      const budgetTotalCents = itemsBudgetCents + work.budgetCents;\n      const realizedTotalCents = itemsRealizedCents + work.contractedCents;`,
    'cálculo segmentado da visão geral',
  );

  text = replaceOnce(
    text,
    `        budgetBbCents: budgetByStore.get(store.id) || 0n,\n        itemsBudgetCents,\n        worksBudgetCents: work.budgetCents,\n        budgetTotalCents,\n        itemsRealizedCents,\n        worksContractedCents: work.contractedCents,\n        realizedTotalCents,\n        differenceCents: budgetTotalCents - realizedTotalCents,`,
    `        budgetBbCents,\n        equipmentBudgetCents,\n        furnitureBudgetCents,\n        itemsBudgetCents,\n        worksBudgetCents: work.budgetCents,\n        budgetTotalCents,\n        budgetVarianceToBbCents: budgetBbCents - budgetTotalCents,\n        equipmentRealizedCents,\n        furnitureRealizedCents,\n        itemsRealizedCents,\n        worksContractedCents: work.contractedCents,\n        realizedTotalCents,\n        realizedVarianceToBbCents: budgetBbCents - realizedTotalCents,\n        differenceCents: budgetTotalCents - realizedTotalCents,`,
    'retorno detalhado da visão geral',
  );

  return text;
});

edit('src/domain/finance-payments.ts', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `export type FinancePaymentOrigin = 'equipment' | 'furniture' | 'general' | 'works';`,
    `export type FinancePaymentOrigin = 'equipment' | 'furniture' | 'works';`,
    'tipo de origem financeira',
  );
  text = replaceOnce(
    text,
    `  equipment: 'Equipamentos',\n  furniture: 'Mobiliário',\n  general: 'Itens gerais',\n  works: 'Obras e Serviços',`,
    `  equipment: 'Equipamentos',\n  furniture: 'Mobiliário',\n  works: 'Obras e Serviços',`,
    'labels de origem financeira',
  );
  text = replaceOnce(
    text,
    `const ORIGINS: FinancePaymentOrigin[] = ['equipment', 'furniture', 'general', 'works'];`,
    `const ORIGINS: FinancePaymentOrigin[] = ['equipment', 'furniture', 'works'];`,
    'ordem de origens financeiras',
  );
  text = replaceOnce(
    text,
    `  return { equipment: 0n, furniture: 0n, general: 0n, works: 0n };`,
    `  return { equipment: 0n, furniture: 0n, works: 0n };`,
    'alocações vazias',
  );
  text = text.replace(/\n\s*general: 0n,/g, '');
  return text;
});

edit('src/pages/finance-store-detail-page.tsx', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `  general: 'Itens gerais',`,
    `  general: 'Mobiliário',`,
    'label de Itens gerais no detalhe',
  );
  text = replaceOnce(
    text,
    `<span>Diferença</span>\n              <strong>{formatBRL(overview.differenceCents)}</strong>`,
    `<span>Dif. em relação à verba</span>\n              <strong>{formatBRL(overview.realizedVarianceToBbCents)}</strong>`,
    'KPI diferença do detalhe',
  );
  text = replaceOnce(
    text,
    `className={overview.differenceCents < 0n ? 'is-negative' : 'is-positive'}`,
    `className={overview.realizedVarianceToBbCents < 0n ? 'is-negative' : 'is-positive'}`,
    'classe do KPI diferença do detalhe',
  );
  text = replaceOnce(
    text,
    `<strong className={overview.differenceCents < 0n ? 'value-negative' : 'value-positive'}>\n                    {formatBRL(overview.differenceCents)}\n                  </strong>`,
    `<strong className={overview.realizedVarianceToBbCents < 0n ? 'value-negative' : 'value-positive'}>\n                    {formatBRL(overview.realizedVarianceToBbCents)}\n                  </strong>`,
    'diferença total da composição',
  );
  return text;
});

edit('src/pages/finance-page.tsx', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `          totals.differenceCents += row.differenceCents;`,
    `          totals.differenceCents += row.realizedVarianceToBbCents;`,
    'agregado de diferença em relação à verba',
  );
  text = replaceOnce(
    text,
    `            Consolide orçamento x realizado de itens e obras, fluxo de pagamentos e reembolsos por\n            loja.`,
    `            Consolide Equipamentos, Mobiliário e Obras, fluxo de pagamentos e reembolsos por loja.`,
    'descrição da Visão Geral',
  );
  text = replaceOnce(
    text,
    `<span>Diferença orçamento</span>`,
    `<span>Dif. em relação à verba</span>`,
    'KPI diferença da visão geral',
  );
  text = replaceOnce(
    text,
    `                    Itens e obras permanecem em módulos separados, mas são consolidados nesta visão.`,
    `                    Equipamentos, Mobiliário e Obras permanecem consolidados nesta visão financeira.`,
    'descrição da tabela da Visão Geral',
  );
  text = replaceOnce(
    text,
    `<th colSpan={4}>Orçamento</th>\n                        <th colSpan={4}>Realização</th>`,
    `<th colSpan={6}>Orçamento</th>\n                        <th colSpan={5}>Realização</th>`,
    'grupos de colunas da Visão Geral',
  );
  text = replaceOnce(
    text,
    `<th>Verba BB</th>\n                        <th>Orçado itens</th>\n                        <th>Orçado obra</th>\n                        <th>Orçado total</th>\n                        <th>Comprado itens</th>\n                        <th>Obra contratada</th>\n                        <th>Realizado</th>\n                        <th>Diferença</th>`,
    `<th>Verba BB</th>\n                        <th>Orçado Equipamentos</th>\n                        <th>Orçado Mobiliário</th>\n                        <th>Orçado obra</th>\n                        <th>Orçado total</th>\n                        <th>Dif. Em Relação a Verba</th>\n                        <th>Realizado Equipamentos</th>\n                        <th>Realizado Mobiliário</th>\n                        <th>Realizado Obras</th>\n                        <th>Realizado Total</th>\n                        <th>Dif. Em Relação a Verba</th>`,
    'cabeçalhos financeiros da Visão Geral',
  );
  text = replaceOnce(
    text,
    `                          <td className="finance-money">\n                            <strong>{formatBRL(row.itemsBudgetCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.worksBudgetCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.budgetTotalCents)}</strong>\n                            {row.budgetTotalCents > row.budgetBbCents && (\n                              <small className="finance-store-budget-alert" role="status">\n                                Acima da verba em {formatBRL(row.budgetTotalCents - row.budgetBbCents)}\n                              </small>\n                            )}\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.itemsRealizedCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.worksContractedCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.realizedTotalCents)}</strong>\n                          </td>\n                          <td>\n                            <strong className={row.differenceCents < 0n ? 'finance-difference--negative' : 'finance-difference--positive'}>\n                              {formatBRL(row.differenceCents)}\n                            </strong>\n                          </td>`,
    `                          <td className="finance-money">\n                            <strong>{formatBRL(row.equipmentBudgetCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.furnitureBudgetCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.worksBudgetCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.budgetTotalCents)}</strong>\n                            {row.budgetTotalCents > row.budgetBbCents && (\n                              <small className="finance-store-budget-alert" role="status">\n                                Acima da verba em {formatBRL(row.budgetTotalCents - row.budgetBbCents)}\n                              </small>\n                            )}\n                          </td>\n                          <td>\n                            <strong className={row.budgetVarianceToBbCents < 0n ? 'finance-difference--negative' : 'finance-difference--positive'}>\n                              {formatBRL(row.budgetVarianceToBbCents)}\n                            </strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.equipmentRealizedCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.furnitureRealizedCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.worksContractedCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.realizedTotalCents)}</strong>\n                          </td>\n                          <td>\n                            <strong className={row.realizedVarianceToBbCents < 0n ? 'finance-difference--negative' : 'finance-difference--positive'}>\n                              {formatBRL(row.realizedVarianceToBbCents)}\n                            </strong>\n                          </td>`,
    'valores da tabela da Visão Geral',
  );
  return text;
});

edit('src/data/exports/finance-exports.ts', (source) => {
  let text = source;

  text = replaceOnce(
    text,
    `    (acc, row) => ({\n      budgetBbCents: acc.budgetBbCents + row.budgetBbCents,\n      budgetTotalCents: acc.budgetTotalCents + row.budgetTotalCents,\n      realizedTotalCents: acc.realizedTotalCents + row.realizedTotalCents,\n      differenceCents: acc.differenceCents + row.differenceCents,\n      paidCents: acc.paidCents + row.paidCents,\n      payableCents: acc.payableCents + row.payableCents,\n    }),\n    {\n      budgetBbCents: 0n,\n      budgetTotalCents: 0n,\n      realizedTotalCents: 0n,\n      differenceCents: 0n,\n      paidCents: 0n,\n      payableCents: 0n,\n    },`,
    `    (acc, row) => ({\n      budgetBbCents: acc.budgetBbCents + row.budgetBbCents,\n      budgetTotalCents: acc.budgetTotalCents + row.budgetTotalCents,\n      realizedTotalCents: acc.realizedTotalCents + row.realizedTotalCents,\n      budgetVarianceToBbCents: acc.budgetVarianceToBbCents + row.budgetVarianceToBbCents,\n      realizedVarianceToBbCents:\n        acc.realizedVarianceToBbCents + row.realizedVarianceToBbCents,\n    }),\n    {\n      budgetBbCents: 0n,\n      budgetTotalCents: 0n,\n      realizedTotalCents: 0n,\n      budgetVarianceToBbCents: 0n,\n      realizedVarianceToBbCents: 0n,\n    },`,
    'totais da exportação da Visão Geral',
  );

  text = replaceOnce(
    text,
    `  summary.addRow(['Implanta 27', 'Visão Geral Financeira']);\n  summary.mergeCells('A1:B1');\n  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };\n  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);\n  summary.addRow(['Filtros', input.filtersText || 'Todos']);\n  summary.addRow([]);\n  summary.addRow(['Indicador', 'Valor']);\n  styleHeader(summary.getRow(5));\n  [\n    ['Verba BB', totals.budgetBbCents],\n    ['Orçado total', totals.budgetTotalCents],\n    ['Realizado total', totals.realizedTotalCents],\n    ['Diferença orçamento', totals.differenceCents],\n    ['Pago', totals.paidCents],\n    ['Saldo a pagar', totals.payableCents],\n  ].forEach(([label, value]) => {`,
    `  summary.addRow(['Sistema de Controle Orçamentário']);\n  summary.mergeCells('A1:B1');\n  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };\n  summary.addRow(['Implantação de Lojas Mais BB']);\n  summary.mergeCells('A2:B2');\n  summary.addRow([]);\n  summary.addRow(['Gerado em', formatDateTime(input.generatedAt)]);\n  summary.addRow(['Filtros', input.filtersText || 'Todos']);\n  summary.addRow([]);\n  summary.addRow([`1 Onda - ${input.rows.length} lojas`]);\n  summary.mergeCells('A7:B7');\n  summary.addRow(['Indicador', 'Valor']);\n  styleHeader(summary.getRow(8));\n  [\n    ['Verba BB', totals.budgetBbCents],\n    ['Orçado total', totals.budgetTotalCents],\n    ['Realizado total', totals.realizedTotalCents],\n    ['Diferença Verba - Orçado', totals.budgetVarianceToBbCents],\n    ['Diferença Verba - Realizado', totals.realizedVarianceToBbCents],\n  ].forEach(([label, value]) => {`,
    'resumo Excel da Visão Geral',
  );

  text = replaceOnce(
    text,
    `    { header: 'Verba BB', key: 'budgetBb', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado itens', key: 'itemsBudget', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado obra', key: 'worksBudget', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado total', key: 'budgetTotal', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Comprado itens', key: 'itemsRealized', width: 17, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Obra contratada', key: 'worksContracted', width: 18, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Realizado', key: 'realized', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Diferença', key: 'difference', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Pago', key: 'paid', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Saldo a pagar', key: 'payable', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Documentação obra', key: 'documentation', width: 20 },`,
    `    { header: 'Verba BB', key: 'budgetBb', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado Equipamentos', key: 'equipmentBudget', width: 20, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado Mobiliário', key: 'furnitureBudget', width: 20, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado obra', key: 'worksBudget', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Orçado total', key: 'budgetTotal', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Dif. Em Relação a Verba', key: 'budgetVariance', width: 22, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Realizado Equipamentos', key: 'equipmentRealized', width: 22, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Realizado Mobiliário', key: 'furnitureRealized', width: 22, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Realizado Obras', key: 'worksRealized', width: 18, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Realizado Total', key: 'realized', width: 18, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Dif. Em Relação a Verba', key: 'realizedVariance', width: 22, style: { numFmt: MONEY_FORMAT } },`,
    'colunas Excel da Visão Geral',
  );

  text = replaceOnce(
    text,
    `      budgetBb: centsToNumber(row.budgetBbCents),\n      itemsBudget: centsToNumber(row.itemsBudgetCents),\n      worksBudget: centsToNumber(row.worksBudgetCents),\n      budgetTotal: centsToNumber(row.budgetTotalCents),\n      itemsRealized: centsToNumber(row.itemsRealizedCents),\n      worksContracted: centsToNumber(row.worksContractedCents),\n      realized: centsToNumber(row.realizedTotalCents),\n      difference: centsToNumber(row.differenceCents),\n      paid: centsToNumber(row.paidCents),\n      payable: centsToNumber(row.payableCents),\n      documentation:\n        row.documentationStatus === 'complete'\n          ? 'Completa'\n          : row.documentationStatus === 'partial'\n            ? 'Parcial'\n            : row.documentationStatus === 'pending'\n              ? 'Pendente'\n              : 'Sem obra',`,
    `      budgetBb: centsToNumber(row.budgetBbCents),\n      equipmentBudget: centsToNumber(row.equipmentBudgetCents),\n      furnitureBudget: centsToNumber(row.furnitureBudgetCents),\n      worksBudget: centsToNumber(row.worksBudgetCents),\n      budgetTotal: centsToNumber(row.budgetTotalCents),\n      budgetVariance: centsToNumber(row.budgetVarianceToBbCents),\n      equipmentRealized: centsToNumber(row.equipmentRealizedCents),\n      furnitureRealized: centsToNumber(row.furnitureRealizedCents),\n      worksRealized: centsToNumber(row.worksContractedCents),\n      realized: centsToNumber(row.realizedTotalCents),\n      realizedVariance: centsToNumber(row.realizedVarianceToBbCents),`,
    'linhas Excel da Visão Geral',
  );

  text = replaceOnce(
    text,
    `      'Loja', 'Verba BB', 'Orçado itens', 'Orçado obra', 'Orçado total',\n      'Comprado itens', 'Obra contratada', 'Realizado', 'Diferença',\n      'Pago', 'Saldo a pagar', 'Documentação',`,
    `      'Loja', 'Verba BB', 'Orçado Equip.', 'Orçado Mobil.', 'Orçado Obra', 'Orçado Total',\n      'Dif. Verba/Orç.', 'Realizado Equip.', 'Realizado Mobil.', 'Realizado Obras',\n      'Realizado Total', 'Dif. Verba/Real.',`,
    'cabeçalho PDF da Visão Geral',
  );

  text = replaceOnce(
    text,
    `      formatCurrency(row.budgetBbCents),\n      formatCurrency(row.itemsBudgetCents),\n      formatCurrency(row.worksBudgetCents),\n      formatCurrency(row.budgetTotalCents),\n      formatCurrency(row.itemsRealizedCents),\n      formatCurrency(row.worksContractedCents),\n      formatCurrency(row.realizedTotalCents),\n      formatCurrency(row.differenceCents),\n      formatCurrency(row.paidCents),\n      formatCurrency(row.payableCents),\n      row.documentationStatus === 'complete'\n        ? 'Completa'\n        : row.documentationStatus === 'partial'\n          ? 'Parcial'\n          : row.documentationStatus === 'pending'\n            ? 'Pendente'\n            : 'Sem obra',`,
    `      formatCurrency(row.budgetBbCents),\n      formatCurrency(row.equipmentBudgetCents),\n      formatCurrency(row.furnitureBudgetCents),\n      formatCurrency(row.worksBudgetCents),\n      formatCurrency(row.budgetTotalCents),\n      formatCurrency(row.budgetVarianceToBbCents),\n      formatCurrency(row.equipmentRealizedCents),\n      formatCurrency(row.furnitureRealizedCents),\n      formatCurrency(row.worksContractedCents),\n      formatCurrency(row.realizedTotalCents),\n      formatCurrency(row.realizedVarianceToBbCents),`,
    'linhas PDF da Visão Geral',
  );

  text = replaceOnce(
    text,
    `    headStyles: { fillColor: [31, 111, 92], fontSize: 6.5 },\n    styles: { fontSize: 6.2, cellPadding: 1.8, valign: 'middle' },\n    columnStyles: { 0: { cellWidth: 34 } },`,
    `    headStyles: { fillColor: [31, 111, 92], fontSize: 5.7 },\n    styles: { fontSize: 5.3, cellPadding: 1.3, valign: 'middle' },\n    columnStyles: { 0: { cellWidth: 30 } },`,
    'estilo do PDF da Visão Geral',
  );

  text = replaceOnce(
    text,
    `    ['Verba BB', input.overview.budgetBbCents],\n    ['Orçado total', input.overview.budgetTotalCents],\n    ['Realizado', input.overview.realizedTotalCents],\n    ['Diferença', input.overview.differenceCents],\n    ['Pago', input.overview.paidCents],\n    ['A pagar', input.overview.payableCents],\n    ['Orçado itens', input.overview.itemsBudgetCents],\n    ['Comprado itens', input.overview.itemsRealizedCents],\n    ['Orçado obras', input.overview.worksBudgetCents],\n    ['Obra contratada', input.overview.worksContractedCents],`,
    `    ['Verba BB', input.overview.budgetBbCents],\n    ['Orçado Equipamentos', input.overview.equipmentBudgetCents],\n    ['Orçado Mobiliário', input.overview.furnitureBudgetCents],\n    ['Orçado obras', input.overview.worksBudgetCents],\n    ['Orçado total', input.overview.budgetTotalCents],\n    ['Dif. Verba - Orçado', input.overview.budgetVarianceToBbCents],\n    ['Realizado Equipamentos', input.overview.equipmentRealizedCents],\n    ['Realizado Mobiliário', input.overview.furnitureRealizedCents],\n    ['Realizado Obras', input.overview.worksContractedCents],\n    ['Realizado total', input.overview.realizedTotalCents],\n    ['Dif. Verba - Realizado', input.overview.realizedVarianceToBbCents],\n    ['Pago', input.overview.paidCents],\n    ['A pagar', input.overview.payableCents],`,
    'resumo Excel do detalhe da loja',
  );

  text = replaceOnce(
    text,
    `  autoTable(document, {\n    startY: 36,\n    theme: 'grid',\n    head: [['Verba BB', 'Orçado', 'Realizado', 'Diferença', 'Pago', 'A pagar']],\n    body: [[\n      formatCurrency(input.overview.budgetBbCents),\n      formatCurrency(input.overview.budgetTotalCents),\n      formatCurrency(input.overview.realizedTotalCents),\n      formatCurrency(input.overview.differenceCents),\n      formatCurrency(input.overview.paidCents),\n      formatCurrency(input.overview.payableCents),\n    ]],\n    headStyles: { fillColor: [31, 111, 92] },\n    styles: { fontSize: 8, cellPadding: 2 },\n  });\n\n  autoTable(document, {\n    startY: 58,`,
    `  autoTable(document, {\n    startY: 36,\n    theme: 'grid',\n    head: [['Verba BB', 'Orç. Equip.', 'Orç. Mobil.', 'Orç. Obras', 'Orç. Total', 'Dif. Verba/Orç.']],\n    body: [[\n      formatCurrency(input.overview.budgetBbCents),\n      formatCurrency(input.overview.equipmentBudgetCents),\n      formatCurrency(input.overview.furnitureBudgetCents),\n      formatCurrency(input.overview.worksBudgetCents),\n      formatCurrency(input.overview.budgetTotalCents),\n      formatCurrency(input.overview.budgetVarianceToBbCents),\n    ]],\n    headStyles: { fillColor: [31, 111, 92] },\n    styles: { fontSize: 7.2, cellPadding: 1.7 },\n  });\n\n  autoTable(document, {\n    startY: 50,\n    theme: 'grid',\n    head: [['Real. Equip.', 'Real. Mobil.', 'Real. Obras', 'Real. Total', 'Dif. Verba/Real.']],\n    body: [[\n      formatCurrency(input.overview.equipmentRealizedCents),\n      formatCurrency(input.overview.furnitureRealizedCents),\n      formatCurrency(input.overview.worksContractedCents),\n      formatCurrency(input.overview.realizedTotalCents),\n      formatCurrency(input.overview.realizedVarianceToBbCents),\n    ]],\n    headStyles: { fillColor: [31, 111, 92] },\n    styles: { fontSize: 7.2, cellPadding: 1.7 },\n  });\n\n  autoTable(document, {\n    startY: 66,`,
    'resumo PDF do detalhe da loja',
  );

  return text;
});

edit('src/tests/finance-overview.test.ts', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `  it('prioriza o grupo financeiro explícito sobre nome e categoria do item', () => {\n    expect(\n      financeItemCompositionGroup('Equipamentos', null, null, 'Suporte para Notebook', 'general'),\n    ).toBe('general');\n    expect(\n      financeItemCompositionGroup('Material Escritório', null, null, 'Calculadora de mesa', 'equipment'),\n    ).toBe('equipment');\n    expect(\n      financeItemCompositionGroup('Mobiliário', null, null, 'Capa preferencial com braços', 'general'),\n    ).toBe('general');\n  });`,
    `  it('move Itens gerais para Mobiliário e preserva Equipamentos', () => {\n    expect(\n      financeItemCompositionGroup('Equipamentos', null, null, 'Suporte para Notebook', 'general'),\n    ).toBe('furniture');\n    expect(\n      financeItemCompositionGroup('Material Escritório', null, null, 'Calculadora de mesa', 'equipment'),\n    ).toBe('equipment');\n    expect(\n      financeItemCompositionGroup('Mobiliário', null, null, 'Capa preferencial com braços', 'general'),\n    ).toBe('furniture');\n    expect(financeItemCompositionGroup('Itens gerais', null, null, 'Lixeira')).toBe('furniture');\n  });`,
    'teste de grupo financeiro',
  );

  text = replaceOnce(
    text,
    `    expect(rows.reduce((sum, row) => sum + row.budgetCents, 0n)).toBe(655001n);`,
    `    expect(rows.map((row) => row.key)).toEqual(['equipment', 'furniture', 'works']);\n    expect(rows.reduce((sum, row) => sum + row.budgetCents, 0n)).toBe(655001n);`,
    'teste sem Itens gerais',
  );

  text = replaceOnce(
    text,
    `    expect(row?.itemsBudgetCents).toBe(5001n);\n    expect(row?.worksBudgetCents).toBe(650000n);\n    expect(row?.budgetTotalCents).toBe(655001n);\n    expect(row?.itemsRealizedCents).toBe(9000n);\n    expect(row?.worksContractedCents).toBe(620000n);\n    expect(row?.realizedTotalCents).toBe(629000n);\n    expect(row?.differenceCents).toBe(26001n);`,
    `    expect(row?.equipmentBudgetCents).toBe(5001n);\n    expect(row?.furnitureBudgetCents).toBe(0n);\n    expect(row?.itemsBudgetCents).toBe(5001n);\n    expect(row?.worksBudgetCents).toBe(650000n);\n    expect(row?.budgetTotalCents).toBe(655001n);\n    expect(row?.budgetVarianceToBbCents).toBe(4344999n);\n    expect(row?.equipmentRealizedCents).toBe(0n);\n    expect(row?.furnitureRealizedCents).toBe(9000n);\n    expect(row?.itemsRealizedCents).toBe(9000n);\n    expect(row?.worksContractedCents).toBe(620000n);\n    expect(row?.realizedTotalCents).toBe(629000n);\n    expect(row?.realizedVarianceToBbCents).toBe(4371000n);\n    expect(row?.differenceCents).toBe(26001n);`,
    'novos campos da visão geral',
  );
  return text;
});

edit('src/tests/finance-payments.test.ts', (source) => {
  let text = source;
  text = text.replace(
    `it('resume valores nas quatro origens financeiras', () => {`,
    `it('resume valores nas três origens financeiras', () => {`,
  );
  return text;
});

console.log('Refatoração financeira aplicada com sucesso.');
