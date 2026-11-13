import { describe, expect, it } from 'vitest';
import { assertNetlifyPreviewUsesDev } from '../lib/preview-env-guard';

describe('Netlify Preview isolation', () => {
  it('permite apenas o Supabase DEV em Deploy Preview do Implanta 27', () => {
    expect(() => assertNetlifyPreviewUsesDev(
      'deploy-preview-85--implanta-27.netlify.app',
      'https://wiynrfblfigngkvleyqg.supabase.co',
    )).not.toThrow();
    expect(() => assertNetlifyPreviewUsesDev(
      'deploy-preview-85--implanta-27.netlify.app',
      'https://vskvsujhpinanthxewab.supabase.co',
    )).toThrow('Supabase DEV');
  });

  it('não bloqueia outros dominios quando nao sao Deploy Preview', () => {
    expect(() => assertNetlifyPreviewUsesDev(
      'implanta-27.netlify.app',
      'https://vskvsujhpinanthxewab.supabase.co',
    )).not.toThrow();
    expect(() => assertNetlifyPreviewUsesDev(
      'localhost',
      'http://localhost:54321',
    )).not.toThrow();
  });
});
