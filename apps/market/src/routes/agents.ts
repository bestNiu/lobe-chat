import type { CategoryItem } from '@lobehub/market-types';
import type { Hono } from 'hono';

import { agentMapper, buildForkResponse } from '../mappers/agent';
import type { MarketEnv } from '../middleware/auth';
import type { SnapshotStore } from '../snapshot/store';
import type { UpstreamClient } from '../upstream/client';

export interface AgentRouteDeps {
  store: SnapshotStore;
  upstream: UpstreamClient;
}

interface ListBody {
  items?: Record<string, unknown>[];
  totalCount?: number;
}

const selfBaseFrom = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const pageParams = (c: { req: { query: (key: string) => string | undefined } }) => ({
  category: str(c.req.query('category')),
  order: (c.req.query('order') === 'asc' ? 'asc' : undefined) as 'asc' | undefined,
  page: Number(c.req.query('page')) || undefined,
  pageSize: Number(c.req.query('pageSize')) || undefined,
  q: str(c.req.query('q')),
  sort: str(c.req.query('sort')),
});

/**
 * Agent routes.
 *
 * Browsing is answered from the snapshot so it stays fast and survives an
 * unreachable upstream; anything the snapshot cannot answer is proxied and
 * backfilled. Details, versions and fork are handled here because the upstream
 * market rejects them for machine (M2M) tokens.
 */
export const registerAgentRoutes = (app: Hono<MarketEnv>, deps: AgentRouteDeps): void => {
  const { store, upstream } = deps;

  // Static segments must be registered before `/:identifier`.
  app.get('/api/v1/agents/categories', async (c) => {
    const fromSnapshot = (): CategoryItem[] => {
      const counts = new Map<string, number>();

      for (const item of store.list('agent')) {
        const category = str(item.category);

        if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
      }

      return [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    };

    if (store.counts().agent > 0) return c.json(fromSnapshot());

    try {
      const body = await upstream.get<CategoryItem[] | { categoryCounts?: CategoryItem[] }>(
        '/api/v1/agents/categories',
      );

      return c.json(Array.isArray(body) ? body : (body.categoryCounts ?? []));
    } catch {
      return c.json([]);
    }
  });

  app.get('/api/v1/agents/onboarding-full', async (c) => {
    const locale = str(c.req.query('locale')) ?? 'en-US';
    const selfBaseUrl = selfBaseFrom(c.req.url);

    try {
      const body = await upstream.get<Record<string, unknown>[]>('/api/v1/agents/onboarding-full', {
        locale,
      });

      return c.json(body);
    } catch {
      // Fall back to a snapshot excerpt so the onboarding page still renders.
      const featured = store
        .list('agent')
        .filter((item) => item.isFeatured === true)
        .slice(0, 12);

      return c.json({ featured: featured.map((item) => agentMapper.toItem(item, selfBaseUrl)) });
    }
  });

  app.get('/api/v1/agents', async (c) => {
    const selfBaseUrl = selfBaseFrom(c.req.url);
    const params = pageParams(c);
    const snapshot = store.page('agent', params);

    if (snapshot.totalCount > 0) {
      return c.json({
        ...snapshot,
        items: snapshot.items.map((item) => agentMapper.toItem(item, selfBaseUrl)),
      });
    }

    // Snapshot still warming: proxy and backfill.
    try {
      const body = await upstream.get<ListBody>('/api/v1/agents', {
        category: params.category,
        order: params.order,
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
      });
      const items = body.items ?? [];

      store.putMany('agent', items as never);

      return c.json(body);
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }
  });

  app.get('/api/v1/agents/:identifier/versions', async (c) => {
    const identifier = c.req.param('identifier');

    try {
      return c.json(
        await upstream.get(`/api/v1/agents/${encodeURIComponent(identifier)}/versions`),
      );
    } catch {
      const item = store.get('agent', identifier);
      const versionNumber = Number(item?.versionNumber) || 1;

      return c.json([
        {
          createdAt: item?.createdAt ?? new Date(0).toISOString(),
          isLatest: true,
          version: String(item?.version ?? '1.0.0'),
          versionNumber,
        },
      ]);
    }
  });

  app.post('/api/v1/agents/:identifier/fork', async (c) => {
    const sourceIdentifier = c.req.param('identifier');
    const source = store.get('agent', sourceIdentifier);

    if (!source) {
      return c.json(
        { error: 'not_found', message: `agent ${sourceIdentifier} is not in the snapshot` },
        404,
      );
    }

    let body: { identifier?: string; name?: string } = {};

    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      // An empty body is acceptable: the caller may only want a fork receipt.
    }

    const forkIdentifier = body.identifier || `${sourceIdentifier}_fork`;

    return c.json(buildForkResponse(source, forkIdentifier, body.name));
  });

  // The SDK requests details at `/agents/detail/:id` (see AgentService.getAgentDetail),
  // which also explains why upstream returns 404 for the bare `/agents/:id` form.
  const detailHandler = async (c: any) => {
    const identifier = c.req.param('identifier');
    const selfBaseUrl = selfBaseFrom(c.req.url);
    const cached = store.get('agent', identifier);

    if (cached) return c.json(agentMapper.toDetail(cached, selfBaseUrl));

    // `q` is an exact-match search upstream, so it can recover a row we never
    // listed (deep link, shared URL).
    try {
      const body = await upstream.get<ListBody>('/api/v1/agents', {
        pageSize: 10,
        q: identifier,
      });
      const match = (body.items ?? []).find((item) => item.identifier === identifier);

      if (match) {
        store.put('agent', match as never);

        return c.json(agentMapper.toDetail(match as never, selfBaseUrl));
      }
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }

    return c.json({ error: 'not_in_snapshot', identifier }, 404);
  };

  app.get('/api/v1/agents/detail/:identifier', detailHandler);
  // Compatibility: older callers and our own manifestUrl use the short form.
  app.get('/api/v1/agents/:identifier', detailHandler);
};
