import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/pages/finance-store-detail-page.tsx', 'utf8');

describe('filtro por grupo no detalhe financeiro da loja', () => {
  it('oferece Equipamentos, Mobiliário e Obras e Serviços', () => {
    expect(source).toContain('aria-label="Grupo"');
    expect(source).toContain("equipment: 'Equipamentos'");
    expect(source).toContain("furniture: 'Mobiliário'");
    expect(source).toContain("works: 'Obras e Serviços'");
  });

  it('aplica o grupo aos itens, obras e exportações filtradas', () => {
    expect(source).toContain('financeItemCompositionGroup(');
    expect(source).toContain("groupFilter === 'works'");
    expect(source).toContain('items: filteredItemRows');
    expect(source).toContain('works: filteredStoreWorks');
    expect(source).toContain('Grupo:');
  });
});
