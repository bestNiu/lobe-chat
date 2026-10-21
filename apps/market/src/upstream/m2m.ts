import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import createDebug from 'debug';

const log = createDebug('youlin-market:m2m');

/**
 * M2M credentials for the upstream market.
 *
 * The market's own `/api/v1/clients/register` endpoint is anonymous: it hands
 * back a client_id/client_secret pair that can be exchanged for an M2M access
 * token. We persist the pair so a restart does not register a new client every
 * time (and so the upstream does not accumulate dead clients).
 */
export interface M2MClientState {
  /** Upstream base URL the credentials were issued by. */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** ISO timestamp of the first registration. */
  registeredAt: string;
}

export interface M2MToken {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface M2MClientOptions {
  baseUrl: string;
  clientName?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Refresh this long before expiry. */
  refreshSkewMs?: number;
  statePath: string;
}

const DEFAULT_REFRESH_SKEW_MS = 5 * 60 * 1000;

const base64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

/**
 * Talks to the upstream market on behalf of this proxy.
 *
 * Flow (verified against market.lobehub.com):
 *   1. POST /api/v1/clients/register      → client_id / client_secret (anonymous)
 *   2. POST /oauth/token                  → access_token / expires_in
 *      grant_type=client_credentials
 *      client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
 *      client_assertion=<HS256 JWT signed with client_secret>
 */
export class M2MClient {
  readonly #base: URL;
  readonly #statePath: string;
  readonly #clientName: string;
  readonly #refreshSkewMs: number;
  readonly #fetch: FetchLike;
  readonly #now: () => number;

  #state?: M2MClientState;
  #token?: M2MToken;
  #inflight?: Promise<M2MToken>;

  constructor(options: M2MClientOptions) {
    // Every outbound URL is derived from this validated origin, never from a
    // request parameter — the proxy only ever talks to the configured upstream.
    let base: URL;

    try {
      base = new URL(options.baseUrl);
    } catch {
      throw new Error(`Invalid upstream URL: ${options.baseUrl}`);
    }

    if (base.protocol !== 'https:' && base.protocol !== 'http:') {
      throw new Error(`Unsupported upstream protocol: ${base.protocol}`);
    }

    this.#base = base;
    this.#statePath = options.statePath;
    this.#clientName = options.clientName ?? 'LobeHub Web';
    this.#refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? Date.now;
  }

  /** Resolve a fixed path against the validated upstream origin. */
  #url(path: string): string {
    return new URL(path, this.#base).toString();
  }

  /** Returns a usable access token, refreshing when close to expiry. */
  async getToken(): Promise<string> {
    const token = await this.#ensureToken();

    return token.accessToken;
  }

  /** Drop the cached token (e.g. after the upstream answered 401). */
  invalidate(): void {
    this.#token = undefined;
    this.#inflight = undefined;
  }

  /** Current token metadata, for /health and debugging. */
  get tokenInfo(): { expiresAt: number } | undefined {
    return this.#token ? { expiresAt: this.#token.expiresAt } : undefined;
  }

  async #ensureToken(): Promise<M2MToken> {
    if (this.#token && this.#token.expiresAt - this.#refreshSkewMs > this.#now()) {
      return this.#token;
    }

    this.#inflight ??= this.#refreshToken().finally(() => {
      this.#inflight = undefined;
    });

    return this.#inflight;
  }

  async #refreshToken(): Promise<M2MToken> {
    const state = await this.#getState();
    const token = await this.#exchange(state.clientId, state.clientSecret);

    this.#token = token;
    log('token refreshed, expires in %ds', Math.round((token.expiresAt - this.#now()) / 1000));

    return token;
  }

  async #getState(): Promise<M2MClientState> {
    if (this.#state) return this.#state;

    const fromDisk = await this.#loadState();

    if (fromDisk && fromDisk.baseUrl === this.#base.origin) {
      this.#state = fromDisk;

      return fromDisk;
    }

    if (fromDisk) {
      log('discarding credentials issued by %s (now %s)', fromDisk.baseUrl, this.#base.origin);
    }

    return this.register();
  }

  /** Registers a fresh client and persists it. */
  async register(): Promise<M2MClientState> {
    const response = await this.#fetch(this.#url('/api/v1/clients/register'), {
      body: JSON.stringify({
        clientName: this.#clientName,
        clientType: 'web',
        deviceId: 'youlin-market-proxy',
        platform: process.platform,
        version: '1.0.0',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`M2M client registration failed: ${response.status}`);
    }

    const body = (await response.json()) as { client_id?: string; client_secret?: string };

    if (!body.client_id || !body.client_secret) {
      throw new Error('M2M client registration returned incomplete credentials');
    }

    const state: M2MClientState = {
      baseUrl: this.#base.origin,
      clientId: body.client_id,
      clientSecret: body.client_secret,
      registeredAt: new Date(this.#now()).toISOString(),
    };

    this.#state = state;
    await this.#saveState(state);
    log('registered M2M client %s', state.clientId);

    return state;
  }

  /** Builds the HS256 assertion the token endpoint expects. */
  createAssertion(clientId: string, clientSecret: string): string {
    const nowSeconds = Math.floor(this.#now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({
        iss: clientId,
        sub: clientId,
        aud: `${this.#base.origin}/oauth/token`,
        iat: nowSeconds,
        exp: nowSeconds + 300,
        jti: randomUUID(),
      }),
    );
    const signature = createHmac('sha256', clientSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  async #exchange(clientId: string, clientSecret: string): Promise<M2MToken> {
    const response = await this.#fetch(this.#url('/oauth/token'), {
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: this.createAssertion(clientId, clientSecret),
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`M2M token exchange failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };

    if (!body.access_token) {
      throw new Error('M2M token exchange returned no access_token');
    }

    return {
      accessToken: body.access_token,
      expiresAt: this.#now() + (body.expires_in ?? 3600) * 1000,
    };
  }

  async #loadState(): Promise<M2MClientState | undefined> {
    try {
      const raw = await readFile(this.#statePath, 'utf8');
      const parsed = JSON.parse(raw) as M2MClientState;

      if (!parsed.clientId || !parsed.clientSecret || !parsed.baseUrl) return undefined;

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log('failed to read M2M state from %s: %O', this.#statePath, error);
      }

      return undefined;
    }
  }

  async #saveState(state: M2MClientState): Promise<void> {
    const tmp = `${this.#statePath}.tmp`;

    try {
      await mkdir(dirname(this.#statePath), { recursive: true });
      await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(tmp, this.#statePath);
    } catch (error) {
      // Persisting is best-effort: the in-memory credentials still work.
      log('failed to persist M2M state to %s: %O', this.#statePath, error);
    }
  }
}
