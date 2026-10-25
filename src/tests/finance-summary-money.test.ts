import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinanceAmount } from '../components/finance-amount';
import overviewPage from '../pages/finance-page.tsx?raw';
import detailPage from '../pages/finance-store-detail-page.tsx?raw';
import accountPage from '../pages/finance-account-reconciliation-page.tsx?raw';
import amountCss from '../components/finance-amount.css?raw';
import unifiedCss from '../styles/finance-kpi-unified.css?raw';
import financeCss from '../pages/finance-page.css?raw';
import storeCss from '../pages/finance-store-detail-page.css?raw';

describe('Resumo financeiro: moeda e layout executivo', () => {
  it('exibe valores milionários sem separar R$ dos algarismos nem perder centavos', () => {
    const html = renderToStaticMarkup(createElement(FinanceAmount, {cents:123456789n}));
    expect(html).toContain('title="R$ 1.234.567,89"');
    expect(html).toContain('>R$</span>');
    expect(html).toContain('>1.234.567,89</span>');
    expect(html).toContain('class="finance-amount"');
  });
  it('preserva o sinal negativo e o formato BRL original', () => {
    const html = renderToStaticMarkup(createElement(FinanceAmount, {cents:-1556795n}));
    expect(html).toContain('title="-R$ 15.567,95"');
    expect(html).toContain('>-R$</span>');
    expect(html).toContain('>15.567,95</span>');
  });
  it('mantém os seis valores oficiais no topo de Visão Geral e Detalhe da Loja', () => {
    expect((overviewPage.match(/<FinanceAmount\b/g) || []).length).toBe(6);
    expect((detailPage.match(/<FinanceAmount\b/g) || []).length).toBe(6);
    for (const file of [overviewPage, detailPage]) {
      expect(file).toContain("import '../styles/finance-kpi-unified.css'");
    }
    expect(overviewPage).toContain('Excedente:');
    expect(detailPage).toContain('Disponível BB:');
  });
  it('trata números opcionais e mantém os dois indicadores de texto da Conciliação', () => {
    expect((accountPage.match(/<FinanceAmount\b/g) || []).length).toBe(6);
    expect(accountPage).toContain("import '../styles/finance-kpi-unified.css'");
    expect(accountPage).toContain("actualBalanceCents === null ? <strong>Não informado</strong>");
    expect(accountPage).toContain("balanceDifferenceCents === null ? <strong>Não calculada</strong>");
    expect(accountPage).toContain('Conferência diária');
    expect(accountPage).toContain('Situação da conta');
  });
  it('alinha Orçado roxo, Realizado azul e Financeiro verde nas tabelas', () => {
    expect(financeCss).toContain('.finance-overview-groups th:nth-child(2) {\n  color: #624693;');
    expect(financeCss).toContain('.finance-overview-groups th:nth-child(3) {\n  color: #255f8d;');
    expect(financeCss).toContain('.finance-overview-groups th:nth-child(4) {\n  color: #256b4b;');
    expect(financeCss).toContain('.finance-overview-table tbody td:nth-child(n + 13):nth-child(-n + 14) strong');
    expect(storeCss).toContain('.finance-store-detail__composition-table th:nth-child(2) {\n  color: #624693;');
    expect(storeCss).toContain('.finance-store-detail__composition-table th:nth-child(3),');
    expect(storeCss).toContain('  background: #e9f3fd;');
    expect(storeCss).toContain('  background: #e8f5ed;');
  });
  it('usa largura total, evita quebra monetária e preserva responsividade', () => {
    expect(amountCss).toContain('white-space: nowrap');
    expect(amountCss).toContain('font-variant-numeric: tabular-nums');
    expect(amountCss).toContain('word-break: keep-all');
    expect(unifiedCss).toContain('grid-column:1/-1');
    expect(unifiedCss).toContain('border-top:7px solid var(--finance-accent)');
    expect(unifiedCss).toContain('--finance-accent:#bea5ff');
    expect(unifiedCss).toContain('--finance-accent:#96c9ff');
    expect(unifiedCss).toContain('--finance-accent:#91eda7');
    expect(unifiedCss).toContain('@media(max-width:680px)');
    expect(unifiedCss).toContain('.finance-account-kpis .finance-account-kpi');
    expect(unifiedCss).toContain('> .finance-amount > .finance-amount__digits');
    expect(unifiedCss).toContain('color:inherit;');
  });
});
