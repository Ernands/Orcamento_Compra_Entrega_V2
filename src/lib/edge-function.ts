import { supabase } from '../data/supabase/client';

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

interface FunctionInvocationResult {
  data: unknown;
  error: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInvocationResult(value: unknown): value is FunctionInvocationResult {
  return isRecord(value) && 'data' in value && 'error' in value;
}

function parseErrorBody(value: unknown): FunctionErrorBody | undefined {
  if (!isRecord(value)) return undefined;

  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

function responseFromError(value: unknown): Response | undefined {
  if (!isRecord(value)) return undefined;
  return value.context instanceof Response ? value.context : undefined;
}

export async function invokeEdgeFunction<TResponse>(
  name: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const invocation: unknown = await supabase.functions.invoke<TResponse>(name, { body });

  if (!isInvocationResult(invocation)) {
    throw new EdgeFunctionError(
      'A funcao segura retornou uma resposta invalida.',
      'INVALID_FUNCTION_RESPONSE',
    );
  }

  const { data, error } = invocation;

  if (!error && data !== null) {
    return data as TResponse;
  }

  if (!error) {
    throw new EdgeFunctionError(
      'A funcao segura retornou uma resposta vazia.',
      'EMPTY_FUNCTION_RESPONSE',
    );
  }

  let parsed: FunctionErrorBody | undefined;

  const response = responseFromError(error);
  if (response) {
    try {
      const responseBody: unknown = await response.clone().json();
      parsed = parseErrorBody(responseBody);
    } catch {
      parsed = undefined;
    }
  }

  throw new EdgeFunctionError(
    parsed?.message || 'Nao foi possivel concluir a operacao.',
    parsed?.code || 'EDGE_FUNCTION_ERROR',
    response?.status,
  );
}
