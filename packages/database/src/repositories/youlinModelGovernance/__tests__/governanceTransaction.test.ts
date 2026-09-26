import { describe, expect, it, vi } from 'vitest';

import { YoulinModelGovernanceTransaction } from '../governanceTransaction';

const ACTOR = {
  authEpoch: 0,
  subjectId: '20000000-0000-4000-8000-000000000001',
};
const makeDb = () => {
  const db = { transaction: vi.fn(async () => ({ ok: true })) };
  return { db: db as never, spy: db.transaction };
};
const make = (db = makeDb().db) =>
  new YoulinModelGovernanceTransaction(db, {
    actor: ACTOR,
    enabled: true,
    enterpriseId: 'youlin-local',
  });

describe('YoulinModelGovernanceTransaction construction', () => {
  it('stays off unless explicitly enabled and rejects a borrowed transaction', () => {
    expect(
      () =>
        new YoulinModelGovernanceTransaction(makeDb().db, {
          actor: ACTOR,
          enterpriseId: 'youlin-local',
        }),
    ).toThrow('FEATURE_DISABLED');
    expect(
      () =>
        new YoulinModelGovernanceTransaction(makeDb().db, {
          actor: ACTOR,
          enabled: true,
          enterpriseId: 'youlin-local',
          lockTimeoutMs: 9000,
          sqlTimeoutMs: 5000,
        }),
    ).toThrow('INVALID_TIMEOUT_CONFIGURATION');
  });
});

describe('input validation happens before any database work', () => {
  it('refuses malformed grant input without opening a transaction', async () => {
    const { db, spy } = makeDb();
    const tx = make(db);
    for (const input of [
      { enabled: true, model: '', targetUserId: 'u' },
      { enabled: true, model: 'm', targetUserId: '' },
      { enabled: true, model: 'm', monthlyTokenLimit: -1, targetUserId: 'u' },
      { enabled: true, model: 'm', monthlyTokenLimit: 1.5, targetUserId: 'u' },
      { enabled: 'yes', model: 'm', targetUserId: 'u' },
      { enabled: true, model: 'm', provider: '', targetUserId: 'u' },
    ])
      expect(() => tx.upsertGrant(input as never)).toThrow('INVALID_GRANT_INPUT');
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses malformed quota and target input without opening a transaction', async () => {
    const { db, spy } = makeDb();
    const tx = make(db);
    expect(() => tx.setUserQuota({ monthlyTotalTokenLimit: -5, targetUserId: 'u' })).toThrow(
      'INVALID_QUOTA_INPUT',
    );
    expect(() => tx.setUserQuota({ targetUserId: '' })).toThrow('INVALID_QUOTA_INPUT');
    expect(() => tx.listAccess('')).toThrow('INVALID_TARGET_USER');
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts a null cap as uncapped and routes valid input through the control plane', async () => {
    const { db, spy } = makeDb();
    const tx = make(db);
    await tx.setUserQuota({ monthlyTotalTokenLimit: null, targetUserId: 'user-1' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
