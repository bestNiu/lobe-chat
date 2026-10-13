import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminRequestError } from './youlinAdmin';
import { youlinAdminService } from './youlinAdmin';

afterEach(() => vi.unstubAllGlobals());

describe('operator model access requests', () => {
  it('pages enrolled users without accepting a body-supplied actor and preserves disable versions', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => Response.json({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetcher);
    await youlinAdminService.listUsers({ userId: 'target-1' });
    expect(fetcher.mock.calls[0]?.[0]).toContain('userId=target-1');
    await youlinAdminService.disableUser({
      expectedAuthEpoch: 3,
      expectedAuthorityVersion: 5,
      idempotencyKey: 'retry-key',
      subjectId: 'synthetic-subject',
    });
    const [, options] = fetcher.mock.lastCall as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      action: 'disable',
      expectedAuthEpoch: 3,
      expectedAuthorityVersion: 5,
      idempotencyKey: 'retry-key',
      subjectId: 'synthetic-subject',
    });
  });

  it('uses the authenticated session for self lookup and never puts an actor in mutation bodies', async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      Response.json({
        userId: 'session-user',
        grants: [],
        quota: null,
        usage: { periodId: '2026-09', totalTokens: 0 },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect((await youlinAdminService.getAccess()).userId).toBe('session-user');
    expect(fetcher).toHaveBeenCalledWith('/webapi/youlin/admin/model-access', {
      credentials: 'same-origin',
    });
    await youlinAdminService.setGrant({
      enabled: false,
      model: 'model-1',
      monthlyTokenLimit: null,
      provider: 'existing-provider',
      userId: 'target-1',
    });
    const [, options] = fetcher.mock.lastCall as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      grant: {
        enabled: false,
        model: 'model-1',
        monthlyTokenLimit: null,
        provider: 'existing-provider',
      },
      userId: 'target-1',
    });
  });

  it('preserves denial instead of treating a failed access check as an empty grant list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'NOT_AUTHORIZED' }, { status: 403 })),
    );
    await expect(youlinAdminService.getAccess()).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
      status: 403,
    } satisfies Partial<AdminRequestError>);
  });
});
