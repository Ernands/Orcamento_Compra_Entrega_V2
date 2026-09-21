import { describe, expect, it } from 'vitest';
import css from '../pages/works-page.css?raw';

describe('works KPI visibility', () => {
  it('does not truncate KPI labels or monetary values', () => {
    expect(css).toContain('.works-kpis article strong');
    expect(css).toContain('grid-column: 1 / -1;');
    expect(css).toContain('text-overflow: clip;');
    expect(css).toContain('white-space: normal;');
    expect(css).toContain('.works-kpi-group--documents > div');
    expect(css).toContain('grid-template-columns: 1fr;');
  });

  it('stacks grouped KPIs earlier when the sidebar reduces available width', () => {
    expect(css).toContain('@media (max-width: 1380px)');
  });
});
