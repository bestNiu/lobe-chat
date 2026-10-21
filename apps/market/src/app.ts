import { Hono } from 'hono';

import type { MarketConfig } from './config';
import { createAuthMiddleware, type MarketEnv } from './middleware/auth';
import { registerAgentRoutes } from './routes/agents';
import { registerPluginRoutes } from './routes/plugins';
import { registerSkillRoutes } from './routes/skills';
import type { SnapshotStore } from './snapshot/store';
import type { MarketActor } from './types';
import type { UpstreamClient } from './upstream/client';

/** Request URLs come from the server; parse defensively nonetheless. */
const safeUrl = (raw: string): URL | undefined => {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
};

export interface AppDeps {
  config: MarketConfig;
  /** Overridable for tests. */
  resolveActor?: (payload: { email?: string; userId: string }) => MarketActor;
  store: SnapshotStore;
  upstream: UpstreamClient;
}

/**
 * Phase 1 resolves the actor without any database lookup: the LobeHub build
 * this fronts seeds no RBAC rows, so admin/reviewer flags stay false and the
 * proxy only needs the identity for audit logging.
 */
export const createDefaultActor = (payload: { email?: string; userId: string }): MarketActor => ({
  email: payload.email || undefined,
  isAdmin: false,
  isReviewer: false,
  teamIds: [],
  userId: payload.userId,
});

/**
 * Builds the Hono app.
 *
 * Routing shape:
 *   /health                       → unauthenticated liveness + snapshot stats
 *   /api/v1/*                     → authenticated; snapshot-first handlers are
 *                                   registered by the resource routers, anything
 *                                   else falls through to the upstream proxy
 */
export const createApp = (deps: AppDeps) => {
  const { config, store, upstream } = deps;
  const resolveActor = deps.resolveActor ?? createDefaultActor;
  const app = new Hono<MarketEnv>();

  app.get('/health', (c) => {
    const meta = store.meta();
    // The web install path only supports http/cloud deployments, so surface how
    // much of the plugin catalogue a browser can actually install.
    const plugins = store.list('plugin');
    const stdioOnly = plugins.filter(
      (item) => item.connectionType === 'local' && !item.haveCloudEndpoint,
    ).length;

    return c.json({
      service: 'youlin-market',
      status: 'ok',
      snapshot: {
        counts: meta.counts,
        lastRefreshError: meta.lastRefreshError ?? null,
        refreshedAt: meta.refreshedAt ?? null,
      },
      installable: {
        plugins: {
          httpOrCloud: plugins.length - stdioOnly,
          stdioOnly,
          total: plugins.length,
        },
      },
      stdioEnabled: config.MCP_ALLOW_STDIO,
      upstream: config.UPSTREAM_MARKET_URL,
    });
  });

  const auth = createAuthMiddleware(async (payload) => resolveActor(payload), {
    clientId: config.MARKET_TRUSTED_CLIENT_ID,
    secret: config.MARKET_TRUSTED_CLIENT_SECRET,
  });

  /**
   * Skill downloads are fetched by the app's `skillImporter`, which issues a
   * bare request with no headers — the SDK only hands it a URL. That endpoint
   * must therefore be reachable without a token; it leaks nothing itself (it
   * answers 302 to a public GitHub archive).
   */
  const DOWNLOAD_PATH = /^\/api\/v1\/skills\/[^/]+\/download$/;

  app.use('/api/v1/*', async (c, next) => {
    if (DOWNLOAD_PATH.test(c.req.path)) return next();

    return auth(c, next);
  });

  // Snapshot-first resource routers. Registered before the catch-all proxy so a
  // claimed path never falls through to the upstream.
  // Mark responses served from a snapshot whose last refresh failed, so callers
  // can tell "current" from "stale but usable" without inspecting /health.
  app.use('/api/v1/*', async (c, next) => {
    await next();

    if (store.meta().lastRefreshError) {
      c.header('x-snapshot-stale', 'true');
    }
  });

  registerAgentRoutes(app, { store, upstream });
  registerPluginRoutes(app, { store, upstream });
  registerSkillRoutes(app, { downloadMode: config.SKILL_DOWNLOAD_PROXY_MODE, store, upstream });

  // Fallback: anything a resource router did not claim is proxied upstream.
  // Snapshot-first handlers are mounted before this and therefore win.
  app.all('/api/v1/*', async (c) => {
    const url = safeUrl(c.req.url);

    if (!url) return c.json({ error: 'bad_request' }, 400);

    const path = url.pathname;
    const method = c.req.method;

    try {
      const headers: Record<string, string> = {};
      const contentType = c.req.header('content-type');

      if (contentType) headers['Content-Type'] = contentType;

      const body = method === 'GET' || method === 'HEAD' ? undefined : await c.req.text();
      const response = await upstream.requestRaw(path, {
        body,
        headers,
        method,
        query: Object.fromEntries(url.searchParams.entries()),
      });

      return new Response(response.body, {
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
        },
        status: response.status,
      });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 502;

      return c.json(
        {
          error: 'upstream_unavailable',
          message: error instanceof Error ? error.message : 'upstream request failed',
        },
        status as 502,
      );
    }
  });

  app.notFound((c) =>
    c.json({ error: 'not_found', path: safeUrl(c.req.url)?.pathname ?? '' }, 404),
  );

  app.onError((error, c) => {
    console.error('[market] unhandled error:', error);

    return c.json({ error: 'internal_error', message: error.message }, 500);
  });

  return app;
};
