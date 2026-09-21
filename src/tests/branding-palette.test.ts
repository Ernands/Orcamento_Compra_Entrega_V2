import { describe, expect, it } from 'vitest';
import styles from '../styles.css?raw';

describe('Implanta Lojas Mais BB branding', () => {
  it('mantem a paleta BB e o watermark da tela de login', () => {
    expect(styles).toContain('--brand: #465eff');
    expect(styles).toContain('--brand-light: #54dcfc');
    expect(styles).toContain('--accent: #fcfc30');
    expect(styles).toContain("content: 'Loja BB'");
    expect(styles).not.toContain("content: '27'");
  });

  it('usa o azul de marca na login e na barra lateral', () => {
    expect(styles).toMatch(/\.login-brand\s*\{[\s\S]*?background: var\(--brand\)/);
    expect(styles).toMatch(/\.sidebar\s*\{[\s\S]*?background: var\(--brand\)/);
  });
});
