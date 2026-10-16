import { describe, expect, it } from 'vitest';
import page from '../pages/works-page.tsx?raw';
import css from '../pages/works-page.css?raw';

describe('categorias e filtro de documentação em Obras e Serviços', () => {
  it('inclui Material para obra na lista de categorias', () => {
    expect(page).toContain("'Material para obra'");
    expect(page).toContain('CATEGORIES.map((entry)');
  });
  it('filtra a lista pela mesma classificação exibida em cada obra', () => {
    expect(page).toContain('aria-label="Status da documentação"');
    expect(page).toContain("const [documentationFilter, setDocumentationFilter] = useState('')");
    expect(page).toContain('serviceTotals(service).documentationStatus === documentationFilter');
    expect(page).toContain('DOCUMENTATION_STATUS_LABELS[current.documentationStatus]');
    expect(page).toContain("none: 'Sem documentação'");
    expect(page).toContain("incomplete: 'Incompleta'");
    expect(page).toContain("complete: 'Completa'");
    expect(css).toContain('.works-documentation-status--incomplete');
  });
});
