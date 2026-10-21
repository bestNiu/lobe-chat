import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type FetchLike, M2MClient } from '../src/upstream/m2m';

const BASE = 'https://market.test';

interface Call {
  body: string;
  url: string;
}

/** Builds a fetch double that answers the two endpoints the client uses. */
const createFetch = (
  responses: {
    register?: { client_id?: string; client_secret?: string; status?: number };
    token?: { expiresIn?: number; status?: number; token?: string };
  } = {},
) => {
  const calls: Call[] = [];
  let tokenCount = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: String(init?.body ?? ''), url });

    if (url.endsWith('/api/v1/clients/register')) {
      const r = responses.register ?? {};

      return new Response(
        JSON.stringify({
          client_id: r.client_id ?? 'client_1',
          client_secret: r.client_secret ?? 'secret_1',
        }),
        { status: r.status ?? 200 },
      );
    }

    tokenCount += 1;
    const r = responses.token ?? {};

    return new Response(
      JSON.stringify({
        access_token: r.token ?? `token_${tokenCount}`,
        expires_in: r.expiresIn ?? 3600,
      }),
      { status: r.status ?? 200 },
    );
  };

  return { calls, fetchImpl, tokenCalls: () => tokenCount };
};

describe('M2MClient', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'm2m-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  const make = (options: Partial<ConstructorParameters<typeof M2MClient>[0]> = {}) => {
    const { calls, fetchImpl, tokenCalls } = createFetch();
    const client = new M2MClient({
      baseUrl: BASE,
      statePath: join(dir, 'm2m.json'),
      fetchImpl,
      ...options,
    });

    return { calls, client, tokenCalls };
  };

  it('registers a client on first use and persists it', async () => {
    const { client, calls } = make();

    await expect(client.getToken()).resolves.toBe('token_1');

    const registerCall = calls.find((c) => c.url.endsWith('/clients/register'));
    expect(registerCall).toBeDefined();
    expect(JSON.parse(registerCall!.body)).toMatchObject({ clientType: 'web' });

    const saved = JSON.parse(await readFile(join(dir, 'm2m.json'), 'utf8'));
    expect(saved).toMatchObject({ baseUrl: BASE, clientId: 'client_1', clientSecret: 'secret_1' });
  });

  it('sends the assertion in the documented grant shape', async () => {
    const { client, calls } = make();

    await client.getToken();

    const tokenCall = calls.find((c) => c.url.endsWith('/oauth/token'));
    const params = new URLSearchParams(tokenCall!.body);
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(params.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    );

    const [header, payload, signature] = params.get('client_assertion')!.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({
      alg: 'HS256',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
      aud: `${BASE}/oauth/token`,
      iss: 'client_1',
      sub: 'client_1',
    });
    expect(signature).toBeTruthy();
  });

  it('reuses the token until it enters the refresh window', async () => {
    let now = 1_000_000;
    const { client, tokenCalls } = make({ now: () => now });

    await client.getToken();
    await client.getToken();
    expect(tokenCalls()).toBe(1);

    // 3600s token, 5min skew → still fresh just before the window.
    now += 3000 * 1000;
    await client.getToken();
    expect(tokenCalls()).toBe(1);

    // Inside the skew window → refresh.
    now += 400 * 1000;
    await client.getToken();
    expect(tokenCalls()).toBe(2);
  });

  it('reuses credentials from disk instead of registering again', async () => {
    await writeFile(
      join(dir, 'm2m.json'),
      JSON.stringify({
        baseUrl: BASE,
        clientId: 'disk_client',
        clientSecret: 'disk_secret',
        registeredAt: new Date().toISOString(),
      }),
    );

    const { client, calls } = make();
    await client.getToken();

    expect(calls.some((c) => c.url.endsWith('/clients/register'))).toBe(false);
  });

  it('ignores credentials issued by a different upstream', async () => {
    await writeFile(
      join(dir, 'm2m.json'),
      JSON.stringify({
        baseUrl: 'https://other.test',
        clientId: 'old',
        clientSecret: 'old',
        registeredAt: new Date().toISOString(),
      }),
    );

    const { client, calls } = make();
    await client.getToken();

    expect(calls.some((c) => c.url.endsWith('/clients/register'))).toBe(true);
  });

  it('refreshes after invalidate()', async () => {
    const { client, tokenCalls } = make();

    await client.getToken();
    expect(tokenCalls()).toBe(1);

    client.invalidate();
    await expect(client.getToken()).resolves.toBe('token_2');
    expect(tokenCalls()).toBe(2);
  });

  it('rejects an unsupported upstream protocol', () => {
    expect(
      () =>
        new M2MClient({
          baseUrl: 'file:///etc/passwd',
          statePath: join(dir, 'm2m.json'),
        }),
    ).toThrow(/Unsupported upstream protocol/);
  });

  it('surfaces a registration failure', async () => {
    const fetchImpl: FetchLike = async () => new Response('nope', { status: 500 });
    const client = new M2MClient({
      baseUrl: BASE,
      statePath: join(dir, 'm2m.json'),
      fetchImpl,
    });

    await expect(client.getToken()).rejects.toThrow(/registration failed: 500/);
  });

  it('surfaces a token exchange failure', async () => {
    const { client } = make({
      fetchImpl: (async (url) =>
        url.endsWith('/clients/register')
          ? new Response(JSON.stringify({ client_id: 'c', client_secret: 's' }), { status: 200 })
          : new Response('invalid_client', { status: 400 })) as FetchLike,
    });

    await expect(client.getToken()).rejects.toThrow(/token exchange failed: 400/);
  });

  it('keeps working when the state file cannot be written', async () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/');
    const client = new M2MClient({
      baseUrl: BASE,
      // A path under a file (not a directory) makes mkdir fail.
      statePath: join(dir, 'm2m.json', 'nested', 'm2m.json'),
      fetchImpl: createFetch().fetchImpl,
    });

    await expect(client.getToken()).resolves.toBe('token_1');
    spy.mockRestore();
  });
});
