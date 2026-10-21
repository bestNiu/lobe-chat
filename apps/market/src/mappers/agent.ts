import type { AgentItem, AgentItemDetail } from '@lobehub/market-types';

import type { SnapshotItem } from '../snapshot/store';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;

const EPOCH = new Date(0).toISOString();

/** List/detail mapping for market agents. */
export const agentMapper = {
  /**
   * Snapshot item → `AgentItem`.
   *
   * Upstream list rows already carry every field the SDK expects except
   * `manifestUrl`, which the contract types as a required string; agents have no
   * real manifest, so we point it at our own detail endpoint.
   */
  toItem(item: SnapshotItem, selfBaseUrl: string): AgentItem {
    const identifier = item.identifier;
    const createdAt = asString(item.createdAt) ?? EPOCH;

    return {
      author: asString(item.author),
      category: asString(item.category),
      compatibility: item.compatibility as Record<string, unknown> | undefined,
      createdAt,
      description: asString(item.description) ?? '',
      forkCount: asNumber(item.forkCount),
      homepage: asString(item.homepage),
      icon: asString(item.icon) ?? asString(item.avatar),
      identifier,
      installCount: asNumber(item.installCount),
      isValidated: item.isValidated === true,
      knowledgeCount: asNumber(item.knowledgeCount),
      manifestUrl: `${selfBaseUrl}/api/v1/agents/${encodeURIComponent(identifier)}`,
      name: asString(item.name) ?? identifier,
      pluginCount: asNumber(item.pluginCount),
      tags: asStringArray(item.tags),
      tokenUsage: asNumber(item.tokenUsage),
      updatedAt: asString(item.updatedAt) ?? createdAt,
    } as AgentItem;
  },

  /** Snapshot item → `AgentItemDetail` (adds the install-critical `config`). */
  toDetail(item: SnapshotItem, selfBaseUrl: string): AgentItemDetail {
    const base = this.toItem(item, selfBaseUrl);

    return {
      ...base,
      avatar: asString(item.avatar) ?? asString(item.icon) ?? '🤖',
      config: (item.config as Record<string, unknown>) ?? {},
      description: asString(item.description) ?? '',
      examples: asStringArray(item.examples),
      summary: asString(item.summary),
      version: asString(item.version),
      versionNumber: asNumber(item.versionNumber),
    } as AgentItemDetail;
  },
};

/**
 * Fork responses do not carry the agent config — LobeHub reads it from the
 * detail endpoint. This synthesises an id so the SDK contract type-checks.
 */
export const buildForkResponse = (source: SnapshotItem, forkIdentifier: string, name?: string) => {
  const now = new Date().toISOString();
  const sourceId = hashId(source.identifier);
  const newId = hashId(`${source.identifier}:${forkIdentifier}`);
  const versionNumber = asNumber(source.versionNumber) ?? 1;

  return {
    agent: {
      createdAt: now,
      forkedFromAgentId: sourceId,
      id: newId,
      identifier: forkIdentifier,
      name: name ?? asString(source.name) ?? forkIdentifier,
      ownerId: 0,
      updatedAt: now,
    },
    source: { agentId: sourceId, identifier: source.identifier, versionNumber },
    version: { agentId: newId, createdAt: now, id: newId + 1, versionNumber },
  };
};

/** Stable, collision-tolerant numeric id derived from a string identifier. */
export const hashId = (input: string): number => {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }

  return hash;
};
