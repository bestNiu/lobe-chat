import { randomUUID } from 'node:crypto';

import type { YoulinSessionBindingContext } from '@lobechat/types';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { session as authSessions } from '../../../schemas/betterAuth';
import { youlinIdentityBindings, youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinSessionProofs } from '../../../schemas/youlinIdentitySession';
import { YoulinSessionProofRepository } from '../sessionProof';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('native enterprise session proofs', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  let repository: YoulinSessionProofRepository;
  let context: YoulinSessionBindingContext;

  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
    const { subjectId } = await fixture.seedActor('a', [], true);
    const [subject] = await fixture.db
      .select({ userId: youlinSubjects.userId })
      .from(youlinSubjects)
      .where(eq(youlinSubjects.id, subjectId));
    const bindingId = randomUUID();
    await fixture.db.insert(youlinIdentityBindings).values({
      enterpriseId: 'a',
      externalSubject: 'principal-a',
      id: bindingId,
      issuer: 'https://idp.synthetic',
      subjectId,
    });
    await fixture.db.insert(authSessions).values({
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      id: 'native-session-a',
      token: randomUUID(),
      updatedAt: new Date(),
      userId: subject.userId!,
    });
    context = {
      authEpoch: 0,
      bindingId,
      enterpriseId: 'a',
      externalSubject: 'principal-a',
      issuer: 'https://idp.synthetic',
      subjectId,
      userId: subject.userId!,
    };
    repository = new YoulinSessionProofRepository(fixture.db, {
      enabled: true,
      maxConcurrentReads: 2,
      statementTimeoutMs: 1000,
    });
  });

  it('binds and reads the exact native session/user/principal/epoch tuple', async () => {
    expect(await repository.bindSession('native-session-a', context)).toEqual({
      ...context,
      sessionId: 'native-session-a',
    });
    expect(
      await repository.readSession(
        'native-session-a',
        context.userId,
        new AbortController().signal,
      ),
    ).toEqual({ ...context, sessionId: 'native-session-a' });
  });

  it('rejects a mismatched user and does not expose another user proof', async () => {
    await expect(
      repository.bindSession('native-session-a', { ...context, userId: 'other-user' }),
    ).rejects.toThrow('SESSION_BINDING_MISMATCH');
    await repository.bindSession('native-session-a', context);
    expect(
      await repository.readSession('native-session-a', 'other-user', new AbortController().signal),
    ).toBeNull();
  });

  it('rejects create-after-deny using the captured epoch rather than session creation time', async () => {
    await fixture.db
      .update(youlinSubjects)
      .set({ authEpoch: 1, status: 'disabled' })
      .where(eq(youlinSubjects.id, context.subjectId));
    await expect(repository.bindSession('native-session-a', context)).rejects.toThrow(
      'SESSION_BINDING_MISMATCH',
    );
    expect(await fixture.db.select().from(youlinSessionProofs)).toHaveLength(0);
  });

  it('rejects an expired native session at binding time using the database clock', async () => {
    await fixture.db
      .update(authSessions)
      .set({ expiresAt: new Date('2000-01-01T00:00:00Z') })
      .where(eq(authSessions.id, 'native-session-a'));
    await expect(repository.bindSession('native-session-a', context)).rejects.toThrow(
      'SESSION_BINDING_MISMATCH',
    );
  });

  it('rejects a proof when the native session has since expired despite a cached caller session', async () => {
    await repository.bindSession('native-session-a', context);
    await fixture.db
      .update(authSessions)
      .set({ expiresAt: new Date('2000-01-01T00:00:00Z') })
      .where(eq(authSessions.id, 'native-session-a'));
    expect(
      await repository.readSession(
        'native-session-a',
        context.userId,
        new AbortController().signal,
      ),
    ).toBeNull();
  });

  it('preserves the captured epoch so current-state enforcement can reject later revocation', async () => {
    await repository.bindSession('native-session-a', context);
    await fixture.db
      .update(youlinSubjects)
      .set({ authEpoch: 1, status: 'disabled' })
      .where(eq(youlinSubjects.id, context.subjectId));

    expect(
      await repository.readSession(
        'native-session-a',
        context.userId,
        new AbortController().signal,
      ),
    ).toEqual({ ...context, sessionId: 'native-session-a' });
  });

  it('keeps one immutable proof per native session and cascades session deletion', async () => {
    await repository.bindSession('native-session-a', context);
    await expect(repository.bindSession('native-session-a', context)).rejects.toThrow();
    await fixture.db.delete(authSessions).where(eq(authSessions.id, 'native-session-a'));
    expect(await fixture.db.select().from(youlinSessionProofs)).toHaveLength(0);
  });

  it('enforces foreign keys for the formal subject, principal and native session', async () => {
    await expect(
      fixture.db.insert(youlinSessionProofs).values({
        ...context,
        externalSubject: 'missing-principal',
        sessionId: 'native-session-a',
      }),
    ).rejects.toThrow();
    await expect(
      fixture.db.insert(youlinSessionProofs).values({
        ...context,
        sessionId: 'missing-session',
      }),
    ).rejects.toThrow();
  });
});
