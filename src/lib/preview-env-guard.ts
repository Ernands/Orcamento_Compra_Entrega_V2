/** Prevent a public Netlify Deploy Preview from connecting to production by mistake.
 * The project ref is public configuration, not an authentication credential.
 */
const DEV_SUPABASE_HOST = 'wiynrfblfigngkvleyqg.supabase.co';
const NETLIFY_PREVIEW_HOST = /^deploy-preview-\d+--implanta-27\.netlify\.app$/i;

export function assertNetlifyPreviewUsesDev(hostname: string, supabaseUrl: string): void {
  if (!NETLIFY_PREVIEW_HOST.test(hostname)) return;
  const supabaseHost = new URL(supabaseUrl).hostname.toLowerCase();
  if (supabaseHost !== DEV_SUPABASE_HOST) {
    throw new Error(
      'Segurança: a Deploy Preview está conectada a um banco diferente do Supabase DEV. ' +
      'Revise as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no Netlify.',
    );
  }
}
