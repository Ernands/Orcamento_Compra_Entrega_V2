import { describe, expect, it } from 'vitest';
import {
  financePaymentStoreLabel,
  financePaymentStoreTitle,
} from '../domain/finance-payment-store-label';
import page from '../pages/finance-payments-page.tsx?raw';

describe('cidade e UF em Financeiro > Pagamentos', () => {
  const stores = new Map([
    ['s14', { code: 'LOJ-014', city: 'Petrolândia', state: 'PE' }],
    ['s20', { code: 'LOJ-020', city: 'Touros', state: 'RN' }],
    ['s25', { code: 'LOJ-025', city: 'Ipojuca', state: 'PE' }],
  ]);

  it('exibe código, nome da cidade e UF para cada loja individual', () => {
    expect(financePaymentStoreLabel({
      storeIds: ['s14'], storeCodes: ['LOJ-014'], states: ['PE'],
    }, stores)).toBe('LOJ-014 · Petrolândia/PE');
    expect(financePaymentStoreLabel({
      storeIds: ['s20'], storeCodes: ['LOJ-020'], states: ['RN'],
    }, stores)).toBe('LOJ-020 · Touros/RN');
  });

  it('resume compras compartilhadas sem eliminar as cidades do tooltip', () => {
    const shared = { storeIds: ['s14', 's20', 's25'],
      storeCodes: ['LOJ-014', 'LOJ-020', 'LOJ-025'], states: ['PE', 'RN'] };
    expect(financePaymentStoreLabel(shared, stores)).toBe(
      '3 lojas · LOJ-014 · Petrolândia/PE; LOJ-020 · Touros/RN +1 outras',
    );
    expect(financePaymentStoreTitle(shared, stores)).toBe(
      'LOJ-014 · Petrolândia/PE | LOJ-020 · Touros/RN | LOJ-025 · Ipojuca/PE',
    );
  });

  it('usa o rótulo anterior quando faltam os dados da loja, sem inventar cidade', () => {
    expect(financePaymentStoreLabel({
      storeIds: ['legacy'], storeCodes: ['LOJ-077'], states: ['MG'],
    }, stores)).toBe('LOJ-077 · MG');
    expect(financePaymentStoreLabel({
      storeIds: [], storeCodes: [], states: [],
    }, stores)).toBe('Sem loja definida');
  });

  it('aplica o rótulo nas três abas da tabela sem alterar valores', () => {
    expect(page).toContain('const store = financePaymentStoreLabel(row, storesById)');
    expect(page).toContain('const storeTitle = financePaymentStoreTitle(row, storesById)');
    expect(page).toContain('<small title={storeTitle}>{store}</small>');
    expect(page).toContain('data-label="Loja / cidade / UF"');
    expect(page).toContain('<strong title={storeTitle}>{store}</strong>');
    expect(page).toContain("'planned' ? 'Vencimento'");
    expect(page).toContain("view === 'paid'");
  });
});
