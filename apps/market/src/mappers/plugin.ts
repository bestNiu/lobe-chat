import type { MarketPluginItem, PluginItemDetail } from '@lobehub/market-types';

import type { SnapshotItem } from '../snapshot/store';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const strArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;

const EPOCH = new Date(0).toISOString();

/** List/detail mapping for market MCP plugins. */
export const pluginMapper = {
  toItem(item: SnapshotItem, selfBaseUrl: string): MarketPluginItem {
    const identifier = item.identifier;
    const createdAt = str(item.createdAt) ?? EPOCH;

    return {
      author: str(item.author),
      capabilities: item.capabilities as MarketPluginItem['capabilities'],
      category: str(item.category),
      commentCount: num(item.commentCount) ?? 0,
      connectionType: str(item.connectionType) as MarketPluginItem['connectionType'],
      createdAt,
      description: str(item.description) ?? '',
      github: item.github as MarketPluginItem['github'],
      haveCloudEndpoint: str(item.haveCloudEndpoint),
      homepage: str(item.homepage),
      icon: str(item.icon),
      identifier,
      installCount: num(item.installCount),
      installationMethods: str(item.installationMethods),
      isClaimed: item.isClaimed === true,
      isFeatured: item.isFeatured === true,
      isOfficial: item.isOfficial === true,
      isValidated: item.isValidated === true,
      // The upstream list already carries manifestUrl; when it points at their
      // host we rewrite it to ours so browsers never need that origin.
      manifestUrl: `${selfBaseUrl}/api/v1/plugins/${encodeURIComponent(identifier)}/manifest`,
      name: str(item.name) ?? identifier,
      promptsCount: num(item.promptsCount),
      ratingAverage: num(item.ratingAverage),
      ratingCount: num(item.ratingCount),
      resourcesCount: num(item.resourcesCount),
      tags: strArray(item.tags),
      toolsCount: num(item.toolsCount),
      updatedAt: str(item.updatedAt) ?? createdAt,
    } as MarketPluginItem;
  },

  toDetail(item: SnapshotItem, selfBaseUrl: string): PluginItemDetail {
    const base = this.toItem(item, selfBaseUrl);
    const version = str(item.version) ?? '1.0.0';
    const versions = Array.isArray(item.versions)
      ? item.versions
      : [
          {
            createdAt: str(item.createdAt) ?? EPOCH,
            isLatest: true,
            version,
            versionNumber: num(item.versionNumber) ?? 1,
          },
        ];

    return {
      ...base,
      deploymentOptions: item.deploymentOptions as PluginItemDetail['deploymentOptions'],
      description: str(item.description) ?? '',
      overview: (item.overview as PluginItemDetail['overview']) ?? {},
      prompts: item.prompts as PluginItemDetail['prompts'],
      resources: item.resources as PluginItemDetail['resources'],
      tools: (item.tools as PluginItemDetail['tools']) ?? [],
      version,
      versions: versions as PluginItemDetail['versions'],
    } as PluginItemDetail;
  },
};
