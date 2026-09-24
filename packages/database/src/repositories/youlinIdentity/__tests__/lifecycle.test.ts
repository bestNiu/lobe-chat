import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import { invalidateSubjectAuthority } from '../lifecycle';
import { createIdentityTestDatabase } from './database';

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)(
  'shared credential invalidation transition',
  () => {
    let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
    let subjectId: string;
    beforeAll(async () => {
      fixture = await createIdentityTestDatabase();
    });
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    beforeEach(async () => {
      await fixture.reset();
      subjectId = (await fixture.seedActor('a', ['identity:read'])).subjectId;
    });

    it('never moves the credential barrier backwards and never restores old grants', async () => {
      const future = new Date('2099-01-01T00:00:00Z');
      await fixture.db
        .update(youlinSubjects)
        .set({ credentialsNotBefore: future, idpRevocationConfirmedEpoch: 0 })
        .where(eq(youlinSubjects.id, subjectId));
      await fixture.db.transaction(async (tx) => {
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(eq(youlinSubjects.id, subjectId))
          .for('update');
        expect(await invalidateSubjectAuthority(tx, subject, 'pending')).toEqual({
          authEpoch: 1,
          authorityVersion: 1,
          status: 'pending',
        });
      });
      const [subject] = await fixture.db
        .select()
        .from(youlinSubjects)
        .where(eq(youlinSubjects.id, subjectId));
      expect(subject.credentialsNotBefore).toEqual(future);
      expect(subject.idpRevocationConfirmedEpoch).toBeNull();
      expect(await fixture.db.select().from(youlinIdentityGrants)).toHaveLength(0);
    });

    it('rejects stale target revisions without deleting grants or overwriting newer state', async () => {
      const [stale] = await fixture.db
        .select()
        .from(youlinSubjects)
        .where(eq(youlinSubjects.id, subjectId));
      await fixture.db
        .update(youlinSubjects)
        .set({ authorityVersion: 1 })
        .where(eq(youlinSubjects.id, subjectId));
      await expect(
        fixture.db.transaction((tx) => invalidateSubjectAuthority(tx, stale, 'disabled')),
      ).rejects.toMatchObject({ code: 'SUBJECT_VERSION_CONFLICT' });
      expect(await fixture.db.select().from(youlinIdentityGrants)).toHaveLength(1);
    });

    it('turns the last representable transition into permanent denial, not pending activation', async () => {
      await fixture.db
        .update(youlinSubjects)
        .set({ authEpoch: Number.MAX_SAFE_INTEGER - 1 })
        .where(eq(youlinSubjects.id, subjectId));
      await fixture.db.transaction(async (tx) => {
        const [subject] = await tx
          .select()
          .from(youlinSubjects)
          .where(eq(youlinSubjects.id, subjectId))
          .for('update');
        expect(await invalidateSubjectAuthority(tx, subject, 'pending')).toMatchObject({
          authEpoch: Number.MAX_SAFE_INTEGER,
          status: 'disabled',
        });
      });
    });
  },
);
