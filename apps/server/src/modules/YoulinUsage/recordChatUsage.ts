import { randomUUID } from 'node:crypto';

import type { ModelTokensUsage } from '@lobechat/types';
import debug from 'debug';

import type { LobeChatDatabase } from '@/database/type';

import { mapModelUsage, type YoulinTokenUsage } from './usageMapping';

const log = debug('lobe-server:youlin-usage');

export interface YoulinUsageRecord {
  model?: string;
  operationId: string;
  provider: string;
  topicId?: string;
  usage: YoulinTokenUsage;
}

export interface RecordChatUsageParams {
  model?: string;
  operationId: string;
  provider: string;
  serverDB: LobeChatDatabase;
  topicId?: string;
  usage: ModelTokensUsage | undefined;
  userId: string;
  workspaceId?: string;
}

/** Idempotency key for one server-observed turn; the main path has no client message id yet. */
export const newUsageOperationId = (): string => randomUUID();

/**
 * Default sink: the upstream quota ledger, loaded lazily so unit tests never pull the database and
 * model-bank graph into memory. `recordUsage` is idempotent per `externalEventId`, so a replayed
 * turn cannot double-count.
 */
export const writeUsageToLedger = async (
  params: RecordChatUsageParams & { usage: YoulinTokenUsage },
): Promise<void> => {
  const { AgentQuotaService } = await import('@/server/services/agentQuota');
  const service = new AgentQuotaService(params.serverDB, params.userId, params.workspaceId);
  await service.recordUsage({
    model: params.model,
    operationId: params.operationId,
    provider: params.provider,
    topicId: params.topicId,
    usage: params.usage,
  });
};

/**
 * Persist one main-path chat turn into `agent_quota_usage_ledger`. Statistics only: it never blocks,
 * throttles or rewrites a response. Enforcement (model authorization, token quotas) must read this
 * ledger server-side rather than trusting client-reported numbers.
 */
export const recordChatUsage = async (
  params: RecordChatUsageParams,
  write: (
    record: RecordChatUsageParams & { usage: YoulinTokenUsage },
  ) => Promise<void> = writeUsageToLedger,
): Promise<void> => {
  const mapped = mapModelUsage(params.usage);
  // No usage reported means nothing to record; a zero row would hide real consumption.
  if (!mapped) {
    log('no usage reported provider=%s', params.provider);
    return;
  }
  try {
    await write({ ...params, usage: mapped });
  } catch {
    // Fixed classification only: no prompt content, no user id, no raw database error.
    log('usage ledger write failed provider=%s', params.provider);
  }
};
