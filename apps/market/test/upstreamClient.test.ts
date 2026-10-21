import { describe, expect, it } from 'vitest';

import { UpstreamClient, UpstreamError } from '../src/upstream/client';
import type { FetchLike, M2MClient } from '../src/upstream/m2m';

const BASE = 'https://market.test';

/** Minimal M2M double: hands out tokens in order, records invalidations. */
const createM2M = () => {
  let issued = 0;
  const state = { invalidations: 0 };

  const m2m = {
    getToken: async () => `token_${++issued}`,
    invalidate: () => {
      state.invalidations += 1;
    },
  } as unknown as M2MClient;

  return { m2m, state };
};

const make = (fetchImpl: FetchLike, options: { retries?: number } = {}) => {
  const { m2m, state } = createM2M();
  const client = new UpstreamClient({
    baseUrl: BASE,
    m2m,
    fetchImpl,
    retries: options.retries ?? 2,
    backoffMs: 1,
    sleep: async () => {},
    timeoutMs: 50,
  });

  return { client, m2mState: state };
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

describe('UpstreamClient', () => {
  it('injects the bearer token and serialises query params', async () => {
    const calls: { init?: RequestInit; url: string }[] = [];
    const { client } = make(async (url, init) => {
      calls.push({ init, url });

      return json({ items: [], totalCount: 0 });
    });

    await client.get('/api/v1/agents', { page: 1, pageSize: 100, q: undefined });

    expect(calls[0].url).toBe(`${BASE}/api/v1/agents?page=1&pageSize=100`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer token_1');
  });

  it('refreshes the token once on 401 and retries', async () => {
    let call = 0;
    const { client, m2mState } = make(async () => {
      call += 1;

      return call === 1 ? new Response('expired', { status: 401 }) : json({ ok: true });
    });

    await expect(client.get('/api/v1/agents')).resolves.toEqual({ ok: true });
    expect(m2mState.invalidations).toBe(1);
    expect(call).toBe(2);
  });

  it('gives up on a second 401', async () => {
    const { client } = make(async () => new Response('expired', { status: 401 }));

    await expect(client.get('/api/v1/agents')).rejects.toThrow(/failed: 401/);
  });

  it('retries 429 and honours retry-after', async () => {
    const sleeps: number[] = [];
    let call = 0;
    const { m2m } = createM2M();
    const client = new UpstreamClient({
      baseUrl: BASE,
      m2m,
      fetchImpl: async () => {
        call += 1;

        return call === 1
          ? new Response('slow down', { status: 429, headers: { 'retry-after': '2' } })
          : json({ ok: true });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await expect(client.get('/api/v1/agents')).resolves.toEqual({ ok: true });
    expect(sleeps).toEqual([2000]);
  });

  it('retries 5xx up to the configured budget then throws', async () => {
    let call = 0;
    const { client } = make(
      async () => {
        call += 1;

        return new Response('boom', { status: 503 });
      },
      { retries: 2 },
    );

    await expect(client.get('/api/v1/agents')).rejects.toBeInstanceOf(UpstreamError);
    expect(call).toBe(3); // first attempt + 2 retries
  });

  it('does not retry a 404', async () => {
    let call = 0;
    const { client } = make(async () => {
      call += 1;

      return new Response('nope', { status: 404 });
    });

    await expect(client.get('/api/v1/agents/x')).rejects.toThrow(/failed: 404/);
    expect(call).toBe(1);
  });

  it('maps a timeout to 504', async () => {
    const { client } = make(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    });

    await expect(client.get('/api/v1/agents')).rejects.toMatchObject({ status: 504 });
  });

  it('refuses to leave the configured origin', async () => {
    const { client } = make(async () => json({}));

    await expect(client.get('https://evil.test/api/v1/agents')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('posts JSON bodies', async () => {
    const calls: { init?: RequestInit }[] = [];
    const { client } = make(async (_url, init) => {
      calls.push({ init });

      return json({ success: true });
    });

    await client.post('/api/v1/agents/x/fork', { identifier: 'fork_1' });

    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ identifier: 'fork_1' });
  });
});
