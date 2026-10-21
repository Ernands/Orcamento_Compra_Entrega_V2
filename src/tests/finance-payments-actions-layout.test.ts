import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';
import styles from '../pages/finance-payments-page.css?raw';
import occurrences from '../components/finance-payment-occurrences.tsx?raw';

describe('layout compacto das ações de Pagamentos', () => {
  it('mostra ações e status abaixo dos dados, sem coluna lateral e sem rolagem no desktop', () => {
    expect(page).toContain("finance-payment-meta-row ${index % 2 === 1 ? 'finance-payment-entry--striped' : ''}");
    expect(page).toContain('className="finance-payment-meta-bar"');
    expect(page).toContain('className="finance-payment-meta-status"');
    expect(page).toContain('<td colSpan={7}>');
    expect(page).not.toContain('className="finance-payments-actions-cell"');
    expect(page).not.toContain('className="finance-payments-actions-heading"');
    expect(styles).toContain('table-layout: fixed');
    expect(styles).toContain('.finance-payment-meta-bar .finance-payment-actions {');
    expect(styles).toContain('justify-content: flex-end');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('@media (max-width: 980px)');
    expect(styles).not.toContain('min-width: 1350px');
    expect(styles).toContain(':focus-visible');
  });

  it('mantém os quatro botões lado a lado com dimensões naturais e quebra organizada', () => {
    expect(styles).toContain('.finance-payment-actions {\n  display: flex;');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('width: auto;\n  flex: 0 0 auto;\n  min-height: 34px');
    expect(styles).toContain('Final cascade guard: never let action buttons fill the entire record width');
    expect(styles).toContain('.finance-payments-table .finance-payment-meta-bar .finance-payment-actions > .finance-payment-action,');
    expect(styles).toContain('min-height: 35px');
    expect(styles).not.toContain('grid-template-columns: minmax(0, 1fr);\n  gap: 6px;\n  width: 100%;');
  });

  it('delimita cada lançamento com espaçamento e bordas leves, inclusive em telas menores', () => {
    expect(page).toContain("finance-payment-info-row ${index % 2 === 1 ? 'finance-payment-entry--striped' : ''}");
    expect(page).toContain("finance-payment-meta-row ${index % 2 === 1 ? 'finance-payment-entry--striped' : ''}");
    expect(styles).toContain('border-top: 8px solid #f0f4f1');
    expect(styles).toContain('border-left: 1px solid #dce6df');
    expect(styles).toContain('font-size: 0.85rem');
    expect(styles).toContain('border-radius: 9px 9px 0 0');
    expect(styles).toContain('border-radius: 0 0 9px 9px');
    expect(styles).toContain('@media (max-width: 520px)');
  });

  it('alterna branco e verde suave por lançamento inteiro, inclusive sua faixa de ações', () => {
    expect(page).toContain('filteredRows.map((row, index)');
    expect((page.match(/index % 2 === 1 \? 'finance-payment-entry--striped'/g) || []).length).toBe(2);
    expect(styles).toContain('.finance-payments-table .finance-payment-entry--striped {');
    expect(styles).toContain('--finance-payment-card-bg: #edf6f1');
    expect(styles).toContain('--finance-payment-footer-bg: #e6f1eb');
    expect(styles).toContain('background: var(--finance-payment-card-bg)');
    expect(styles).toContain('background: var(--finance-payment-footer-bg)');
    expect(styles).toContain('@media (max-width: 980px)');
  });

  it('mantém links, permissões e callbacks existentes', () => {
    expect(page).toContain('label="Ver ocorrências"');
    expect(page).toContain('onClick={() => setDatesRow(');
    expect(page).toContain('to={originHref(row)}');
    expect(page).toContain('onClick={() => setDocumentsRow(row)}');
    expect(page).toContain('<span>Ver origem</span>');
    expect(page).toContain('<span>Ver anexos</span>');
    expect(page).toContain('<span>Conciliação</span>');
    expect(page).toContain('<span>Editar programação</span>');
    expect(page).toContain('className="finance-payment-action-placeholder"');
  });

  it('acrescenta rótulo ao botão de ocorrências de modo retrocompatível', () => {
    expect(occurrences).toContain('label?: string');
    expect(occurrences).toContain("label || 'Ver datas dos pagamentos'");
    expect(occurrences).toContain('onClick={onClick}');
    expect(occurrences).toContain('{label && <span>{label}</span>}');
  });

  it('elimina os estilos de links dispersos da versão anterior', () => {
    expect(styles).not.toContain('.finance-payment-origin-link {');
    expect(styles).not.toContain('.finance-payment-document-link {');
    expect(styles).toContain('.finance-payment-meta-bar .finance-payment-actions {');
  });
});
