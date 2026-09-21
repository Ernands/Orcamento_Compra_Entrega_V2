import { describe, expect, it } from 'vitest';
import { moneyToCents, quantityToThousandths } from '../domain/supply-calculations';
import migration from '../../supabase/migrations/20260921103619_seed_supply_planned_budget.sql?raw';

const itemPattern =
  /\('orcamento_previsto:\d{3}', '((?:''|[^'])*)', '([^']+)', ([0-9.]+), ([0-9.]+), ([0-9.]+), ([0-9.]+)\)/g;
const items = [...migration.matchAll(itemPattern)].map((match) => ({
  name: match[1].replaceAll("''", "'"),
  group: match[2],
  unitPrice: match[3],
  attended: match[4],
  unattended: match[5],
  baependi: match[6],
}));

function lineTotal(unitPrice: string, quantity: string): bigint {
  return (moneyToCents(unitPrice) * quantityToThousandths(quantity) + 500n) / 1000n;
}

describe('planned budget spreadsheet seed', () => {
  it('preserva a carga inicial sem os dois ares e com filtros separados', () => {
    expect(items).toHaveLength(51);

    const attended = items.reduce(
      (total, item) => total + lineTotal(item.unitPrice, item.attended),
      0n,
    );
    const unattended = items.reduce(
      (total, item) => total + lineTotal(item.unitPrice, item.unattended),
      0n,
    );
    const baependi = items.reduce(
      (total, item) => total + lineTotal(item.unitPrice, item.baependi),
      0n,
    );

    expect(attended).toBe(2191093n);
    expect(unattended).toBe(1713941n);
    expect(baependi).toBe(2902676n);
    expect(attended * 13n + unattended * 12n + baependi).toBe(51954177n);
  });

  it('mantém os dois itens de valor zero ativos e sem inventar UUIDs', () => {
    expect(
      items
        .filter(
          (item) =>
            moneyToCents(item.unitPrice) === 0n &&
            quantityToThousandths(item.attended) === 0n &&
            quantityToThousandths(item.unattended) === 0n &&
            quantityToThousandths(item.baependi) === 0n,
        )
        .map((item) => item.name),
    ).toEqual(['Fonte de alimentação SmartPOS', 'Bancada de apoio']);
    expect(migration).toContain("true,\n  'Valor importado de Lista_Orçamento_Sistema.xlsx'");
    expect(migration).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it('nunca cria nem reativa itens do catálogo automaticamente', () => {
    expect(migration).toContain('planned budget seed requires existing catalog items. Missing: %');
    expect(migration).toContain('planned budget seed requires active catalog items. Inactive: %');
    expect(migration).not.toMatch(/insert into public\.supply_items/i);
    expect(migration).not.toMatch(/update public\.supply_items/i);
    expect(migration.match(/and item\.active/g)).toHaveLength(5);
  });

  it('mapeia exatamente as 26 lojas da planilha por código de negócio', () => {
    const storeCodes = [
      ...migration.matchAll(/\('(Com atendimento|Sem atendimento|Baependi)', '(LOJ-\d{3})'\)/g),
    ].map((match) => match[2]);

    expect(storeCodes).toHaveLength(26);
    expect(new Set(storeCodes).size).toBe(26);
    expect(storeCodes).not.toContain('LOJ-022');
    expect(storeCodes).not.toContain('LOJ-028');
  });
  it('prioriza ITM-0083 para o item Caneta no seed', () => {
    expect(migration).toContain("item.codigo_negocio = 'ITM-0083'");
  });

  it('exige as 26 lojas e valida o total integral do orçamento previsto', () => {
    expect(migration).toContain('planned budget seed requires stores');
    expect(migration).toContain('v_store_count <> 26');
    expect(migration).toContain('v_store_link_count <> 1202');
    expect(migration).toContain('v_total <> 519541.77');
    expect(migration).toContain("'LOJ-008'");
    expect(migration).not.toContain("'LOJ-022'");
    expect(migration).not.toContain("'LOJ-028'");
  });

  it('usa os itens existentes em PROD e omite os ares desta carga inicial', () => {
    expect(migration).toContain("item.codigo_negocio = 'ITM-0030'");
    expect(migration).toContain("item.codigo_negocio = 'ITM-0091'");
    expect(migration).toContain("item.codigo_negocio = 'ITM-0014'");
    expect(migration).toContain("item.codigo_negocio = 'ITM-0025'");
    expect(migration).toContain("item.codigo_negocio = 'ITM-0072'");
    expect(items.map((item) => item.name)).toContain("Filtro de privacidade para monitor 23,8''");
    expect(items.map((item) => item.name)).toContain("Filtro de privacidade para monitor - Notebook 15.6''");
    expect(items.map((item) => item.name)).not.toContain('Ar condicionado 1');
    expect(items.map((item) => item.name)).not.toContain('Ar condicionado 2');
  });

});
