import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { agentQuotaUsageLedger as ledger } from '../../schemas/agentQuota';
import {
  youlinModelGrants as grants,
  youlinUserQuotas as quotas,
} from '../../schemas/youlinModelGrant';
import type { LobeChatDatabase } from '../../type';
import { IdentityAuthorityTransaction } from '../youlinIdentity/authorityTransaction';
import { YoulinIdentityError } from '../youlinIdentity/contracts';

const PERMISSION = 'identity:model-governance' as const;
const modelSchema = z.string().trim().min(1).max(255);
const providerSchema = z.string().trim().min(1).max(64).optional();
const limitSchema = z.number().int().min(0).max(2_147_483_647).nullable().optional();
const userIdSchema = z.string().min(1);

export interface YoulinGrantUpsert {
  enabled: boolean;
  model: string;
  monthlyTokenLimit?: null | number;
  provider?: string;
  targetUserId: string;
}

export interface YoulinQuotaSet {
  monthlyTotalTokenLimit?: null | number;
  targetUserId: string;
}

// The period and its counters come from the authoritative database clock inside the same
// transaction as the write, so an administrator cannot read one month and write another.
const PERIOD_START = sql`date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`;
const PERIOD_END = sql`(date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month') AT TIME ZONE 'Asia/Shanghai'`;
const TURN_TOKENS = sql`coalesce(${ledger.inputTokens}, 0) + coalesce(${ledger.outputTokens}, 0)`;

/**
 * Administrator-maintained model authorization and token quotas.
 *
 * Authorization is not reimplemented here: every method runs through the reviewed control-plane
 * transaction, which requires an active actor subject, an auth epoch matching the session capture,
 * a non-terminal authority version, an unbanned user and an explicit
 * `(enterpriseId, subjectId, authEpoch, identity:model-governance)` grant row, then revalidates
 * after taking the enterprise lock and writes audit in the same transaction.
 */
export class YoulinModelGovernanceTransaction extends IdentityAuthorityTransaction {
  constructor(
    db: LobeChatDatabase,
    options: {
      actor: { authEpoch: number; subjectId: string };
      enabled?: boolean;
      enterpriseId: string;
      lockTimeoutMs?: number;
      sqlTimeoutMs?: number;
    },
  ) {
    super(db, {
      actor: options.actor,
      enabled: options.enabled,
      enterpriseId: options.enterpriseId,
      lockTimeoutMs: options.lockTimeoutMs ?? 1500,
      sqlTimeoutMs: options.sqlTimeoutMs ?? 5000,
    });
  }

  /** Current authorization, caps and this month's consumption for one user. */
  listAccess = (targetUserId: string) => {
    const userId = userIdSchema.safeParse(targetUserId);
    if (!userId.success) throw new YoulinIdentityError('INVALID_TARGET_USER');
    return this.execute(PERMISSION, 'model-access.read', async (tx) => {
      const [rows, quota, usage] = await Promise.all([
        tx
          .select({
            enabled: grants.enabled,
            model: grants.model,
            monthlyTokenLimit: grants.monthlyTokenLimit,
            provider: grants.provider,
          })
          .from(grants)
          .where(eq(grants.userId, userId.data)),
        tx
          .select({ monthlyTotalTokenLimit: quotas.monthlyTotalTokenLimit })
          .from(quotas)
          .where(eq(quotas.userId, userId.data))
          .limit(1),
        tx
          .select({
            modelTokens: sql<
              unknown[]
            >`coalesce(json_agg(json_build_object('model', ${ledger.model}, 'tokens', ${TURN_TOKENS})) filter (where ${ledger.model} is not null), '[]'::json)`,
            periodId: sql<string>`to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM')`,
            totalTokens: sql<string>`coalesce(sum(${TURN_TOKENS}), 0)::bigint`,
          })
          .from(ledger)
          .where(
            and(
              eq(ledger.userId, userId.data),
              sql`${ledger.occurredAt} >= ${PERIOD_START}`,
              sql`${ledger.occurredAt} < ${PERIOD_END}`,
            ),
          ),
      ]);
      const row = usage[0];
      // bigint sums arrive as strings from node-postgres; an operator UI must receive numbers, and
      // a value that does not fit a safe integer is refused rather than silently truncated.
      const totalTokens = Number(row?.totalTokens ?? Number.NaN);
      if (!Number.isSafeInteger(totalTokens) || totalTokens < 0)
        throw new YoulinIdentityError('INVALID_USAGE_TOTAL');
      const perModel = Array.isArray(row?.modelTokens) ? row.modelTokens : [];
      return {
        grants: rows,
        quota: quota[0] ?? null,
        usage: {
          models: perModel.map((entry) => ({
            model: String((entry as { model?: unknown }).model ?? ''),
            tokens: Number((entry as { tokens?: unknown }).tokens ?? 0),
          })),
          periodId: String(row?.periodId ?? ''),
          totalTokens,
        },
      };
    });
  };

  /** Insert or update one model authorization. Absence still means "not callable". */
  upsertGrant = (input: YoulinGrantUpsert) => {
    const parsed = z
      .object({
        enabled: z.boolean(),
        model: modelSchema,
        monthlyTokenLimit: limitSchema,
        provider: providerSchema,
        targetUserId: userIdSchema,
      })
      .safeParse(input);
    if (!parsed.success) throw new YoulinIdentityError('INVALID_GRANT_INPUT');
    const { enabled, model, monthlyTokenLimit, provider, targetUserId } = parsed.data;
    return this.execute(
      PERMISSION,
      'model-access.grant.upsert',
      async (tx) => {
        const existing = await tx
          .select({ id: grants.id })
          .from(grants)
          .where(and(eq(grants.userId, targetUserId), eq(grants.model, model)))
          .limit(1);
        if (existing[0]) {
          await tx
            .update(grants)
            .set({
              enabled,
              monthlyTokenLimit: monthlyTokenLimit ?? null,
              provider: provider ?? null,
              updatedAt: new Date(),
            })
            .where(eq(grants.id, existing[0].id));
          return { grantId: existing[0].id, model, targetUserId, updated: true };
        }
        const [created] = await tx
          .insert(grants)
          .values({
            enabled,
            model,
            monthlyTokenLimit: monthlyTokenLimit ?? null,
            provider: provider ?? null,
            userId: targetUserId,
          })
          .returning({ id: grants.id });
        return { grantId: created.id, model, targetUserId, updated: false };
      },
      targetUserId,
    );
  };

  /** Set the per-user monthly total token cap; null means uncapped, never zero-by-omission. */
  setUserQuota = (input: YoulinQuotaSet) => {
    const parsed = z
      .object({ monthlyTotalTokenLimit: limitSchema, targetUserId: userIdSchema })
      .safeParse(input);
    if (!parsed.success) throw new YoulinIdentityError('INVALID_QUOTA_INPUT');
    const { monthlyTotalTokenLimit, targetUserId } = parsed.data;
    return this.execute(
      PERMISSION,
      'model-access.quota.set',
      async (tx) => {
        await tx
          .insert(quotas)
          .values({ monthlyTotalTokenLimit: monthlyTotalTokenLimit ?? null, userId: targetUserId })
          .onConflictDoUpdate({
            set: { monthlyTotalTokenLimit: monthlyTotalTokenLimit ?? null, updatedAt: new Date() },
            target: quotas.userId,
          });
        return { monthlyTotalTokenLimit: monthlyTotalTokenLimit ?? null, targetUserId };
      },
      targetUserId,
    );
  };
}
