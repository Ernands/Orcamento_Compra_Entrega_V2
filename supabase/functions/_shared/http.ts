const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function allowedOrigins(): string[] {
  const configured = Deno.env
    .get('ALLOWED_ORIGINS')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : defaultOrigins;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins().includes(origin) ? origin : defaultOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins().includes(origin);
}

export function json(request: Request, body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  if (!isAllowedOrigin(request)) return json(request, { code: 'ORIGIN_DENIED' }, 403);
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 16_384) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) return null;
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
