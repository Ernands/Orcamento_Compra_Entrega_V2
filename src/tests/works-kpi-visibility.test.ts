import { describe, expect, it } from 'vitest';
import css from '../pages/works-page.css?raw';

describe('works KPI visibility', () => {
  it('keeps monetary values on one line without truncation while allowing labels to wrap', () => {
    expect(css).toContain('.works-kpis article > .finance-amount');
    expect(css).toContain('grid-column:1/-1;');
    expect(css).toContain('overflow:visible;');
    expect(css).toContain('white-space:nowrap;');
    expect(css).toContain('.works-kpis article > span:not(.finance-amount)');
    expect(css).toContain('white-space:normal;');
    expect(css).toContain('overflow-wrap:break-word;');
    expect(css).toContain('.works-kpi-group--documents > div');
    expect(css).toContain('grid-template-columns:1fr');
  });

  it('stacks grouped KPIs earlier when the sidebar reduces available width', () => {
    expect(css).toContain('@media (max-width: 1380px)');
  });
});
