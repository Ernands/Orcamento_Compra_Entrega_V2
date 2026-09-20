import { describe, expect, it } from 'vitest';
import { isTrustedDevPreview } from '../../supabase/functions/_shared/origin';

const DEV_URL = 'https://wiynrfblfigngkvleyqg.supabase.co';
const PROD_URL = 'https://vskvsujhpinanthxewab.supabase.co';

describe('origens dos Deploy Previews', () => {
  it('permite previews numerados do Netlify somente no projeto DEV', () => {
    expect(isTrustedDevPreview('https://deploy-preview-24--implanta-27.netlify.app', DEV_URL)).toBe(
      true,
    );
    expect(
      isTrustedDevPreview('https://deploy-preview-24--implanta-27.netlify.app', PROD_URL),
    ).toBe(false);
  });

  it('rejeita dominios parecidos e origens fora do padrao', () => {
    expect(isTrustedDevPreview('https://implanta-27.netlify.app', DEV_URL)).toBe(false);
    expect(
      isTrustedDevPreview('https://deploy-preview-24--implanta-27.netlify.app.evil.test', DEV_URL),
    ).toBe(false);
    expect(isTrustedDevPreview('http://deploy-preview-24--implanta-27.netlify.app', DEV_URL)).toBe(
      false,
    );
  });
});
