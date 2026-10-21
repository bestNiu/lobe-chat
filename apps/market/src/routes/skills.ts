import type { MarketSkillCategory, MarketSkillListResponse } from '@lobehub/market-sdk';
import type { Hono } from 'hono';

import { toSkillDetail, toSkillListItem } from '../mappers/skill';
import type { MarketEnv } from '../middleware/auth';
import { type GitHubArchiveTarget, resolveGitHubArchive } from '../snapshot/githubUrl';
import { buildSkillArchive } from '../snapshot/skillArchive';
import { fetchSkillContent } from '../snapshot/skillContent';
import type { PageQuery, SnapshotItem, SnapshotStore } from '../snapshot/store';
import type { UpstreamClient } from '../upstream/client';

export interface SkillRouteDeps {
  downloadMode: 'redirect' | 'stream';
  store: SnapshotStore;
  upstream: UpstreamClient;
}

interface SkillListBody {
  [key: string]: unknown;
  categories?: string[];
  items?: SnapshotItem[];
}

/** Public base for URLs the browser resolves (see MARKET_PUBLIC_BASE_URL). */
const publicBase = () => process.env.MARKET_PUBLIC_BASE_URL || 'http://localhost:33220';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const pageParams = (c: { req: { query: (key: string) => string | undefined } }): PageQuery => ({
  category: str(c.req.query('category')),
  order: (c.req.query('order') === 'asc' ? 'asc' : undefined) as 'asc' | undefined,
  page: Number(c.req.query('page')) || undefined,
  pageSize: Number(c.req.query('pageSize')) || undefined,
  q: str(c.req.query('q')),
  sort: str(c.req.query('sort')),
});

const categoryCounts = (store: SnapshotStore): MarketSkillCategory[] => {
  const counts = new Map<string, number>();

  for (const item of store.list('skill')) {
    const category = str(item.category);

    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
};

/** `MarketSkillListResponse.categories` wants the full vocabulary, not just this page. */
const snapshotCategories = (store: SnapshotStore): string[] =>
  [
    ...new Set(
      store
        .list('skill')
        .map((item) => str(item.category))
        .filter((v): v is string => !!v),
    ),
  ].sort();

/** Snapshot rows are untyped JSON, so the two fields the resolver reads are narrowed here. */
const archiveTarget = (item: SnapshotItem | undefined): GitHubArchiveTarget | undefined => {
  if (!item) return undefined;

  const github = item.github;
  const repositoryUrl =
    github && typeof github === 'object' && 'url' in github ? github.url : undefined;

  return resolveGitHubArchive({
    github: typeof repositoryUrl === 'string' ? { url: repositoryUrl } : undefined,
    homepage: typeof item.homepage === 'string' ? item.homepage : undefined,
  });
};

/**
 * Stream mode is the one outbound fetch in this router. The URL is rebuilt from
 * snapshot data rather than request data, but the sink is still allowlisted.
 */
const isGitHubArchiveUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw);

    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
};

/**
 * Skill routes.
 *
 * Same shape as the agent router: browsing is snapshot-first so it stays fast
 * and survives an unreachable upstream, anything the snapshot cannot answer is
 * proxied. Detail and download are served locally because the upstream market
 * answers 401 for them to machine (M2M) tokens.
 */
export const registerSkillRoutes = (app: Hono<MarketEnv>, deps: SkillRouteDeps): void => {
  const { downloadMode, store, upstream } = deps;

  // Static segments must be registered before `/:identifier`.
  app.get('/api/v1/skills/categories', async (c) => {
    if (store.counts().skill > 0) return c.json(categoryCounts(store));

    try {
      const body = await upstream.get<
        MarketSkillCategory[] | { categoryCounts?: MarketSkillCategory[] }
      >('/api/v1/skills/categories');

      return c.json(Array.isArray(body) ? body : (body.categoryCounts ?? []));
    } catch {
      return c.json([]);
    }
  });

  app.get('/api/v1/skills', async (c) => {
    const selfBaseUrl = publicBase();
    const params = pageParams(c);
    const snapshot = store.page('skill', params);

    if (snapshot.totalCount > 0) {
      const body: MarketSkillListResponse & { categories: string[] } = {
        categories: snapshotCategories(store),
        currentPage: snapshot.currentPage,
        items: snapshot.items.map((item) => toSkillListItem(item, selfBaseUrl)),
        pageSize: snapshot.pageSize,
        totalCount: snapshot.totalCount,
        totalPages: snapshot.totalPages,
      };

      return c.json(body);
    }

    // Snapshot still warming: proxy and backfill.
    try {
      const body = await upstream.get<SkillListBody>('/api/v1/skills', {
        category: params.category,
        order: params.order,
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
      });

      store.putMany('skill', body.items ?? []);

      return c.json({ ...body, categories: body.categories ?? snapshotCategories(store) });
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }
  });

  app.get('/api/v1/skills/:identifier/versions', async (c) => {
    const identifier = c.req.param('identifier');

    try {
      return c.json(
        await upstream.get(`/api/v1/skills/${encodeURIComponent(identifier)}/versions`),
      );
    } catch {
      // Upstream only lists version numbers; a single current version keeps the
      // version picker usable for snapshot-only skills.
      const item = store.get('skill', identifier);

      return c.json([
        {
          createdAt: str(item?.createdAt) ?? new Date(0).toISOString(),
          isLatest: true,
          version: str(item?.version) ?? '1.0.0',
          versionNumber: Number(item?.versionNumber) || 1,
        },
      ]);
    }
  });

  app.get('/api/v1/skills/:identifier/comments', async (c) => {
    const identifier = c.req.param('identifier');

    try {
      // Forwarded because claiming this path bypasses the catch-all proxy that
      // used to carry the query string upstream.
      return c.json(
        await upstream.get(`/api/v1/skills/${encodeURIComponent(identifier)}/comments`, {
          page: Number(c.req.query('page')) || undefined,
          pageSize: Number(c.req.query('pageSize')) || undefined,
          sort: str(c.req.query('sort')),
        }),
      );
    } catch {
      return c.json({ currentPage: 1, items: [], pageSize: 20, totalCount: 0, totalPages: 0 });
    }
  });

  app.get('/api/v1/skills/:identifier/download', async (c) => {
    const identifier = c.req.param('identifier');
    const item = store.get('skill', identifier);
    const target = archiveTarget(item);

    if (!item || !target || !isGitHubArchiveUrl(target.archiveUrl)) {
      return c.json({ error: 'not_downloadable', identifier }, 404);
    }

    // 97% of market skills live under `/tree/<branch>/<subdir>/`, and the app's
    // importer only finds `SKILL.md` at the archive root. Re-package those so
    // the installed skill is the right one — a plain redirect either fails or
    // silently installs a sibling skill's body.
    if (target.subdir) {
      const built = await buildSkillArchive(item);

      if (!built) {
        // Never fall back to the repo archive: installing the wrong skill is
        // worse than a clear failure.
        return c.json({ error: 'archive_unavailable', identifier }, 502);
      }

      // Copy into a plain ArrayBuffer: `fflate` returns Uint8Array<ArrayBufferLike>,
      // which TS refuses as BodyInit because the buffer may be shared.
      const body = built.archive.buffer.slice(
        built.archive.byteOffset,
        built.archive.byteOffset + built.archive.byteLength,
      ) as ArrayBuffer;

      return new Response(body, {
        headers: {
          'content-disposition': `attachment; filename="${identifier.replaceAll(/[^\w.-]/g, '_')}.zip"`,
          'content-type': 'application/zip',
        },
        status: 200,
      });
    }

    if (downloadMode === 'redirect') return c.redirect(target.archiveUrl, 302);

    // The archive lives on github.com, so it is fetched directly: the upstream
    // client only talks to the market origin and would refuse this URL.
    try {
      const response = await fetch(target.archiveUrl);

      if (!response.ok) {
        return c.json(
          {
            error: 'upstream_unavailable',
            message: `archive download failed: ${response.status}`,
          },
          502,
        );
      }

      return new Response(response.body, {
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/zip',
        },
        status: 200,
      });
    } catch (error) {
      return c.json({ error: 'upstream_unavailable', message: (error as Error).message }, 502);
    }
  });

  app.get('/api/v1/skills/:identifier', async (c) => {
    const identifier = c.req.param('identifier');
    const selfBaseUrl = publicBase();
    const cached = store.get('skill', identifier);

    if (cached) {
      // Snapshot rows carry no body; fetch SKILL.md from the skill's repo once
      // and cache it so the Overview tab has something to render.
      if (!cached.content) {
        const content = await fetchSkillContent(cached);

        if (content) {
          const enriched = { ...cached, content };

          store.put('skill', enriched);

          return c.json(toSkillDetail(enriched, selfBaseUrl));
        }
      }

      return c.json(toSkillDetail(cached, selfBaseUrl));
    }

    // `q` is a fuzzy search upstream and caps at 500 rows, so it is a last
    // resort: only an exact identifier match is accepted.
    try {
      const body = await upstream.get<SkillListBody>('/api/v1/skills', {
        pageSize: 20,
        q: identifier,
      });
      const match = (body.items ?? []).find((item) => item.identifier === identifier);

      if (match) {
        store.put('skill', match);

        return c.json(toSkillDetail(match, selfBaseUrl));
      }
    } catch {
      // Fall through to the 404 below: the snapshot is the only authority for
      // skill details, an unreachable upstream does not change that.
    }

    return c.json({ error: 'not_in_snapshot', identifier }, 404);
  });
};
