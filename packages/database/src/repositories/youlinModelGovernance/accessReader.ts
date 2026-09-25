import { and, eq, sql } from 'drizzle-orm';

import { agentQuotaUsageLedger as ledger } from '../../schemas/agentQuota';
import {
  youlinModelGrants as grants,
  youlinUserQuotas as quotas,
} from '../../schemas/youlinModelGrant';
import type { LobeChatDatabase } from '../../type';
import type { YoulinModelGrant } from './types';

export interface YoulinModelAccessQuery {
  model: string;
  provider?: string;
  userId: string;
}

export interface YoulinModelAccessFacts {
  grants: YoulinModelGrant[];
  model: string;
  modelTokensThisPeriod: number;
  now: Date;
  periodId: string;
  totalTokensThisPeriod: number;
  userMonthlyTokenLimit: null | number;
}

// The period comes from the authoritative database clock, not the application host: a skewed
// container clock must not move a quota window. Asia/Shanghai natural month, no rollover.
const PERIOD_START = sql`date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`;
const PERIOD_END = sql`(date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month') AT TIME ZONE 'Asia/Shanghai'`;
const PERIOD_ID = sql<string>`to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM')`;
// Cached input is a subset of input and reasoning is a subset of output, so counting both raw
// columns once is the correct total; adding the detail columns would double-count.
const TURN_TOKENS = sql`coalesce(${ledger.inputTokens}, 0) + coalesce(${ledger.outputTokens}, 0)`;

/** Reads administrator grants plus ledger-derived consumption for the current natural month. */
export class YoulinModelAccessReader {
  constructor(private readonly db: LobeChatDatabase) {}

  readFacts = async (query: YoulinModelAccessQuery): Promise<YoulinModelAccessFacts> =>
    this.db.transaction(
      async (tx) => {
        const [grant] = await tx
          .select({
            enabled: grants.enabled,
            model: grants.model,
            monthlyTokenLimit: grants.monthlyTokenLimit,
            provider: grants.provider,
          })
          .from(grants)
          .where(and(eq(grants.userId, query.userId), eq(grants.model, query.model)))
          .limit(1);
        const [quota] = await tx
          .select({ monthlyTotalTokenLimit: quotas.monthlyTotalTokenLimit })
          .from(quotas)
          .where(eq(quotas.userId, query.userId))
          .limit(1);
        const [usage] = await tx
          .select({
            dbNow: sql<Date>`now()`,
            modelTokens: sql<number>`coalesce(sum(${TURN_TOKENS}) filter (where ${ledger.model} = ${query.model}), 0)::bigint`,
            periodId: PERIOD_ID,
            totalTokens: sql<number>`coalesce(sum(${TURN_TOKENS}), 0)::bigint`,
          })
          .from(ledger)
          .where(
            and(
              eq(ledger.userId, query.userId),
              sql`${ledger.occurredAt} >= ${PERIOD_START}`,
              sql`${ledger.occurredAt} < ${PERIOD_END}`,
            ),
          );

        // A grant scoped to another provider does not authorize this call: absence, not a fallback.
        const providerMatches = !grant?.provider || grant.provider === query.provider;
        return {
          grants: grant && providerMatches ? [grant] : [],
          model: query.model,
          modelTokensThisPeriod: Number(usage?.modelTokens ?? -1),
          now: usage?.dbNow instanceof Date ? usage.dbNow : new Date(Number.NaN),
          periodId: usage?.periodId ?? '',
          totalTokensThisPeriod: Number(usage?.totalTokens ?? -1),
          userMonthlyTokenLimit: quota?.monthlyTotalTokenLimit ?? null,
        };
      },
      { accessMode: 'read only', isolationLevel: 'read committed' },
    );
}
