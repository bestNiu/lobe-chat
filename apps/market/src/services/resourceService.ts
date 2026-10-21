import { and, asc, count, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import type { MarketDb } from '../db/client';
import { marketCategories, marketResources, marketResourceVersions } from '../db/schema';
import { type MarketResourceType, normalizePagination, type PageQuery } from '../types';

export const RESOURCE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'installCount',
  'ratingAverage',
  'appendixCount',
] as const;

export type ResourceSortField = (typeof RESOURCE_SORT_FIELDS)[number];

export interface ResourceListQuery extends PageQuery {
  category?: string;
  order?: 'asc' | 'desc';
  q?: string;
  sort?: ResourceSortField | string;
}

export interface ResourceListResult<TRow> {
  currentPage: number;
  items: TRow[];
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

const sortColumn = (sort?: string) => {
  switch (sort) {
    case 'updatedAt': {
      return marketResources.updatedAt;
    }
    case 'installCount': {
      return marketResources.installCount;
    }
    case 'ratingAverage': {
      return marketResources.ratingAvg;
    }
    default: {
      return marketResources.publishedAt;
    }
  }
};

/**
 * Visible rows for the anonymous browse surface.
 *
 * P0 publishes nothing until a review approves it, so `status = 'published'`
 * is the whole visibility rule here; P1 layers scope on top of the same
 * predicate (see `visibility.ts`).
 */
const publishedWhere = (type: MarketResourceType, query: ResourceListQuery): SQL | undefined => {
  const filters: (SQL | undefined)[] = [
    eq(marketResources.resourceType, type),
    eq(marketResources.status, 'published'),
  ];

  if (query.category) filters.push(eq(marketResources.category, query.category));

  if (query.q?.trim()) {
    const pattern = `%${query.q.trim()}%`;
    filters.push(
      or(
        ilike(marketResources.name, pattern),
        ilike(marketResources.description, pattern),
        ilike(marketResources.identifier, pattern),
      ),
    );
  }

  return and(...filters.filter(Boolean));
};

export const listResources = async (
  db: MarketDb,
  type: MarketResourceType,
  query: ResourceListQuery = {},
): Promise<ResourceListResult<typeof marketResources.$inferSelect>> => {
  const { limit, offset, page, pageSize } = normalizePagination(query);
  const where = publishedWhere(type, query);

  const [counted] = await db.select({ total: count() }).from(marketResources).where(where);

  const totalCount = Number(counted?.total ?? 0);

  if (totalCount === 0) {
    return { currentPage: page, items: [], pageSize, totalCount: 0, totalPages: 0 };
  }

  const column = sortColumn(query.sort);
  const direction = query.order === 'asc' ? asc : desc;

  const items = await db
    .select()
    .from(marketResources)
    .where(where)
    .orderBy(sql`${direction(column)} NULLS LAST`, desc(marketResources.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    currentPage: page,
    items,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  };
};

export const findResource = async (db: MarketDb, type: MarketResourceType, identifier: string) => {
  const [row] = await db
    .select()
    .from(marketResources)
    .where(
      and(
        eq(marketResources.resourceType, type),
        eq(marketResources.identifier, identifier),
        eq(marketResources.status, 'published'),
      ),
    )
    .limit(1);

  return row;
};

export const findLatestVersion = async (db: MarketDb, resourceId: string) => {
  const [row] = await db
    .select()
    .from(marketResourceVersions)
    .where(
      and(
        eq(marketResourceVersions.resourceId, resourceId),
        eq(marketResourceVersions.status, 'published'),
      ),
    )
    .orderBy(desc(marketResourceVersions.versionNo))
    .limit(1);

  return row;
};

export const findVersionByNumber = async (db: MarketDb, resourceId: string, versionNo: number) => {
  const [row] = await db
    .select()
    .from(marketResourceVersions)
    .where(
      and(
        eq(marketResourceVersions.resourceId, resourceId),
        eq(marketResourceVersions.versionNo, versionNo),
        eq(marketResourceVersions.status, 'published'),
      ),
    )
    .limit(1);

  return row;
};

/** Category counts across every published resource of a type. */
export const listCategoryCounts = async (db: MarketDb, type: MarketResourceType) => {
  const rows = await db
    .select({ category: marketResources.category, total: count() })
    .from(marketResources)
    .where(and(eq(marketResources.resourceType, type), eq(marketResources.status, 'published')))
    .groupBy(marketResources.category);

  return rows
    .filter((row): row is { category: string; total: number } => Boolean(row.category))
    .map((row) => ({ category: row.category, count: Number(row.total) }))
    .sort((a, b) => b.count - a.count);
};

/** Declared categories, including ones with no published resource yet. */
export const listDeclaredCategories = async (db: MarketDb, type: MarketResourceType) => {
  return db
    .select()
    .from(marketCategories)
    .where(eq(marketCategories.resourceType, type))
    .orderBy(asc(marketCategories.sortOrder), asc(marketCategories.key));
};

export const listVersions = async (db: MarketDb, resourceId: string) => {
  return db
    .select()
    .from(marketResourceVersions)
    .where(
      and(
        eq(marketResourceVersions.resourceId, resourceId),
        eq(marketResourceVersions.status, 'published'),
      ),
    )
    .orderBy(desc(marketResourceVersions.versionNo));
};
