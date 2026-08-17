import { supabase } from '../data/supabase/client';
import { publicEnv } from './env';

export class EdgeFunctionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

interface FunctionErrorBody {
  code?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseErrorBody(value: unknown): FunctionErrorBody | undefined {
  if (!isRecord(value)) return undefined;

  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function invokeEdgeFunction<TResponse>(
  name: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    apikey: publicEnv.supabasePublishableKey,
    'Content-Type': 'application/json',
  };

  // Publishable keys are not JWTs. Only send Authorization when we have a real user session.
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${publicEnv.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new EdgeFunctionError(
      'Nao foi possivel acessar a funcao segura.',
      'EDGE_FUNCTION_UNAVAILABLE',
    );
  }

  const responseBody = await readResponseBody(response);

  if (response.ok && responseBody !== null) {
    return responseBody as TResponse;
  }

  if (response.ok) {
    throw new EdgeFunctionError(
      'A funcao segura retornou uma resposta vazia.',
      'EMPTY_FUNCTION_RESPONSE',
      response.status,
    );
  }

  const parsed = parseErrorBody(responseBody);
  throw new EdgeFunctionError(
    parsed?.message || 'Nao foi possivel concluir a operacao.',
    parsed?.code || 'EDGE_FUNCTION_ERROR',
    response.status,
  );
}
