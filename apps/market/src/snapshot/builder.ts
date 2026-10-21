import createDebug from 'debug';

import type { UpstreamClient } from '../upstream/client';
import type { ResourceType, SnapshotItem, SnapshotStore } from './store';

const log = createDebug('youlin-market:builder');

export interface BuilderOptions {
  client: UpstreamClient;
  /** Parallel category requests. */
  concurrency?: number;
  /** Refresh intervals in ms; 0 disables that timer. */
  intervals?: {
    agents?: number;
    plugins?: number;
    skills?: number;
  };
  /** How many items to keep per category for aggregated types. */
  perCategory?: number;
  store: SnapshotStore;
}

const DEFAULT_PER_CATEGORY = 100;
const DEFAULT_CONCURRENCY = 4;
/** Safety valve: the agents endpoint reports 843 items, but never loop forever. */
const MAX_AGENT_PAGES = 100;

/**
 * Upstream page-size caps, measured against market.lobehub.com:
 * agents and plugins reject pageSize > 20 (400 "Invalid query parameters"),
 * skills accept up to 100.
 */
const PAGE_SIZE_LIMITS: Record<ResourceType, number> = {
  agent: 20,
  plugin: 20,
  skill: 100,
};

interface ListResponse<T> {
  items?: T[];
  totalCount?: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

/**
 * Keeps the snapshot warm.
 *
 * Two different shapes, because the upstream catalogues differ by orders of
 * magnitude:
 *   - agents (~843) are fetched exhaustively, page by page
 *   - plugins (~112k) and skills (~361k) are fetched per category, top N each,
 *     which keeps request volume bounded (70 / 296 categories, one page each)
 */
export class SnapshotBuilder {
  readonly #client: UpstreamClient;
  readonly #store: SnapshotStore;
  readonly #perCategory: number;
  readonly #concurrency: number;
  readonly #intervals: Required<NonNullable<BuilderOptions['intervals']>>;
  #timers: NodeJS.Timeout[] = [];
  #refreshing = new Set<ResourceType>();

  constructor(options: BuilderOptions) {
    this.#client = options.client;
    this.#store = options.store;
    this.#perCategory = Math.min(100, Math.max(1, options.perCategory ?? DEFAULT_PER_CATEGORY));
    this.#concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.#intervals = {
      agents: options.intervals?.agents ?? 10 * 60 * 1000,
      plugins: options.intervals?.plugins ?? 30 * 60 * 1000,
      skills: options.intervals?.skills ?? 60 * 60 * 1000,
    };
  }

  /** Loads the persisted snapshot first, then refreshes in the background. */
  async warmup(): Promise<void> {
    await this.#store.load();

    // Deliberately not awaited: the service must answer requests immediately
    // with whatever snapshot it has, even when that is empty on first boot.
    void this.refreshAll().catch((error) => log('warmup refresh failed: %O', error));
  }

  start(): void {
    this.#schedule('agent', this.#intervals.agents, () => this.refreshAgents());
    this.#schedule('plugin', this.#intervals.plugins, () => this.refreshPlugins());
    this.#schedule('skill', this.#intervals.skills, () => this.refreshSkills());
  }

  stop(): void {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
  }

  #schedule(type: ResourceType, intervalMs: number, run: () => Promise<number>): void {
    if (intervalMs <= 0) return;

    const timer = setInterval(() => {
      if (this.#refreshing.has(type)) {
        log('skip %s refresh: previous run still in flight', type);
        return;
      }

      void run().catch((error) => {
        this.#store.recordError(error);
        log('%s refresh failed: %O', type, error);
      });
    }, intervalMs);

    // Do not keep the process alive just for a refresh timer.
    timer.unref?.();
    this.#timers.push(timer);
  }

  async refreshAll(): Promise<void> {
    // The three catalogues are independent: fetching them concurrently keeps the
    // skills crawl (296 categories) from delaying agents/plugins availability.
    const results = await Promise.allSettled([
      this.refreshAgents(),
      this.refreshPlugins(),
      this.refreshSkills(),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') log('refresh task failed: %O', result.reason);
    }

    await this.#store.flush();
    this.#store.markRefreshed();
  }

  async refreshAgents(): Promise<number> {
    return this.#guard('agent', async () => {
      const items: SnapshotItem[] = [];
      let page = 1;

      for (;;) {
        const body = await this.#client.get<ListResponse<SnapshotItem>>('/api/v1/agents', {
          page,
          pageSize: PAGE_SIZE_LIMITS.agent,
        });
        const batch = body.items ?? [];

        items.push(...batch);

        const total = body.totalCount ?? items.length;

        if (batch.length === 0 || items.length >= total || page >= MAX_AGENT_PAGES) break;

        page += 1;
      }

      this.#store.replace('agent', items);

      return items.length;
    });
  }

  async refreshPlugins(): Promise<number> {
    return this.#guard('plugin', () => this.#refreshByCategory('plugin', '/api/v1/plugins'));
  }

  async refreshSkills(): Promise<number> {
    return this.#guard('skill', () => this.#refreshByCategory('skill', '/api/v1/skills'));
  }

  async #refreshByCategory(type: ResourceType, path: string): Promise<number> {
    const categories = await this.#loadCategories(path);
    const pageSize = Math.min(PAGE_SIZE_LIMITS[type], this.#perCategory);
    const items: SnapshotItem[] = [];
    const queue = [...categories];

    const worker = async () => {
      for (;;) {
        const category = queue.shift();

        if (!category) return;

        try {
          const body = await this.#client.get<ListResponse<SnapshotItem>>(path, {
            category,
            page: 1,
            pageSize,
          });

          items.push(...(body.items ?? []));
        } catch (error) {
          // One bad category must not abort the whole refresh.
          log('%s category %s failed: %O', type, category, error);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.#concurrency, Math.max(1, categories.length)) }, worker),
    );

    this.#store.replace(type, dedupe(items));

    return this.#store.counts()[type];
  }

  async #loadCategories(path: string): Promise<string[]> {
    const body = await this.#client.get<CategoryCount[] | { categories?: string[] }>(
      `${path}/categories`,
    );

    if (Array.isArray(body)) {
      return body.map((entry) => entry?.category).filter((value): value is string => !!value);
    }

    return (body?.categories ?? []).filter((value): value is string => typeof value === 'string');
  }

  async #guard(type: ResourceType, run: () => Promise<number>): Promise<number> {
    if (this.#refreshing.has(type)) {
      log('%s refresh already running', type);
      return this.#store.counts()[type];
    }

    this.#refreshing.add(type);

    try {
      const count = await run();

      this.#store.clearError();
      this.#store.markRefreshed();
      log('%s snapshot refreshed: %d items', type, count);

      return count;
    } catch (error) {
      this.#store.recordError(error);

      throw error;
    } finally {
      this.#refreshing.delete(type);
    }
  }
}

/** Category overlap is real (one item can appear under several), so dedupe. */
const dedupe = (items: SnapshotItem[]): SnapshotItem[] => {
  const seen = new Map<string, SnapshotItem>();

  for (const item of items) {
    if (item?.identifier) seen.set(item.identifier, item);
  }

  return [...seen.values()];
};
