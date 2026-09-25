import debug from 'debug';

import type { LobeChatDatabase } from '@/database/type';

import { evaluateModelAccess, type YoulinAccessDecision } from './policy';

const log = debug('lobe-server:youlin-model-governance');

export interface ChatAccessRequest {
  db: LobeChatDatabase;
  model: unknown;
  provider?: string;
  userId: string;
}

interface AccessFactsReader {
  readFacts: (query: { model: string; provider?: string; userId: string }) => Promise<any>;
}

/** Lazy by default so unit tests never pull the database graph into memory. */
const ledgerReader = async (request: ChatAccessRequest): Promise<AccessFactsReader> => {
  const { YoulinModelAccessReader } =
    await import('@/database/repositories/youlinModelGovernance/accessReader');
  return new YoulinModelAccessReader(request.db);
};

/**
 * Decide one chat turn against the administrator-maintained list and token quotas.
 *
 * Fails closed: an unreadable grant table or ledger is a refusal, never a silent allow, because the
 * alternative is an unbounded model spend during a database outage. Reasons stay coarse — they are
 * returned to the caller's own UI, and a model list must not leak another tenant's configuration.
 */
export const evaluateChatModelAccess = async (
  request: ChatAccessRequest,
  resolveReader: (request: ChatAccessRequest) => Promise<AccessFactsReader> = ledgerReader,
): Promise<YoulinAccessDecision> => {
  const model = typeof request.model === 'string' ? request.model.trim() : '';
  if (!model || typeof request.userId !== 'string' || !request.userId)
    return { reason: 'INVALID_INPUT' };
  try {
    const reader = await resolveReader(request);
    const facts = await reader.readFacts({
      model,
      provider: request.provider,
      userId: request.userId,
    });
    const decision = evaluateModelAccess(facts);
    if (decision.reason === 'INVALID_INPUT')
      // Types and booleans only, so an operator can name the broken fact without seeing any value.
      log(
        'access facts unusable clockValid=%s modelTokens=%s totalTokens=%s grantsIsArray=%s limit=%s',
        facts?.now instanceof Date && !Number.isNaN(facts.now.getTime()),
        typeof facts?.modelTokensThisPeriod,
        typeof facts?.totalTokensThisPeriod,
        Array.isArray(facts?.grants),
        typeof facts?.userMonthlyTokenLimit,
      );
    return decision;
  } catch {
    log('model access evaluation unavailable provider=%s', request.provider ?? 'unknown');
    return { reason: 'ACCESS_UNAVAILABLE' };
  }
};
