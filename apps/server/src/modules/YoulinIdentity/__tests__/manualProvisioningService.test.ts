import type { YoulinManualProviderWorkClaim } from '@lobechat/types';
import { describe, expect, it, vi } from 'vitest';

import {
  ManualProvisioningService,
  type ManualProvisioningState,
} from '../manualProvisioningService';

const subjectId = '00000000-0000-4000-8000-000000000401';
const principalId = '00000000-0000-4000-8000-000000000402';
const eventId = '00000000-0000-4000-8000-000000000403';
const issuer = 'https://idp.example/realms/enterprise';
const workId = '00000000-0000-4000-8000-000000000404';

const setup = () => {
  const calls: string[] = [];
  const enrollment = {
    activate: vi.fn(async () => {
      calls.push('activate');
      return { authEpoch: 0, status: 'activated', subjectId };
    }),
    disable: vi.fn(async () => {
      calls.push('deny');
      return { authEpoch: 1, revocationEventId: eventId, status: 'revoked', subjectId };
    }),
    reserve: vi.fn(async () => {
      calls.push('reserve');
      return { revocationEventId: eventId, status: 'created', subjectId };
    }),
  };
  const idp = {
    getUser: vi.fn(async () => ({ id: principalId, enabled: true })),
    cleanupSessions: vi.fn(async () => {
      calls.push('provider-cleanup');
    }),
    createDisabledUser: vi.fn(async () => {
      calls.push('provider-create-disabled');
      return { created: true, id: principalId };
    }),
    setEnabled: vi.fn(async (_id: string, enabled: boolean) => {
      calls.push(enabled ? 'provider-enable' : 'provider-disable');
    }),
  };
  const cleanup = {
    recordCompletion: vi.fn(async () => {
      calls.push('record-cleanup');
      return { authEpoch: 0, status: 'cleanup_recorded', subjectId };
    }),
  };
  const link = {
    link: vi.fn(async () => {
      calls.push('link');
      return { bindingId: 'binding', status: 'linked', subjectId };
    }),
  };
  const work = {
    begin: vi.fn<(key: string, intent: unknown) => Promise<YoulinManualProviderWorkClaim>>(
      async () => ({ kind: 'claimed', workId }),
    ),
    complete: vi.fn(async () => undefined),
  };
  const readState = vi.fn(async (): Promise<ManualProvisioningState> => ({
    activeBindingCount: 1,
    authEpoch: 0,
    authorityVersion: 1,
    externalSubject: principalId,
    idpRevocationConfirmedEpoch: 0,
    issuer,
    nativeAccountMatches: true,
    status: 'active' as const,
    subjectId,
  }));
  return {
    calls,
    cleanup,
    enrollment,
    idp,
    link,
    readState,
    work,
    service: new ManualProvisioningService({
      cleanup,
      enrollment,
      idp,
      issuer,
      link,
      readState,
      work,
    }),
  };
};

const request = {
  displayName: 'Person',
  email: 'PERSON@EXAMPLE.COM',
  employeeNumber: 'EMPLOYEE-01',
  idempotencyKey: 'stable-key',
  initialPassword: 'ephemeral-password',
};

describe('ManualProvisioningService', () => {
  it('claims work first and rejects a competing claim without external side effects', async () => {
    const test = setup();
    test.work.begin.mockResolvedValueOnce({ kind: 'completed', principalId, subjectId });
    expect(await test.service.provision(request)).toMatchObject({
      status: 'activated',
      credentialStatus: 'existing_principal_password_unchanged',
    });
    expect(test.enrollment.reserve).not.toHaveBeenCalled();
    expect(test.idp.createDisabledUser).not.toHaveBeenCalled();
    expect(test.idp.cleanupSessions).not.toHaveBeenCalled();
    expect(test.enrollment.activate).not.toHaveBeenCalled();
  });

  it('compensates if a revocation wins while provider enable is in flight', async () => {
    const test = setup();
    test.readState.mockImplementation(async () => ({
      activeBindingCount: 1,
      authEpoch: test.calls.includes('provider-enable') ? 1 : 0,
      authorityVersion: test.calls.includes('provider-enable') ? 2 : 1,
      externalSubject: principalId,
      idpRevocationConfirmedEpoch: 0,
      issuer,
      nativeAccountMatches: true,
      status: test.calls.includes('provider-enable') ? 'disabled' : 'active',
      subjectId,
    }));
    await expect(test.service.provision(request)).rejects.toMatchObject({
      code: 'ACTIVATION_STATE_UNCONFIRMED',
    });
    expect(test.idp.setEnabled.mock.calls).toEqual([
      [principalId, true],
      [principalId, false],
    ]);
  });

  it('does not disable the provider when deny compensation is unconfirmed', async () => {
    const test = setup();
    test.enrollment.disable.mockRejectedValueOnce(new Error('stale compensation fence'));
    test.readState.mockImplementation(async () => ({
      activeBindingCount: 1,
      authEpoch: test.calls.includes('provider-enable') ? 1 : 0,
      authorityVersion: test.calls.includes('provider-enable') ? 2 : 1,
      externalSubject: principalId,
      idpRevocationConfirmedEpoch: 0,
      issuer,
      nativeAccountMatches: true,
      status: test.calls.includes('provider-enable') ? 'disabled' : 'active',
      subjectId,
    }));
    await expect(test.service.provision(request)).rejects.toMatchObject({
      code: 'DENY_COMPENSATION_UNCONFIRMED',
    });
    expect(test.idp.setEnabled.mock.calls).toEqual([
      [principalId, true],
      [principalId, false],
    ]);
  });

  it('returns completed replay without logout, attestation, activation or provider mutation', async () => {
    const test = setup();
    test.work.begin.mockResolvedValueOnce({ kind: 'completed', principalId, subjectId });
    expect(await test.service.provision(request)).toMatchObject({
      status: 'activated',
      credentialStatus: 'existing_principal_password_unchanged',
    });
    expect(test.idp.cleanupSessions).not.toHaveBeenCalled();
    expect(test.cleanup.recordCompletion).not.toHaveBeenCalled();
    expect(test.enrollment.activate).not.toHaveBeenCalled();
    expect(test.idp.setEnabled).not.toHaveBeenCalled();
  });

  it('does not mutate a completed principal when its status probe fails', async () => {
    const test = setup();
    test.work.begin.mockResolvedValueOnce({ kind: 'completed', principalId, subjectId });
    test.idp.getUser.mockRejectedValueOnce(new Error('synthetic unavailable'));
    await expect(test.service.provision(request)).rejects.toThrow();
    expect(test.idp.setEnabled).not.toHaveBeenCalled();
    expect(test.enrollment.disable).not.toHaveBeenCalled();
  });

  it('orders cleanup evidence before activation and returns no secret', async () => {
    const fixture = setup();
    const result = await fixture.service.provision(request);
    expect(fixture.calls).toEqual([
      'reserve',
      'provider-create-disabled',
      'link',
      'provider-cleanup',
      'record-cleanup',
      'activate',
      'provider-enable',
    ]);
    expect(fixture.work.complete).toHaveBeenCalledWith('stable-key', {
      principalId,
      subjectId,
      workId,
    });
    expect(result).toMatchObject({
      credentialStatus: 'created_with_initial_password',
      principalId,
    });
    expect(JSON.stringify(result)).not.toContain(request.initialPassword);
    expect(fixture.enrollment.reserve).toHaveBeenCalledWith('stable-key:reserve', {
      displayName: 'Person',
      email: 'person@example.com',
      employeeNumber: 'EMPLOYEE-01',
    });
  });

  it('does not attest, activate, or enable when external cleanup fails', async () => {
    const fixture = setup();
    fixture.idp.cleanupSessions.mockRejectedValueOnce(new Error('unconfirmed'));
    await expect(fixture.service.provision(request)).rejects.toThrow('unconfirmed');
    expect(fixture.cleanup.recordCompletion).not.toHaveBeenCalled();
    expect(fixture.enrollment.activate).not.toHaveBeenCalled();
    expect(fixture.calls.at(-1)).toBe('provider-disable');
  });

  it('denies the domain before disabling the provider when enable fails', async () => {
    const fixture = setup();
    fixture.idp.setEnabled.mockImplementation(async (_id, enabled) => {
      fixture.calls.push(enabled ? 'provider-enable' : 'provider-disable');
      if (enabled) throw new Error('enable unknown');
    });
    await expect(fixture.service.provision(request)).rejects.toThrow('enable unknown');
    expect(fixture.calls.slice(-3)).toEqual(['provider-enable', 'deny', 'provider-disable']);
  });

  it('persists disable before provider disable and logout verification', async () => {
    const fixture = setup();
    fixture.readState.mockResolvedValueOnce({
      activeBindingCount: 1,
      authEpoch: 1,
      authorityVersion: 2,
      externalSubject: principalId,
      idpRevocationConfirmedEpoch: null,
      issuer,
      nativeAccountMatches: true,
      status: 'disabled',
      subjectId,
    });
    await fixture.service.disable({
      expectedAuthEpoch: 0,
      expectedAuthorityVersion: 1,
      idempotencyKey: 'disable-key',
      subjectId,
    });
    expect(fixture.calls).toEqual([
      'deny',
      'provider-disable',
      'provider-cleanup',
      'record-cleanup',
    ]);
    expect(fixture.cleanup.recordCompletion).toHaveBeenCalledWith('disable-key:disable-cleanup', {
      expectedAuthEpoch: 1,
      revocationEventId: eventId,
    });
  });

  it('does not attest disable cleanup for an epoch that was not denied', async () => {
    const fixture = setup();
    fixture.readState.mockResolvedValueOnce({
      activeBindingCount: 1,
      authEpoch: 9,
      authorityVersion: 2,
      externalSubject: principalId,
      idpRevocationConfirmedEpoch: null,
      issuer,
      nativeAccountMatches: true,
      status: 'disabled',
      subjectId,
    });
    await expect(
      fixture.service.disable({
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 1,
        idempotencyKey: 'disable-key',
        subjectId,
      }),
    ).rejects.toMatchObject({ code: 'DENIED_STATE_UNCONFIRMED' });
    expect(fixture.cleanup.recordCompletion).not.toHaveBeenCalled();
  });
});
