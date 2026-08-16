import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.112.3';

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function parseKeySet(name: string): string[] {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.values(parsed).filter(Boolean);
  } catch {
    return [];
  }
}

export function supabaseUrl(): string {
  return env('SUPABASE_URL');
}

export function publishableKeys(): string[] {
  const keys = [
    ...parseKeySet('SUPABASE_PUBLISHABLE_KEYS'),
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    Deno.env.get('SUPABASE_ANON_KEY'),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (!keys.length) throw new Error('No publishable Supabase key configured.');
  return [...new Set(keys)];
}

export function secretKey(): string {
  return (
    parseKeySet('SUPABASE_SECRET_KEYS')[0] ||
    Deno.env.get('SUPABASE_SECRET_KEY')?.trim() ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    env('SUPABASE_SECRET_KEY')
  );
}

export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function passwordAuthClient(): SupabaseClient {
  return createClient(supabaseUrl(), publishableKeys()[0], {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function userClient(request: Request): SupabaseClient {
  return createClient(supabaseUrl(), publishableKeys()[0], {
    global: { headers: { Authorization: request.headers.get('Authorization') || '' } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function hasValidPublishableKey(request: Request): boolean {
  const candidate = request.headers.get('apikey') || '';
  return publishableKeys().some((key) => key === candidate);
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const token = request.headers
    .get('Authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error ? null : data.user;
}
