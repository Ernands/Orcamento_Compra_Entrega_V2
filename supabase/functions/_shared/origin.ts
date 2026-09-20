const DEV_SUPABASE_URL = 'https://wiynrfblfigngkvleyqg.supabase.co';
const NETLIFY_DEV_PREVIEW_ORIGIN =
  /^https:\/\/deploy-preview-[1-9][0-9]*--implanta-27\.netlify\.app$/;

export function isTrustedDevPreview(origin: string, projectUrl: string): boolean {
  return (
    projectUrl.replace(/\/+$/, '') === DEV_SUPABASE_URL && NETLIFY_DEV_PREVIEW_ORIGIN.test(origin)
  );
}
