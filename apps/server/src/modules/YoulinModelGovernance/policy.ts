import { shanghaiBudgetPeriod } from '../YoulinModelAccess/period';

/** One administrator-maintained authorization row: which model a user may call and its cap. */
export interface YoulinModelGrant {
  enabled: boolean;
  model: string;
  /** Per-model token cap for the current Asia/Shanghai calendar month; null means uncapped. */
  monthlyTokenLimit?: null | number;
}

export interface YoulinAccessFacts {
  grants: readonly YoulinModelGrant[];
  model: string;
  /** Tokens already recorded by the server-side ledger for this model in the current period. */
  modelTokensThisPeriod: number;
  now: Date;
  /** Tokens already recorded for this user across all models in the current period. */
  totalTokensThisPeriod: number;
  /** Per-user total token cap for the current period; null means uncapped. */
  userMonthlyTokenLimit?: null | number;
}

export type YoulinAccessReason =
  | 'ACCESS_UNAVAILABLE'
  | 'ALLOWED'
  | 'INVALID_INPUT'
  | 'MODEL_DISABLED'
  | 'MODEL_NOT_GRANTED'
  | 'MODEL_QUOTA_EXCEEDED'
  | 'USER_QUOTA_EXCEEDED';

export interface YoulinAccessDecision {
  /** Period the counters belong to, so a caller can never mix months silently. */
  periodId?: string;
  reason: YoulinAccessReason;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isLimit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Decide one chat turn against the administrator-maintained authorization list and token quotas.
 *
 * Deny by default: a model with no grant row is not callable, and a grant that is present but
 * disabled stays disabled. Counters come from the server-side ledger, never from the client, and
 * an absent or corrupt counter is a refusal rather than a zero.
 *
 * This is a pre-turn check on accumulated usage, so the turn that crosses a limit is the last one
 * allowed and a single in-flight turn can overshoot by its own size. Atomic per-turn reservation is
 * a separate slice; do not describe this as hard budget isolation across concurrent requests.
 */
export const evaluateModelAccess = (facts: YoulinAccessFacts): YoulinAccessDecision => {
  const model = typeof facts?.model === 'string' ? facts.model.trim() : '';
  if (!model || !isCount(facts.modelTokensThisPeriod) || !isCount(facts.totalTokensThisPeriod))
    return { reason: 'INVALID_INPUT' };
  if (facts.userMonthlyTokenLimit != null && !isLimit(facts.userMonthlyTokenLimit))
    return { reason: 'INVALID_INPUT' };
  if (!Array.isArray(facts.grants) || !(facts.now instanceof Date))
    return { reason: 'INVALID_INPUT' };

  let period;
  try {
    period = shanghaiBudgetPeriod(facts.now);
  } catch {
    return { reason: 'INVALID_INPUT' };
  }

  const grant = facts.grants.find((entry) => entry && entry.model === model);
  if (!grant) return { periodId: period.id, reason: 'MODEL_NOT_GRANTED' };
  if (grant.enabled !== true) return { periodId: period.id, reason: 'MODEL_DISABLED' };
  if (isLimit(grant.monthlyTokenLimit) && facts.modelTokensThisPeriod >= grant.monthlyTokenLimit)
    return { periodId: period.id, reason: 'MODEL_QUOTA_EXCEEDED' };
  if (
    isLimit(facts.userMonthlyTokenLimit) &&
    facts.totalTokensThisPeriod >= facts.userMonthlyTokenLimit
  )
    return { periodId: period.id, reason: 'USER_QUOTA_EXCEEDED' };

  return { periodId: period.id, reason: 'ALLOWED' };
};
