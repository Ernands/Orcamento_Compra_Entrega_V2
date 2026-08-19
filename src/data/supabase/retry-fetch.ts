const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export function createRetryingFetch(
  baseFetch: typeof fetch = fetch,
  delayMs = 250,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = requestMethod(input, init);
    const canRetry = method === 'GET' || method === 'HEAD';

    if (!canRetry) return baseFetch(input, init);

    try {
      const response = await baseFetch(input, init);
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      await wait(delayMs);
      return baseFetch(input, init);
    } catch {
      await wait(delayMs);
      return baseFetch(input, init);
    }
  };
}
