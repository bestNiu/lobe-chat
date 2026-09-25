import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../schemas/user';
import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityCommands } from '../../../schemas/youlinIdentityOperations';
import { YoulinIdentityCredentialCleanup } from '../credentialCleanup';
import { YoulinIdentityManualEnrollment } from '../manualEnrollment';
import { YoulinIdentityManualPrincipalLink } from '../manualPrincipalLink';
import { YoulinManualProviderWork } from '../manualProviderWork';
import { createIdentityTestDatabase } from './database';

const enterpriseId = 'manual-work';
const issuer = 'https://idp.synthetic/realms/manual-work';
describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('manual provider work single flight', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let work: YoulinManualProviderWork;
  let subjectId: string;
  const key = 'work-command';
  const intent = { email: 'person@example.invalid', employeeNumber: 'WORK-01' };
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    await fixture.reset();
    const actor = await fixture.seedActor(
      enterpriseId,
      ['identity:provision', 'identity:bind', 'identity:activate'],
      true,
    );
    const cleanupActor = await fixture.seedActor(enterpriseId, ['identity:record-cleanup']);
    const options = { actor, enabled: true, enterpriseId, lockTimeoutMs: 1000, sqlTimeoutMs: 3000 };
    work = new YoulinManualProviderWork(fixture.db, options);
    const userId = `work-user-${randomUUID().slice(0, 8)}`;
    await fixture.db.insert(users).values({ id: userId });
    const enrollment = new YoulinIdentityManualEnrollment(fixture.db, {
      ...options,
      allowedIssuers: [issuer],
    });
    const reserved = await enrollment.reserve('reserve', {
      employeeNumber: intent.employeeNumber,
      userId,
    });
    subjectId = reserved.subjectId;
    await new YoulinIdentityManualPrincipalLink(fixture.db, { ...options, issuer }).link('link', {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      subjectId,
      issuer,
      externalSubject: randomUUID(),
    });
    // Real provider cleanup must be attested by the narrow service actor before activation.
    await new YoulinIdentityCredentialCleanup(fixture.db, {
      actor: { authEpoch: 0, subjectId: cleanupActor.subjectId },
      enabled: true,
      enterpriseId,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    }).recordCompletion('cleanup', {
      expectedAuthEpoch: 0,
      revocationEventId: reserved.revocationEventId,
    });
    await enrollment.activate('activate', {
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 0,
      subjectId,
    });
  });
  const startReceipt = async () => {
    const [row] = await fixture.db
      .select()
      .from(youlinIdentityCommands)
      .where(
        and(
          eq(youlinIdentityCommands.enterpriseId, enterpriseId),
          eq(youlinIdentityCommands.operation, 'start_manual_provider_work'),
          eq(youlinIdentityCommands.idempotencyKey, key),
        ),
      );
    return row.result;
  };
  it('claims once, never re-executes provider work, and returns the completed owner on replay', async () => {
    const claimed = await work.begin(key, intent);
    expect(claimed.kind).toBe('claimed');
    if (claimed.kind !== 'claimed') throw new Error('unreachable');
    const concurrent = await Promise.allSettled(
      Array.from({ length: 2 }, () => work.begin(key, intent)),
    );
    expect(concurrent.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(await startReceipt()).toMatchObject({
      status: 'provider_work_started',
      workId: claimed.workId,
    });
    await work.complete(key, { principalId: randomUUID(), subjectId, workId: claimed.workId });
    const replay = await work.begin(key, intent);
    expect(replay).toMatchObject({ kind: 'completed', subjectId });
    await expect(work.begin(key, { ...intent, employeeNumber: 'WORK-02' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('blocks start/completion with another worker id or a revoked subject', async () => {
    const claimed = await work.begin(key, intent);
    await expect(
      work.complete(key, { principalId: randomUUID(), subjectId, workId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_WORK_OWNER' });
    const otherActor = await fixture.seedActor(enterpriseId, ['identity:provision'], true);
    const other = new YoulinManualProviderWork(fixture.db, {
      actor: otherActor,
      enabled: true,
      enterpriseId,
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    // Enterprise-scoped single flight: another operator cannot claim or re-execute the same key
    // while the first start is uncompleted; it must go through explicit reconciliation.
    await expect(other.begin(key, intent)).rejects.toMatchObject({
      code: 'PROVIDER_WORK_RECONCILIATION_REQUIRED',
    });
    expect(claimed.kind).toBe('claimed');
    if (claimed.kind !== 'claimed') throw new Error('unreachable');
    await fixture.db
      .update(youlinSubjects)
      .set({ status: 'disabled', authEpoch: 1 })
      .where(eq(youlinSubjects.id, subjectId));
    await expect(
      work.complete(key, { principalId: randomUUID(), subjectId, workId: claimed.workId }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_STATE_UNCONFIRMED' });
  });
});
