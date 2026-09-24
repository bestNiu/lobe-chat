import { randomUUID } from 'node:crypto';

import type { YoulinIdentityOutboxClaim } from '@lobechat/types';
import { and, asc, eq, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  youlinIdentityAuditEvents,
  youlinIdentityOutbox,
} from '../../schemas/youlinIdentityOperations';
import type { LobeChatDatabase } from '../../type';
import type { IdentityCommandOptions } from './authorityTransaction';
import { IdentityAuthorityTransaction } from './authorityTransaction';
import { YoulinIdentityError } from './contracts';

const deliveryOptionsSchema = z
  .object({
    leaseMs: z.number().int().min(1).max(60_000),
    maxAttempts: z.number().int().min(1).max(100),
  })
  .strict();
const leaseSchema = z.object({ leaseToken: z.uuid(), outboxId: z.uuid() }).strict();
const retryDelaySchema = z.number().int().min(0).max(3_600_000);

/** Private at-least-once event relay, NOT proof that an IdP/session revocation completed.
 * The transport runs outside these transactions. Acknowledgement never activates a subject or
 * sets idpRevocationConfirmedEpoch. Delivery attempts and fencing are enforced by the DB clock.
 */
export class YoulinIdentityOutbox extends IdentityAuthorityTransaction {
  private readonly delivery: z.infer<typeof deliveryOptionsSchema>;

  constructor(
    db: LobeChatDatabase,
    options: IdentityCommandOptions,
    delivery: z.infer<typeof deliveryOptionsSchema>,
  ) {
    super(db, options);
    this.delivery = deliveryOptionsSchema.parse(delivery);
  }

  async claim(): Promise<YoulinIdentityOutboxClaim> {
    return this.execute('identity:deliver', 'outbox_claim', async (tx) => {
      const [event] = await tx
        .select()
        .from(youlinIdentityOutbox)
        .where(
          and(
            eq(youlinIdentityOutbox.enterpriseId, this.enterpriseId),
            or(
              and(
                eq(youlinIdentityOutbox.status, 'pending'),
                lte(youlinIdentityOutbox.availableAt, sql`clock_timestamp()`),
              ),
              and(
                eq(youlinIdentityOutbox.status, 'leased'),
                lte(youlinIdentityOutbox.leaseExpiresAt, sql`clock_timestamp()`),
              ),
            ),
          ),
        )
        .orderBy(
          asc(youlinIdentityOutbox.availableAt),
          asc(youlinIdentityOutbox.createdAt),
          asc(youlinIdentityOutbox.id),
        )
        .limit(1)
        .for('update', { skipLocked: true });
      if (!event) return null;
      if (event.attempts >= this.delivery.maxAttempts) {
        await tx
          .update(youlinIdentityOutbox)
          .set({ leaseExpiresAt: null, leaseToken: null, status: 'dead' })
          .where(eq(youlinIdentityOutbox.id, event.id));
        return { outboxId: event.id, status: 'dead' };
      }
      const leaseToken = randomUUID();
      const [leased] = await tx
        .update(youlinIdentityOutbox)
        .set({
          attempts: event.attempts + 1,
          leaseExpiresAt: sql`clock_timestamp() + ${this.delivery.leaseMs} * interval '1 millisecond'`,
          leaseToken,
          status: 'leased',
        })
        .where(eq(youlinIdentityOutbox.id, event.id))
        .returning();
      if (!leased.leaseExpiresAt) throw new YoulinIdentityError('INVALID_LEASE_STATE');
      const [audit] = await tx
        .select()
        .from(youlinIdentityAuditEvents)
        .where(
          and(
            eq(youlinIdentityAuditEvents.enterpriseId, this.enterpriseId),
            eq(youlinIdentityAuditEvents.id, event.auditEventId),
          ),
        )
        .limit(1);
      if (!audit) throw new YoulinIdentityError('AUDIT_EVENT_UNAVAILABLE');
      return {
        attempts: leased.attempts,
        detail: audit.detail,
        eventId: audit.id,
        leaseExpiresAt: leased.leaseExpiresAt,
        leaseToken,
        operation: audit.operation,
        outboxId: event.id,
        status: 'leased',
        subjectId: audit.subjectId,
      };
    });
  }

  async acknowledge(input: unknown) {
    const lease = leaseSchema.parse(input);
    return this.execute('identity:deliver', 'outbox_acknowledge', async (tx) => {
      const [updated] = await tx
        .update(youlinIdentityOutbox)
        .set({
          deliveredAt: sql`clock_timestamp()`,
          leaseExpiresAt: null,
          leaseToken: null,
          status: 'delivered',
        })
        .where(
          and(
            eq(youlinIdentityOutbox.enterpriseId, this.enterpriseId),
            eq(youlinIdentityOutbox.id, lease.outboxId),
            eq(youlinIdentityOutbox.status, 'leased'),
            eq(youlinIdentityOutbox.leaseToken, lease.leaseToken),
            sql`${youlinIdentityOutbox.leaseExpiresAt} > clock_timestamp()`,
          ),
        )
        .returning({ id: youlinIdentityOutbox.id });
      if (!updated) throw new YoulinIdentityError('LEASE_LOST');
      return { status: 'delivered' as const };
    });
  }

  async retry(input: unknown, delayMs: number) {
    const lease = leaseSchema.parse(input);
    const delay = retryDelaySchema.parse(delayMs);
    return this.execute('identity:deliver', 'outbox_retry', async (tx) => {
      const [updated] = await tx
        .update(youlinIdentityOutbox)
        .set({
          availableAt: sql`clock_timestamp() + ${delay} * interval '1 millisecond'`,
          leaseExpiresAt: null,
          leaseToken: null,
          status: sql`CASE WHEN ${youlinIdentityOutbox.attempts} >= ${this.delivery.maxAttempts} THEN 'dead' ELSE 'pending' END`,
        })
        .where(
          and(
            eq(youlinIdentityOutbox.enterpriseId, this.enterpriseId),
            eq(youlinIdentityOutbox.id, lease.outboxId),
            eq(youlinIdentityOutbox.status, 'leased'),
            eq(youlinIdentityOutbox.leaseToken, lease.leaseToken),
            sql`${youlinIdentityOutbox.leaseExpiresAt} > clock_timestamp()`,
          ),
        )
        .returning({ status: youlinIdentityOutbox.status });
      if (!updated) throw new YoulinIdentityError('LEASE_LOST');
      return updated;
    });
  }
}
