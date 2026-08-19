import { describe, expect, it, vi } from 'vitest';
import { createRetryingFetch } from '../data/supabase/retry-fetch';

describe('createRetryingFetch', () => {
  it('repete uma leitura GET quando o servidor responde com erro transitorio', async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const retryingFetch = createRetryingFetch(baseFetch, 0);

    const response = await retryingFetch('https://example.test/rest/v1/supply_quote_stores');

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it('repete uma leitura GET quando ocorre falha de rede', async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const retryingFetch = createRetryingFetch(baseFetch, 0);

    const response = await retryingFetch('https://example.test/rest/v1/supply_quotes');

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it('nao repete requisicoes de escrita', async () => {
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    const retryingFetch = createRetryingFetch(baseFetch, 0);

    const response = await retryingFetch('https://example.test/rest/v1/rpc/save_supply_quote', {
      method: 'POST',
    });

    expect(response.status).toBe(500);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });
});
