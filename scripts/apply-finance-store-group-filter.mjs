import fs from 'node:fs';

const pagePath = 'src/pages/finance-store-detail-page.tsx';
let source = fs.readFileSync(pagePath, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Anchor not found: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  `  buildFinanceStoreCompositionRows,\n  buildFinanceStoreItemRows,\n`,
  `  buildFinanceStoreCompositionRows,\n  buildFinanceStoreItemRows,\n  financeItemCompositionGroup,\n`,
  'finance overview import',
);

replaceOnce(
  `const FINANCIAL_GROUP_LABELS = {\n  equipment: 'Equipamentos',\n  furniture: 'Mobiliário',\n  general: 'Mobiliário',\n} as const;\n`,
  `const FINANCIAL_GROUP_LABELS = {\n  equipment: 'Equipamentos',\n  furniture: 'Mobiliário',\n  general: 'Mobiliário',\n} as const;\n\nconst DETAIL_GROUP_LABELS = {\n  equipment: 'Equipamentos',\n  furniture: 'Mobiliário',\n  works: 'Obras e Serviços',\n} as const;\n\ntype DetailGroupFilter = '' | keyof typeof DETAIL_GROUP_LABELS;\n`,
  'group labels',
);

replaceOnce(
  `  const [query, setQuery] = useState('');\n  const [itemStatusFilter, setItemStatusFilter] = useState('');\n`,
  `  const [query, setQuery] = useState('');\n  const [groupFilter, setGroupFilter] = useState<DetailGroupFilter>('');\n  const [itemStatusFilter, setItemStatusFilter] = useState('');\n`,
  'group filter state',
);

replaceOnce(
  `      itemRows\n        .filter((row) => !itemStatusFilter || row.purchaseStatus === itemStatusFilter)\n`,
  `      itemRows\n        .filter(\n          (row) =>\n            !groupFilter ||\n            (groupFilter !== 'works' &&\n              financeItemCompositionGroup(\n                row.itemCategory,\n                row.itemSubcategory,\n                row.itemGroupName,\n                row.itemName,\n                row.itemFinancialGroup || null,\n              ) === groupFilter),\n        )\n        .filter((row) => !itemStatusFilter || row.purchaseStatus === itemStatusFilter)\n`,
  'item group filtering',
);

replaceOnce(
  `    [detailSearch, itemRows, itemStatusFilter],\n`,
  `    [detailSearch, groupFilter, itemRows, itemStatusFilter],\n`,
  'item dependencies',
);

replaceOnce(
  `      storeWorks\n        .filter((work) => !workStatusFilter || work.status === workStatusFilter)\n`,
  `      storeWorks\n        .filter(() => !groupFilter || groupFilter === 'works')\n        .filter((work) => !workStatusFilter || work.status === workStatusFilter)\n`,
  'works group filtering',
);

replaceOnce(
  `    [detailSearch, storeWorks, workCategoryFilter, workStatusFilter],\n`,
  `    [detailSearch, groupFilter, storeWorks, workCategoryFilter, workStatusFilter],\n`,
  'works dependencies',
);

replaceOnce(
  `    if (query.trim()) parts.push(\`Busca: \${query.trim()}\`);\n    if (itemStatusFilter)\n`,
  `    if (query.trim()) parts.push(\`Busca: \${query.trim()}\`);\n    if (groupFilter) parts.push(\`Grupo: \${DETAIL_GROUP_LABELS[groupFilter]}\`);\n    if (itemStatusFilter)\n`,
  'filters text group',
);

replaceOnce(
  `  }, [itemStatusFilter, query, workCategoryFilter, workStatusFilter]);\n`,
  `  }, [groupFilter, itemStatusFilter, query, workCategoryFilter, workStatusFilter]);\n`,
  'filters text dependencies',
);

replaceOnce(
  `        </label>\n        <label>\n          Situação dos itens\n`,
  `        </label>\n        <label>\n          Grupo\n          <select\n            aria-label="Grupo"\n            value={groupFilter}\n            onChange={(event) => setGroupFilter(event.target.value as DetailGroupFilter)}\n          >\n            <option value="">Todos os grupos</option>\n            {Object.entries(DETAIL_GROUP_LABELS).map(([value, label]) => (\n              <option key={value} value={value}>{label}</option>\n            ))}\n          </select>\n        </label>\n        <label>\n          Situação dos itens\n`,
  'group select',
);

replaceOnce(
  `      <section className="finance-store-detail__panel finance-store-detail__panel--items">\n`,
  `      {groupFilter !== 'works' && (\n      <section className="finance-store-detail__panel finance-store-detail__panel--items">\n`,
  'items panel start',
);

replaceOnce(
  `      </section>\n\n      <section className="finance-store-detail__panel finance-store-detail__panel--works">\n`,
  `      </section>\n      )}\n\n      {(!groupFilter || groupFilter === 'works') && (\n      <section className="finance-store-detail__panel finance-store-detail__panel--works">\n`,
  'panel transition',
);

replaceOnce(
  `      </section>\n\n      {canDocuments && documentPopup && (\n`,
  `      </section>\n      )}\n\n      {canDocuments && documentPopup && (\n`,
  'works panel end',
);

fs.writeFileSync(pagePath, source);

const testPath = 'src/tests/finance-store-group-filter.test.ts';
fs.writeFileSync(
  testPath,
  `import fs from 'node:fs';\nimport { describe, expect, it } from 'vitest';\n\nconst source = fs.readFileSync(\n  new URL('../pages/finance-store-detail-page.tsx', import.meta.url),\n  'utf8',\n);\n\ndescribe('filtro por grupo no detalhe financeiro da loja', () => {\n  it('oferece Equipamentos, Mobiliário e Obras e Serviços', () => {\n    expect(source).toContain('aria-label="Grupo"');\n    expect(source).toContain("equipment: 'Equipamentos'");\n    expect(source).toContain("furniture: 'Mobiliário'");\n    expect(source).toContain("works: 'Obras e Serviços'");\n  });\n\n  it('aplica o grupo aos itens, obras e exportações filtradas', () => {\n    expect(source).toContain('financeItemCompositionGroup(');\n    expect(source).toContain("groupFilter === 'works'");\n    expect(source).toContain('items: filteredItemRows');\n    expect(source).toContain('works: filteredStoreWorks');\n    expect(source).toContain('Grupo:');\n  });\n});\n`,
);

console.log('Filtro por grupo aplicado ao Detalhe da Loja.');
