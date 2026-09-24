import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import { IdentityAuthorityTransaction } from '../authorityTransaction';
import { createIdentityTestDatabase } from './database';

class AuthorityProbe extends IdentityAuthorityTransaction {
  inspect() {
    return this.execute('identity:read', 'synthetic_authority_probe', async (tx) => {
      const [row] = await tx
        .select({
          isolation: sql<string>`current_setting('transaction_isolation')`,
          readOnly: sql<string>`current_setting('transaction_read_only')`,
        })
        .from(sql`(SELECT 1) AS probe`);
      return row;
    });
  }
}

describe.skipIf(!process.env.YOULIN_NODEPG_SOCKET)('shared authority transaction', () => {
  let fixture: Awaited<ReturnType<typeof createIdentityTestDatabase>>;
  beforeAll(async () => {
    fixture = await createIdentityTestDatabase();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  beforeEach(async () => {
    await fixture.reset();
  });

  it('uses a fresh writable read-committed transaction and snapshots caller options', async () => {
    const actor = await fixture.seedActor('a', ['identity:read']);
    const options = {
      actor,
      enabled: true,
      enterpriseId: 'a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    };
    const probe = new AuthorityProbe(fixture.db, options);
    options.enterpriseId = 'other';
    actor.authEpoch = 99;
    expect(await probe.inspect()).toEqual({ isolation: 'read committed', readOnly: 'off' });
  });

  it('requires the operation-specific current grant', async () => {
    const actor = await fixture.seedActor('a', ['identity:provision']);
    const probe = new AuthorityProbe(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(probe.inspect()).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
  });

  it('denies terminal authority revisions even with an active actor and current grant', async () => {
    const actor = await fixture.seedActor('a', ['identity:read']);
    await fixture.db
      .update(youlinSubjects)
      .set({ authorityVersion: Number.MAX_SAFE_INTEGER })
      .where(eq(youlinSubjects.id, actor.subjectId));
    const probe = new AuthorityProbe(fixture.db, {
      actor,
      enabled: true,
      enterpriseId: 'a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(probe.inspect()).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
  });

  it('denies terminal-epoch actors even if inconsistent data says active with a matching grant', async () => {
    const actor = await fixture.seedActor('a', ['identity:read']);
    await fixture.db
      .update(youlinSubjects)
      .set({ authEpoch: Number.MAX_SAFE_INTEGER })
      .where(eq(youlinSubjects.id, actor.subjectId));
    await fixture.db
      .update(youlinIdentityGrants)
      .set({ authEpoch: Number.MAX_SAFE_INTEGER })
      .where(eq(youlinIdentityGrants.subjectId, actor.subjectId));
    const probe = new AuthorityProbe(fixture.db, {
      actor: { ...actor, authEpoch: Number.MAX_SAFE_INTEGER },
      enabled: true,
      enterpriseId: 'a',
      lockTimeoutMs: 1000,
      sqlTimeoutMs: 3000,
    });
    await expect(probe.inspect()).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
  });
});
