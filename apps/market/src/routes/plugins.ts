import type { CategoryItem } from '@lobehub/market-types';
import type { Hono } from 'hono';

import { pluginMapper } from '../mappers/plugin';
import type { MarketEnv } from '../middleware/auth';
import type { SnapshotStore } from '../snapshot/store';
import type { UpstreamClient } from '../upstream/client';

export interface PluginRouteDeps {
  /** Manifest cache TTL; defaults to 24h. */
  manifestTtlMs?: number;
  store: SnapshotStore;
  upstream: UpstreamClient;
}

interface ListBody {
  categories?: string[];
  items?: Record<string, unknown>[];
  totalCount?: number;
}

const DEFAULT_MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** Public base for URLs the browser resolves (see MARKET_PUBLIC_BASE_URL). */
const publicBase = () => process.env.MARKET_PUBLIC_BASE_URL || 'http://localhost:33220';

/**
 * MCP plugin routes.
 *
 * `manifest` is the one endpoint installation depends on, and the upstream
 * serves it even for machine tokens — so it is proxied and cached rather than
 * synthesised. Plugin *details* are rejected upstream, so those come from the
 * snapshot like agents do.
 */
export const registerPluginRoutes = (app: Hono<MarketEnv>, deps: PluginRouteDeps): void => {
  const { store, upstream } = deps;
  const manifestTtlMs = deps.manifestTtlMs ?? DEFAULT_MANIFEST_TTL_MS;
  const manifestCache = new Map<string, { body: unknown; expiresAt: number }>();

  const categoriesFromSnapshot = (): string[] => {
    const seen = new Set<string>();

    for (const item of store.list('plugin')) {
      const category = str(item.category);

      if (category) seen.add(category);
    }

    return [...seen];
  };

  app.get('/api/v1/plugins/categories', async (c) => {
    if (store.counts().plugin > 0) {
      const counts = new Map<string, number>();

      for (const item of store.list('plugin')) {
        const category = str(item.category);

        if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
      }

      const result: CategoryItem[] = [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      return c.json(result);
    }

    try {
      const body = await upstream.get<unknown>('/api/v1/plugins/categories');

      return c.json(body);
    } catch {
      return c.json([]);
    }
  });

  app.get('/api/v1/plugins', async (c) => {
    const selfBaseUrl = publicBase();
    const category = str(c.req.query('category'));
    const params = {
      category,
      order: (c.req.query('order') === 'asc' ? 'asc' : undefined) as 'asc' | undefined,
      page: Number(c.req.query('page')) || undefined,
      pageSize: Number(c.req.query('pageSize')) || undefined,
      q: str(c.req.query('q')),
      sort: str(c.req.query('sort')),
    };

    const snapshot = store.page('plugin', params);

    if (snapshot.totalCount > 0) {
      return c.json({
        categories: categoriesFromSnapshot(),
        currentPage: snapshot.currentPage,
        items: snapshot.items.map((item) => pluginMapper.toItem(item, selfBaseUrl)),
        pageSize: snapshot.pageSize,
        totalCount: snapshot.totalCount,
        totalPages: snapshot.totalPages,
      });
    }

    try {
      const body = await upstream.get<ListBody>('/api/v1/plugins', params);
      const items = body.items ?? [];

      store.putMany('plugin', items as never);

      return c.json({
        categories: body.categories ?? [],
        currentPage: params.page ?? 1,
        items,
        pageSize: params.pageSize ?? 20,
        totalCount: body.totalCount ?? items.length,
        totalPages: Math.ceil((body.totalCount ?? items.length) / (params.pageSize ?? 20)),
      });
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }
  });

  app.get('/api/v1/plugins/:identifier/manifest', async (c) => {
    const identifier = c.req.param('identifier');
    const cached = manifestCache.get(identifier);

    if (cached && cached.expiresAt > Date.now()) {
      return c.json(cached.body);
    }

    try {
      const body = await upstream.get<unknown>(
        `/api/v1/plugins/${encodeURIComponent(identifier)}/manifest`,
      );

      manifestCache.set(identifier, { body, expiresAt: Date.now() + manifestTtlMs });

      return c.json(body);
    } catch (error) {
      // Serve a stale copy rather than failing an install outright.
      if (cached) return c.json(cached.body);

      return c.json(
        { error: 'manifest_unavailable', identifier, message: (error as Error).message },
        502,
      );
    }
  });

  app.get('/api/v1/plugins/:identifier', async (c) => {
    const identifier = c.req.param('identifier');
    const selfBaseUrl = publicBase();
    const snapshotItem = store.get('plugin', identifier);

    if (snapshotItem) return c.json(pluginMapper.toDetail(snapshotItem, selfBaseUrl));

    try {
      const body = await upstream.get<ListBody>('/api/v1/plugins', {
        pageSize: 20,
        q: identifier,
      });
      const match = (body.items ?? []).find((item) => item.identifier === identifier);

      if (match) {
        store.put('plugin', match as never);

        return c.json(pluginMapper.toDetail(match as never, selfBaseUrl));
      }
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }

    return c.json({ error: 'not_in_snapshot', identifier }, 404);
  });
};
