import createDebug from 'debug';

import type { FetchLike, M2MClient } from './m2m';

const log = createDebug('youlin-market:upstream');

export type QueryParams = Record<string, boolean | number | string | undefined>;

export interface UpstreamClientOptions {
  /** Base backoff for 429/5xx retries. */
  backoffMs?: number;
  baseUrl: string;
  fetchImpl?: FetchLike;
  m2m: M2MClient;
  /** Retries after the first attempt (so 2 means up to 3 calls). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Per-attempt timeout. */
  timeoutMs?: number;
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

/**
 * Thin HTTP client for the upstream market.
 *
 * Responsibilities:
 *   - attach an M2M bearer token (delegated to `M2MClient`)
 *   - bound every call with a timeout
 *   - retry 429 / 5xx with backoff, and recover from a 401 by dropping the
 *     cached token and retrying once
 *
 * Paths are always resolved against the configured origin — no request data
 * ever becomes part of the host.
 */
export class UpstreamClient {
  readonly #base: URL;
  readonly #m2m: M2MClient;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #backoffMs: number;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: UpstreamClientOptions) {
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
    this.#m2m = options.m2m;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#retries = options.retries ?? DEFAULT_RETRIES;
    this.#backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  #url(path: string, params?: QueryParams): string {
    const url = new URL(path, this.#base);

    // Allowlist: the only host we ever call is the configured upstream origin.
    // A future change that let request data reach the origin would fail here
    // instead of turning this client into an SSRF sink.
    if (url.origin !== this.#base.origin) {
      throw new UpstreamError(`Refusing cross-origin upstream request: ${url.origin}`, 400);
    }

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const response = await this.#send(this.#url(path, params), { method: 'GET' });

    return (await response.json()) as T;
  }

  async post<T>(path: string, body: unknown, init: { timeoutMs?: number } = {}): Promise<T> {
    const response = await this.#send(this.#url(path), {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      timeoutMs: init.timeoutMs,
    });

    return (await response.json()) as T;
  }

  /**
   * Transport-level pass-through used by the proxy fallback: same auth, timeout
   * and retry behaviour, but the raw Response is returned so the caller can
   * forward headers and status unchanged.
   */
  async requestRaw(
    path: string,
    init: {
      body?: string;
      headers?: Record<string, string>;
      method: string;
      query?: Record<string, string>;
    },
  ): Promise<Response> {
    // Passthrough must preserve the upstream status: the app maps a 401 from
    // `/lobehub-oidc/userinfo` to a handled "no user info" branch, while a
    // thrown error would surface as a 500 on every community page.
    return this.#send(
      this.#url(path, init.query),
      {
        body: init.body,
        headers: init.headers,
        method: init.method,
      },
      false,
    );
  }

  async #send(
    url: string,
    init: { body?: string; headers?: Record<string, string>; method: string; timeoutMs?: number },
    /** When false, a final non-2xx answer is returned instead of thrown. */
    throwOnError = true,
  ): Promise<Response> {
    let attempt = 0;
    let refreshedAuth = false;

    for (;;) {
      attempt += 1;

      const token = await this.#m2m.getToken();
      const response = await this.#once(url, { ...init, token });

      if (response.ok) return response;

      const retryable = response.status === 429 || response.status >= 500;

      // A stale cached token is the one auth failure worth retrying: drop it and
      // try once with a fresh one, then give up on further 401s.
      if (response.status === 401 && !refreshedAuth) {
        refreshedAuth = true;
        this.#m2m.invalidate();
        log('401 from %s, refreshing token and retrying', url);
        continue;
      }

      if (retryable && attempt <= this.#retries) {
        const wait = this.#retryDelay(response, attempt);
        log('%d from %s, retrying in %dms (attempt %d)', response.status, url, wait, attempt);
        await this.#sleep(wait);
        continue;
      }

      if (!throwOnError) return response;

      const text = await response.text().catch(() => '');
      throw new UpstreamError(
        `Upstream ${init.method} ${url} failed: ${response.status}`,
        response.status,
        text.slice(0, 500),
      );
    }
  }

  async #once(
    url: string,
    init: {
      body?: string;
      headers?: Record<string, string>;
      method: string;
      timeoutMs?: number;
      token: string;
    },
  ): Promise<Response> {
    const { token, timeoutMs, ...rest } = init;

    try {
      return await this.#fetch(url, {
        ...rest,
        headers: { ...rest.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs ?? this.#timeoutMs),
      });
    } catch (error) {
      const name = (error as Error)?.name;

      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new UpstreamError(
          `Upstream request timed out after ${timeoutMs ?? this.#timeoutMs}ms`,
          504,
        );
      }

      throw error;
    }
  }

  #retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));

    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(retryAfter * 1000, 10_000);
    }

    return Math.min(this.#backoffMs * 2 ** (attempt - 1), 5_000);
  }
}
