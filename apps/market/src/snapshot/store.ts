import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import createDebug from 'debug';

const log = createDebug('youlin-market:snapshot');

export type ResourceType = 'agent' | 'plugin' | 'skill';

export interface SnapshotItem {
  [key: string]: unknown;
  category?: string | null;
  identifier: string;
}

export interface SnapshotMeta {
  builtAt?: string;
  counts: Record<ResourceType, number>;
  lastRefreshError?: string;
  refreshedAt?: string;
}

export interface PageQuery {
  category?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
}

export interface PageResult<T> {
  currentPage: number;
  items: T[];
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const SORTABLE: Record<string, true> = {
  createdAt: true,
  installCount: true,
  ratingAverage: true,
  updatedAt: true,
};

/**
 * In-memory snapshot of upstream catalogues, persisted as JSON.
 *
 * The market exposes details only to user-level tokens, so the proxy answers
 * detail/fork/download from this store instead of round-tripping upstream.
 * Keeping the whole index in memory is what makes those responses sub-millisecond
 * and independent of whether the caller visited the list first.
 */
export class SnapshotStore {
  readonly #dir: string;
  readonly #byType = new Map<ResourceType, Map<string, SnapshotItem>>();
  readonly #byCategory = new Map<string, Set<string>>();
  #meta: SnapshotMeta = { counts: { agent: 0, plugin: 0, skill: 0 } };
  #dirty = false;

  constructor(options: { dir: string }) {
    this.#dir = options.dir;

    for (const type of ['agent', 'plugin', 'skill'] as const) {
      this.#byType.set(type, new Map());
    }
  }

  #file(type: ResourceType): string {
    return join(this.#dir, `snapshot-${type}.json`);
  }

  #categoryKey(type: ResourceType, category: string): string {
    return `${type}:${category}`;
  }

  /** Reads every persisted snapshot; missing or corrupt files are skipped. */
  async load(): Promise<void> {
    for (const type of this.#byType.keys()) {
      try {
        const raw = await readFile(this.#file(type), 'utf8');
        const parsed = JSON.parse(raw) as { items?: SnapshotItem[]; refreshedAt?: string };

        if (Array.isArray(parsed.items)) {
          this.replace(type, parsed.items);
          this.#meta.refreshedAt = parsed.refreshedAt ?? this.#meta.refreshedAt;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          log('ignoring unreadable snapshot %s: %O', this.#file(type), error);
        }
      }
    }

    this.#meta.builtAt ??= new Date().toISOString();
    log('loaded snapshots: %O', this.#meta.counts);
  }

  put(type: ResourceType, item: SnapshotItem): void {
    const bucket = this.#byType.get(type);

    if (!bucket || !item?.identifier) return;

    const previous = bucket.get(item.identifier);

    if (previous?.category) {
      this.#byCategory.get(this.#categoryKey(type, previous.category))?.delete(item.identifier);
    }

    bucket.set(item.identifier, item);

    if (item.category) {
      const key = this.#categoryKey(type, item.category);
      const set = this.#byCategory.get(key) ?? new Set<string>();

      set.add(item.identifier);
      this.#byCategory.set(key, set);
    }

    this.#dirty = true;
  }

  putMany(type: ResourceType, items: SnapshotItem[]): void {
    for (const item of items) this.put(type, item);
    this.#recount(type);
  }

  /** Swaps a whole type atomically (used after a full refresh). */
  replace(type: ResourceType, items: SnapshotItem[]): void {
    this.#byType.set(type, new Map());

    for (const key of this.#byCategory.keys()) {
      if (key.startsWith(`${type}:`)) this.#byCategory.delete(key);
    }

    this.putMany(type, items);
    this.#dirty = true;
  }

  get(type: ResourceType, identifier: string): SnapshotItem | undefined {
    return this.#byType.get(type)?.get(identifier);
  }

  list(type: ResourceType): SnapshotItem[] {
    return [...(this.#byType.get(type)?.values() ?? [])];
  }

  listByCategory(type: ResourceType, category: string): SnapshotItem[] {
    const bucket = this.#byType.get(type);
    const ids = this.#byCategory.get(this.#categoryKey(type, category));

    if (!bucket || !ids) return [];

    return [...ids].map((id) => bucket.get(id)).filter((item): item is SnapshotItem => !!item);
  }

  /** Paginates from memory so an unreachable upstream cannot break browsing. */
  page(type: ResourceType, query: PageQuery = {}): PageResult<SnapshotItem> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
    );

    let items = query.category ? this.listByCategory(type, query.category) : this.list(type);

    if (query.q?.trim()) {
      const needle = query.q.trim().toLowerCase();
      items = items.filter((item) =>
        [item.identifier, item.name, item.description]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
    }

    const sortKey = query.sort && SORTABLE[query.sort] ? query.sort : 'createdAt';
    const direction = query.order === 'asc' ? 1 : -1;

    items = [...items].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];

      if (left === right) return 0;
      if (left === undefined || left === null) return 1;
      if (right === undefined || right === null) return -1;

      return left > right ? direction : -direction;
    });

    const totalCount = items.length;
    const offset = (page - 1) * pageSize;

    return {
      currentPage: page,
      items: items.slice(offset, offset + pageSize),
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  counts(): Record<ResourceType, number> {
    return { ...this.#meta.counts };
  }

  meta(): SnapshotMeta {
    return { ...this.#meta, counts: this.counts() };
  }

  markRefreshed(at: Date = new Date()): void {
    this.#meta.refreshedAt = at.toISOString();
    this.#meta.builtAt ??= this.#meta.refreshedAt;
  }

  recordError(error: unknown): void {
    this.#meta.lastRefreshError = error instanceof Error ? error.message : String(error);
  }

  clearError(): void {
    delete this.#meta.lastRefreshError;
  }

  /** Writes each non-empty type atomically (tmp file + rename). */
  async flush(): Promise<void> {
    if (!this.#dirty) return;

    await mkdir(this.#dir, { recursive: true });

    for (const [type, bucket] of this.#byType) {
      if (bucket.size === 0) continue;

      const target = this.#file(type as ResourceType);
      const tmp = `${target}.tmp`;

      await writeFile(
        tmp,
        JSON.stringify(
          { items: [...bucket.values()], refreshedAt: this.#meta.refreshedAt ?? null },
          null,
          0,
        ),
      );
      await rename(tmp, target);
    }

    this.#dirty = false;
    log('flushed snapshots: %O', this.#meta.counts);
  }

  #recount(type: ResourceType): void {
    this.#meta.counts[type] = this.#byType.get(type)?.size ?? 0;
  }
}
