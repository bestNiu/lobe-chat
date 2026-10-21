import type {
  MarketSkillDetail,
  MarketSkillListItem,
  MarketSkillManifest,
  MarketSkillVersionSummary,
} from '@lobehub/market-sdk';

import type { SnapshotItem } from '../snapshot/store';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;

const asRecord = <T>(value: unknown): T | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : undefined;

const EPOCH = new Date(0).toISOString();

/** Snapshot rows store `author` either as a bare string or as `{ name, url }`. */
const asAuthor = (value: unknown): { name: string; url?: string } | undefined => {
  const direct = asString(value);

  if (direct) return { name: direct };

  const record = asRecord<{ name?: unknown; url?: unknown }>(value);
  const name = asString(record?.name);

  return name ? { name, url: asString(record?.url) } : undefined;
};

/** List rows carry the license name; detail rows carry `{ name, url }`. */
const asLicense = (value: unknown): { name: string; url?: string } | undefined => {
  const direct = asString(value);

  if (direct) return { name: direct };

  const record = asRecord<{ name?: unknown; url?: unknown }>(value);
  const name = asString(record?.name);

  return name ? { name, url: asString(record?.url) } : undefined;
};

/**
 * The SDK contracts `manifestUrl` as part of the agent/skill payload the client
 * resolves before install, but `@lobehub/market-types` does not declare it yet,
 * so it is added on top of the mirrored shape and exposed on our own detail URL.
 */
const manifestUrlFor = (selfBaseUrl: string, identifier: string): string =>
  `${selfBaseUrl}/api/v1/skills/${encodeURIComponent(identifier)}`;

/** Snapshot item → `MarketSkillListItem`. */
export const toSkillListItem = (item: SnapshotItem, selfBaseUrl: string): MarketSkillListItem => {
  const identifier = item.identifier;
  const createdAt = asString(item.createdAt) ?? EPOCH;
  const license = asLicense(item.license);

  return {
    author: asString(item.author) ?? asAuthor(item.author)?.name,
    category: asString(item.category),
    commentCount: asNumber(item.commentCount) ?? 0,
    createdAt,
    description: asString(item.description) ?? '',
    github: asRecord<MarketSkillListItem['github']>(item.github),
    homepage: asString(item.homepage),
    icon: asString(item.icon) ?? asString(item.logo),
    identifier,
    installCount: asNumber(item.installCount) ?? 0,
    isFeatured: item.isFeatured === true,
    isOfficial: item.isOfficial === true,
    isValidated: item.isValidated === true,
    license: license?.name,
    logo: asString(item.logo),
    manifestUrl: manifestUrlFor(selfBaseUrl, identifier),
    name: asString(item.name) ?? identifier,
    ratingAvg: asNumber(item.ratingAvg),
    ratingCount: asNumber(item.ratingCount) ?? 0,
    resourcesCount: asNumber(item.resourcesCount),
    tags: asStringArray(item.tags),
    updatedAt: asString(item.updatedAt) ?? createdAt,
    version: asString(item.version) ?? '1.0.0',
  } as MarketSkillListItem;
};

/**
 * Snapshot list rows carry no version history, so a single current version is
 * synthesised; a row that does carry `versions` (upstream passthrough) keeps it.
 */
const toVersions = (
  item: SnapshotItem,
  createdAt: string,
  version: string,
  versionNumber: number,
): MarketSkillVersionSummary[] => {
  const provided = Array.isArray(item.versions)
    ? (item.versions as MarketSkillVersionSummary[])
    : [];

  if (provided.length > 0) return provided;

  return [{ createdAt, isLatest: true, version, versionNumber }];
};

/** Snapshot item → `MarketSkillDetail` (adds the install-critical `content`). */
export const toSkillDetail = (item: SnapshotItem, selfBaseUrl: string): MarketSkillDetail => {
  const base = toSkillListItem(item, selfBaseUrl);
  const author = asAuthor(item.author);
  const license = asLicense(item.license);
  const github = asRecord<MarketSkillDetail['github']>(item.github);
  const repository = asString(item.repository) ?? asString(github?.url);
  const summary = asString(item.summary);
  const versionNumber = asNumber(item.versionNumber) ?? 1;

  const manifest: MarketSkillManifest = {
    author,
    category: base.category,
    description: base.description,
    icon: base.icon,
    license: license?.name,
    name: base.name,
    repository,
    sourceUrl: asString(github?.url),
    summary,
    tags: base.tags,
    version: base.version,
  };

  return {
    ...base,
    author,
    content: asString(item.content) ?? '',
    github,
    license,
    manifest,
    overview: { summary },
    ratingAverage: asNumber(item.ratingAverage) ?? base.ratingAvg,
    repository,
    resources: asRecord<MarketSkillDetail['resources']>(item.resources) ?? {},
    validatedAt: asString(item.validatedAt),
    versionNumber,
    versions: toVersions(item, base.createdAt, base.version, versionNumber),
  } as MarketSkillDetail;
};
