import fs from 'node:fs';

function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Trecho não encontrado: ${label}`);
  return text.replace(before, after);
}

function edit(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (before === after) throw new Error(`Nenhuma alteração em ${path}`);
  fs.writeFileSync(path, after);
  console.log(`Atualizado: ${path}`);
}

edit('src/pages/finance-page.tsx', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `  ExternalLink,\n  FileSpreadsheet,`,
    `  ExternalLink,\n  Eye,\n  EyeOff,\n  FileSpreadsheet,`,
    'imports Eye/EyeOff',
  );
  text = replaceOnce(
    text,
    `  const [overviewExporting, setOverviewExporting] = useState<'pdf' | 'excel' | null>(null);\n  const [budgetStore, setBudgetStore]`,
    `  const [overviewExporting, setOverviewExporting] = useState<'pdf' | 'excel' | null>(null);\n  const [showFinancialDetails, setShowFinancialDetails] = useState(false);\n  const [budgetStore, setBudgetStore]`,
    'estado de expansão financeira',
  );
  text = replaceOnce(
    text,
    `                <div className="finance-panel__tools">\n                  <span>{filteredOverview.length} lojas</span>`,
    `                <div className="finance-panel__tools">\n                  <button\n                    type="button"\n                    className="button button--small finance-overview-toggle"\n                    aria-expanded={showFinancialDetails}\n                    onClick={() => setShowFinancialDetails((current) => !current)}\n                  >\n                    {showFinancialDetails ? <EyeOff size={15} /> : <Eye size={15} />}\n                    {showFinancialDetails ? 'Ocultar Financeiro e Documentos' : 'Ver Financeiro e Documentos'}\n                  </button>\n                  <span>{filteredOverview.length} lojas</span>`,
    'botão expansível',
  );
  text = replaceOnce(
    text,
    `<div className="finance-table-scroll">\n                  <table className="finance-table finance-overview-table">`,
    `<div className="finance-table-scroll finance-overview-scroll">\n                  <table className={\`finance-table finance-overview-table ${showFinancialDetails ? 'is-financial-expanded' : ''}\`}>`,
    'scroll superior da visão geral',
  );
  text = replaceOnce(
    text,
    `                        <th rowSpan={2}>Loja</th>\n                        <th colSpan={6}>Orçamento</th>\n                        <th colSpan={5}>Realização</th>\n                        <th colSpan={2}>Financeiro</th>\n                        <th colSpan={1}>Documentação</th>`,
    `                        <th rowSpan={2}>Loja</th>\n                        <th colSpan={6}>Orçamento</th>\n                        <th colSpan={5}>Realizado</th>\n                        {showFinancialDetails && <th colSpan={2}>Financeiro</th>}\n                        {showFinancialDetails && <th colSpan={1}>Documentação</th>}`,
    'cabeçalhos de grupos',
  );
  text = replaceOnce(
    text,
    `                        <th>Realizado Total</th>\n                        <th>Dif. Em Relação a Verba</th>\n                        <th>Pago</th>\n                        <th>Saldo a pagar</th>\n                        <th>Obra</th>`,
    `                        <th>Realizado Total</th>\n                        <th>Dif. Em Relação a Verba</th>\n                        {showFinancialDetails && <th>Pago</th>}\n                        {showFinancialDetails && <th>Saldo a pagar</th>}\n                        {showFinancialDetails && <th>Obra</th>}`,
    'cabeçalhos financeiros condicionais',
  );
  text = replaceOnce(
    text,
    `                          <td className="finance-money">\n                            <strong>{formatBRL(row.paidCents)}</strong>\n                          </td>\n                          <td className="finance-money">\n                            <strong>{formatBRL(row.payableCents)}</strong>\n                          </td>\n                          <td>\n                            <span className={\`finance-document-state finance-document-state--${row.documentationStatus}\`}>\n                              {row.documentationStatus === 'complete'\n                                ? 'Completa'\n                                : row.documentationStatus === 'partial'\n                                  ? 'Parcial'\n                                  : row.documentationStatus === 'pending'\n                                    ? 'Pendente'\n                                    : 'Sem obra'}\n                            </span>\n                            {row.worksMissingDocumentsCents > 0n && (\n                              <small>{formatBRL(row.worksMissingDocumentsCents)} sem documento</small>\n                            )}\n                          </td>`,
    `                          {showFinancialDetails && (\n                            <>\n                              <td className="finance-money">\n                                <strong>{formatBRL(row.paidCents)}</strong>\n                              </td>\n                              <td className="finance-money">\n                                <strong>{formatBRL(row.payableCents)}</strong>\n                              </td>\n                              <td>\n                                <span className={\`finance-document-state finance-document-state--${row.documentationStatus}\`}>\n                                  {row.documentationStatus === 'complete'\n                                    ? 'Completa'\n                                    : row.documentationStatus === 'partial'\n                                      ? 'Parcial'\n                                      : row.documentationStatus === 'pending'\n                                        ? 'Pendente'\n                                        : 'Sem obra'}\n                                </span>\n                                {row.worksMissingDocumentsCents > 0n && (\n                                  <small>{formatBRL(row.worksMissingDocumentsCents)} sem documento</small>\n                                )}\n                              </td>\n                            </>\n                          )}`,
    'células financeiras condicionais',
  );
  return text;
});

edit('src/pages/finance-page.css', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `.finance-overview-table {\n  min-width: 0;\n  table-layout: fixed;\n}`,
    `.finance-overview-scroll {\n  transform: rotateX(180deg);\n}\n\n.finance-overview-scroll > .finance-overview-table {\n  transform: rotateX(180deg);\n}\n\n.finance-overview-table {\n  min-width: 1120px;\n  table-layout: fixed;\n}\n\n.finance-overview-table.is-financial-expanded {\n  min-width: 1420px;\n}`,
    'largura e scrollbar da visão geral',
  );
  const oldColors = `/* Zebra fixa por grupo: mantém a leitura das cores do cabeçalho sem depender de hover. */\n.finance-overview-table tbody tr:nth-child(even) td:first-child {\n  background: #f5f7f6;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 2):nth-child(-n + 5) {\n  background: #f1f7fd;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 6):nth-child(-n + 9) {\n  background: #f0f9f5;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 10):nth-child(-n + 11) {\n  background: #fff8ef;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(12) {\n  background: #f7f7f5;\n}`;
  const newColors = `/* Cores fixas por bloco financeiro. Os intervalos acompanham a estrutura atual da tabela. */\n.finance-overview-table tbody td:first-child {\n  background: #fbfcfb;\n}\n\n.finance-overview-table tbody td:nth-child(n + 2):nth-child(-n + 7) {\n  background: #f7fbff;\n}\n\n.finance-overview-table tbody td:nth-child(n + 8):nth-child(-n + 12) {\n  background: #f6fcf9;\n}\n\n.finance-overview-table tbody td:nth-child(n + 13):nth-child(-n + 14) {\n  background: #fffaf4;\n}\n\n.finance-overview-table tbody td:nth-child(15) {\n  background: #fafbfa;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:first-child {\n  background: #f3f5f4;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 2):nth-child(-n + 7) {\n  background: #edf5fc;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 8):nth-child(-n + 12) {\n  background: #edf8f2;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(n + 13):nth-child(-n + 14) {\n  background: #fff3e5;\n}\n\n.finance-overview-table tbody tr:nth-child(even) td:nth-child(15) {\n  background: #f2f4f3;\n}`;
  text = replaceOnce(text, oldColors, newColors, 'cores das células');
  text = replaceOnce(
    text,
    `.finance-overview-table thead tr:nth-child(2) th:nth-child(-n + 4) {\n  color: #275f8b;\n  background: #f1f7fd;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(n + 5):nth-child(-n + 8) {\n  color: #1d6c51;\n  background: #f0f9f5;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(n + 9):nth-child(-n + 10) {\n  color: #8a570e;\n  background: #fff8ef;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(4),\n.finance-overview-table thead tr:nth-child(2) th:nth-child(8),\n.finance-overview-table thead tr:nth-child(2) th:nth-child(10),\n.finance-overview-table tbody td:nth-child(5),\n.finance-overview-table tbody td:nth-child(9),\n.finance-overview-table tbody td:nth-child(11) {\n  border-right: 2px solid #d8dfdc;\n}`,
    `.finance-overview-table thead tr:nth-child(2) th:nth-child(-n + 6) {\n  color: #275f8b;\n  background: #eaf4fd;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(n + 7):nth-child(-n + 11) {\n  color: #1d6c51;\n  background: #eaf7f0;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(n + 12):nth-child(-n + 13) {\n  color: #8a570e;\n  background: #fff2df;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(14) {\n  color: #53615c;\n  background: #f1f3f2;\n}\n\n.finance-overview-table thead tr:nth-child(2) th:nth-child(6),\n.finance-overview-table thead tr:nth-child(2) th:nth-child(11),\n.finance-overview-table thead tr:nth-child(2) th:nth-child(13),\n.finance-overview-table tbody td:nth-child(7),\n.finance-overview-table tbody td:nth-child(12),\n.finance-overview-table tbody td:nth-child(14) {\n  border-right: 2px solid #d8dfdc;\n}`,
    'cores dos cabeçalhos por bloco',
  );
  text = replaceOnce(
    text,
    `.finance-overview-groups th:nth-child(5) {\n  background: #f7f7f5;\n}`,
    `.finance-overview-groups th:nth-child(5) {\n  color: #53615c;\n  background: #eef1ef;\n}\n\n.finance-overview-toggle,\n.finance-overview-toggle.button {\n  min-height: 34px;\n  color: #7a4200 !important;\n  background: #ffead0 !important;\n  border-color: #e7ad60 !important;\n  font-weight: 850;\n}\n\n.finance-overview-toggle:hover,\n.finance-overview-toggle.button:hover {\n  color: #5f3300 !important;\n  background: #ffddb1 !important;\n  border-color: #d9953e !important;\n}`,
    'botão laranja e documentação',
  );
  return text;
});

edit('src/data/exports/finance-exports.ts', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `const SOFT_FILL = 'FFEAF3F0';\nconst MONEY_FORMAT = 'R$ #,##0.00';`,
    `const SOFT_FILL = 'FFEAF3F0';\nconst BUDGET_HEADER_FILL = 'FFDDEBFA';\nconst BUDGET_BODY_FILL = 'FFF1F7FD';\nconst BUDGET_TEXT = 'FF1E5A8A';\nconst REALIZED_HEADER_FILL = 'FFDDF3E7';\nconst REALIZED_BODY_FILL = 'FFF0F9F5';\nconst REALIZED_TEXT = 'FF177354';\nconst FINANCE_HEADER_FILL = 'FFFDEACF';\nconst FINANCE_BODY_FILL = 'FFFFF8EF';\nconst FINANCE_TEXT = 'FF9A5A0A';\nconst DOCUMENT_HEADER_FILL = 'FFEFF2F0';\nconst DOCUMENT_BODY_FILL = 'FFF7F7F5';\nconst DOCUMENT_TEXT = 'FF53615C';\nconst MONEY_FORMAT = 'R$ #,##0.00';`,
    'paleta das exportações',
  );
  text = replaceOnce(
    text,
    `    { header: 'Dif. Em Relação a Verba', key: 'realizedVariance', width: 22, style: { numFmt: MONEY_FORMAT } },\n  ];`,
    `    { header: 'Dif. Em Relação a Verba', key: 'realizedVariance', width: 22, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Pago', key: 'paid', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Saldo a pagar', key: 'payable', width: 16, style: { numFmt: MONEY_FORMAT } },\n    { header: 'Documentação', key: 'documentation', width: 18 },\n  ];`,
    'colunas Financeiro e Documentação no Excel',
  );
  text = replaceOnce(
    text,
    `      realized: centsToNumber(row.realizedTotalCents),\n      realizedVariance: centsToNumber(row.realizedVarianceToBbCents),\n    });`,
    `      realized: centsToNumber(row.realizedTotalCents),\n      realizedVariance: centsToNumber(row.realizedVarianceToBbCents),\n      paid: centsToNumber(row.paidCents),\n      payable: centsToNumber(row.payableCents),\n      documentation:\n        row.documentationStatus === 'complete'\n          ? 'Completa'\n          : row.documentationStatus === 'partial'\n            ? 'Parcial'\n            : row.documentationStatus === 'pending'\n              ? 'Pendente'\n              : 'Sem obra',\n    });`,
    'valores Financeiro e Documentação no Excel',
  );
  text = replaceOnce(
    text,
    `  storesSheet.autoFilter = \`A1:O${Math.max(1, storesSheet.rowCount)}\`;`,
    `  const sectionStyles = [\n    { start: 5, end: 10, headerFill: BUDGET_HEADER_FILL, bodyFill: BUDGET_BODY_FILL, text: BUDGET_TEXT },\n    { start: 11, end: 15, headerFill: REALIZED_HEADER_FILL, bodyFill: REALIZED_BODY_FILL, text: REALIZED_TEXT },\n    { start: 16, end: 17, headerFill: FINANCE_HEADER_FILL, bodyFill: FINANCE_BODY_FILL, text: FINANCE_TEXT },\n    { start: 18, end: 18, headerFill: DOCUMENT_HEADER_FILL, bodyFill: DOCUMENT_BODY_FILL, text: DOCUMENT_TEXT },\n  ];\n  sectionStyles.forEach((section) => {\n    for (let column = section.start; column <= section.end; column += 1) {\n      const header = storesSheet.getRow(1).getCell(column);\n      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: section.headerFill } };\n      header.font = { bold: true, color: { argb: section.text } };\n      for (let rowIndex = 2; rowIndex <= storesSheet.rowCount; rowIndex += 1) {\n        storesSheet.getRow(rowIndex).getCell(column).fill = {\n          type: 'pattern',\n          pattern: 'solid',\n          fgColor: { argb: section.bodyFill },\n        };\n      }\n    }\n  });\n  storesSheet.autoFilter = \`A1:R${Math.max(1, storesSheet.rowCount)}\`;`,
    'cores e filtro da aba Lojas',
  );
  return text;
});

edit('src/tests/finance-exports.test.ts', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    `    expect(workbook.getWorksheet('Lojas')?.getCell('A2').value).toBe('LOJ-001');\n    expect(workbook.getWorksheet('Lojas')?.getCell('O2').value).toBe('Parcial');`,
    `    const stores = workbook.getWorksheet('Lojas');\n    expect(stores?.getCell('A2').value).toBe('LOJ-001');\n    expect(stores?.getCell('R2').value).toBe('Parcial');\n    expect(stores?.getCell('E1').fill).toMatchObject({ fgColor: { argb: 'FFDDEBFA' } });\n    expect(stores?.getCell('K1').fill).toMatchObject({ fgColor: { argb: 'FFDDF3E7' } });\n    expect(stores?.getCell('P1').fill).toMatchObject({ fgColor: { argb: 'FFFDEACF' } });\n    expect(stores?.getCell('R1').fill).toMatchObject({ fgColor: { argb: 'FFEFF2F0' } });`,
    'teste visual do Excel',
  );
  return text;
});
