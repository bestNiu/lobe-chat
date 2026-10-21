/**
 * Shared types for the internal market service.
 *
 * Rule: anything the LobeHub client already models lives in
 * `@lobehub/market-types` (or `@lobehub/market-sdk`). Those are re-exported
 * rather than redefined, so a response we build can never drift from the
 * contract the SDK parses.
 */

export type {
  MarketSkillDetail,
  MarketSkillListItem,
  MarketSkillListResponse,
} from '@lobehub/market-sdk';
export type {
  AgentItem,
  AgentItemDetail,
  AgentListResponse,
  CategoryItem,
  MarketPluginItem,
  PluginConnectionType,
  PluginItemDetail,
  PluginListResponse,
} from '@lobehub/market-types';

// ---------------------------------------------------------------------------
// Service-owned types: these have no SDK equivalent because they describe our
// own storage and authorization model, not a wire contract.
// ---------------------------------------------------------------------------

export const MARKET_RESOURCE_TYPES = ['agent', 'skill', 'plugin'] as const;
export type MarketResourceType = (typeof MARKET_RESOURCE_TYPES)[number];

/**
 * Scope ladder for the internal market.
 *
 * `public` is deliberately absent: the market is internal-only and anonymous
 * reads must stay impossible (decision D2). `org` is the widest reachable
 * level — every authenticated user in the deployment.
 */
export const MARKET_SCOPES = ['private', 'org', 'team', 'users'] as const;
export type MarketScope = (typeof MARKET_SCOPES)[number];

export const MARKET_RESOURCE_STATUSES = [
  'draft',
  'submitted',
  'rejected',
  'published',
  'unpublished',
  'archived',
] as const;
export type MarketResourceStatus = (typeof MARKET_RESOURCE_STATUSES)[number];

export const MARKET_VERSION_STATUSES = [
  'draft',
  'submitted',
  'rejected',
  'published',
  'archived',
] as const;
export type MarketVersionStatus = (typeof MARKET_VERSION_STATUSES)[number];

export const GRANT_PERMISSIONS = ['read', 'install', 'manage'] as const;
export type GrantPermission = (typeof GRANT_PERMISSIONS)[number];

export const GRANT_EFFECTS = ['allow', 'deny'] as const;
export type GrantEffect = (typeof GRANT_EFFECTS)[number];

export const GRANT_SUBJECT_TYPES = ['user', 'team'] as const;
export type GrantSubjectType = (typeof GRANT_SUBJECT_TYPES)[number];

/** Reserved global role name; market admins are matched by email instead. */
export const MARKET_ADMIN_ROLE = 'market_admin';

/**
 * The authenticated caller, resolved once per request.
 *
 * `isAdmin` / `isReviewer` come from the market's own tables — the open-source
 * LobeHub build has no RBAC seeding, so nothing here may depend on it.
 */
export interface MarketActor {
  email?: string;
  isAdmin: boolean;
  isReviewer: boolean;
  name?: string;
  /** Team ids the actor belongs to. Populated once P2.5 lands. */
  teamIds: string[];
  userId: string;
}

/** Pagination envelope shared by every list endpoint. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const normalizePagination = (query: PageQuery) => {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
};
