import { createHash, randomUUID } from 'node:crypto';

import type {
  YoulinIdentityAuditDetail,
  YoulinIdentityCommandResult,
  YoulinIdentityPermission,
} from '@lobechat/types';
import { and, eq } from 'drizzle-orm';

import {
  youlinIdentityAuditEvents,
  youlinIdentityCommands,
  youlinIdentityOutbox,
} from '../../schemas/youlinIdentityOperations';
import type { Transaction } from '../../type';
import { IdentityAuthorityTransaction } from './authorityTransaction';
import {
  identityCommandResultSchema,
  identityIdempotencySchema,
  YoulinIdentityError,
} from './contracts';

export type { IdentityCommandOptions } from './authorityTransaction';

const permissions = {
  start_manual_provider_work: 'identity:provision',
  complete_manual_provider_work: 'identity:provision',
  activate_subject: 'identity:activate',
  activate_manual_enrollment: 'identity:activate',
  assign_first_administrator: 'identity:provision',
  bind_principal: 'identity:bind',
  bind_manual_principal: 'identity:bind',
  disable_manual_enrollment: 'identity:revoke',
  register_person: 'identity:provision',
  record_credential_cleanup: 'identity:record-cleanup',
  reserve_manual_enrollment: 'identity:provision',
  review_binding: 'identity:review',
  revoke_subject: 'identity:revoke',
  update_employment: 'identity:sync-hr',
} as const satisfies Record<string, YoulinIdentityPermission>;

type IdentityOperation = keyof typeof permissions;

interface CommandChange {
  detail: YoulinIdentityAuditDetail;
  result: YoulinIdentityCommandResult;
  subjectId?: string;
}

/** Domain commands add exactly one receipt/audit/outbox bundle to the authorized transaction. */
export class IdentityCommandRunner extends IdentityAuthorityTransaction {
  async run(
    operation: IdentityOperation,
    idempotencyKey: string,
    normalizedInput: unknown,
    work: (tx: Transaction) => Promise<CommandChange>,
    principalLock?: string,
  ): Promise<YoulinIdentityCommandResult> {
    const key = identityIdempotencySchema.parse(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex');
    return this.execute(
      permissions[operation],
      operation,
      async (tx, commandId) => {
        const [receipt] = await tx
          .select()
          .from(youlinIdentityCommands)
          .where(
            and(
              eq(youlinIdentityCommands.enterpriseId, this.enterpriseId),
              eq(youlinIdentityCommands.actorId, this.actor.subjectId),
              eq(youlinIdentityCommands.operation, operation),
              eq(youlinIdentityCommands.idempotencyKey, key),
            ),
          )
          .limit(1);
        if (receipt) {
          if (receipt.requestHash !== requestHash)
            throw new YoulinIdentityError('IDEMPOTENCY_CONFLICT');
          return identityCommandResultSchema.parse(receipt.result);
        }
        const change = await work(tx);
        const auditId = randomUUID();
        const baseResult = identityCommandResultSchema.parse(change.result);
        const result = identityCommandResultSchema.parse(
          change.detail.needsCredentialRevocation === true &&
            (baseResult.status === 'created' ||
              (baseResult.status === 'revoked' && operation === 'disable_manual_enrollment'))
            ? { ...baseResult, revocationEventId: auditId }
            : baseResult,
        );
        await tx.insert(youlinIdentityCommands).values({
          actorId: this.actor.subjectId,
          enterpriseId: this.enterpriseId,
          id: commandId,
          idempotencyKey: key,
          operation,
          requestHash,
          result,
        });
        await tx.insert(youlinIdentityAuditEvents).values({
          actorId: this.actor.subjectId,
          commandId,
          detail: change.detail,
          enterpriseId: this.enterpriseId,
          id: auditId,
          operation,
          subjectId: change.subjectId,
        });
        await tx
          .insert(youlinIdentityOutbox)
          .values({ auditEventId: auditId, enterpriseId: this.enterpriseId });
        return result;
      },
      principalLock,
    );
  }
}
