import { assertNetlifyPreviewUsesDev } from './preview-env-guard';

function required(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = import.meta.env[name]?.trim();

  if (!value) {
    throw new Error(`Variavel publica obrigatoria ausente: ${name}`);
  }

  return value;
}

const supabaseUrl = required('VITE_SUPABASE_URL');
if (typeof window !== 'undefined') {
  assertNetlifyPreviewUsesDev(window.location.hostname, supabaseUrl);
}

export const publicEnv = {
  supabaseUrl,
  supabasePublishableKey: required('VITE_SUPABASE_PUBLISHABLE_KEY'),
  appEnv: import.meta.env.VITE_APP_ENV?.trim() || 'local',
};
