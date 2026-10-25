import { describe, expect, it } from 'vitest';
import works from '../pages/works-page.tsx?raw';
import worksCss from '../pages/works-page.css?raw';

describe('Obras e Serviços / KPIs executivos', () => {
  it('mantém os cinco indicadores vinculados aos totais existentes', () => {
    expect(works).toContain('aria-label="Resumo de Obras e Serviços"');
    for (const field of [
      'budgetCents', 'contractedCents', 'paidCents', 'payableCents', 'missingDocumentsCents',
    ]) {
      expect(works).toContain('<FinanceAmount cents={totals.' + field + '} />');
    }
    expect(works).toContain("totals.missingDocumentsCents > 0n ? 'works-kpi--warning' : 'works-kpi--ok'");
    expect(works).toContain('<span>Falta documentar</span>');
    expect(works).toContain('<span>Contratado</span>');
    expect(works).toContain('<span>Pago</span>');
    expect(works).toContain('<span>A pagar</span>');
    expect(works).toContain("import { FinanceAmount } from '../components/finance-amount'");
  });

  it('apresenta fundos neutros e cores do padrão gerencial com legibilidade', () => {
    expect(worksCss).toContain('--works-accent:#bea5ff');
    expect(worksCss).toContain('--works-accent:#91eda7');
    expect(worksCss).toContain('--works-accent:#ffc28c');
    expect(worksCss).toContain('article:last-child > .finance-amount {color:#255f8d}');
    expect(worksCss).toContain('.works-kpi-group--cash article > .finance-amount {color:#256b4b}');
    expect(worksCss).toContain('.works-kpis .works-kpi--warning > .finance-amount {color:#96620f}');
    expect(worksCss).toContain('border-top:7px solid var(--works-accent)');
    expect(worksCss).toContain('background:#fff');
  });

  it('não separa R$ do valor e mantém responsividade', () => {
    expect(worksCss).toContain('grid-column:1/-1');
    expect(worksCss).toContain('white-space:nowrap');
    expect(worksCss).toContain('word-break:keep-all');
    expect(worksCss).toContain('.finance-amount > .finance-amount__digits');
    expect(worksCss).toContain('@media(max-width:620px)');
  });
});
