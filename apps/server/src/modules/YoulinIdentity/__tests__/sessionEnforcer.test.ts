import type { YoulinSessionProof, YoulinUserAuthority } from '@lobechat/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createYoulinSessionEnforcer } from '../sessionEnforcer';

const proof = (): YoulinSessionProof => ({
  authEpoch: 3,
  bindingId: '8b63efcb-8d6b-46b1-9768-ddc89f0a40cb',
  enterpriseId: 'a',
  externalSubject: 'principal-a',
  issuer: 'https://idp.synthetic',
  sessionId: 'session-a',
  subjectId: 'd9d97e33-621d-4f13-a50a-548c4161cb54',
  userId: 'user-a',
});
const authority = (): YoulinUserAuthority => ({
  ...proof(),
  authorityVersion: 5,
  credentialsNotBefore: new Date('2026-09-01T00:00:00Z'),
  disabled: false,
});
const setup = (overrides = {}) => {
  const readProof = vi.fn(async () => proof());
  const readAuthority = vi.fn(async () => authority());
  const enforce = createYoulinSessionEnforcer({
    enabled: true,
    enterpriseId: 'a',
    issuer: 'https://idp.synthetic',
    readAuthority,
    readProof,
    timeoutMs: 50,
    ...overrides,
  });
  return { enforce, readAuthority, readProof };
};

afterEach(() => vi.restoreAllMocks());

describe('enterprise native-session current-state enforcement', () => {
  it('defaults off without reading proof or authority', async () => {
    const readProof = vi.fn();
    const readAuthority = vi.fn();
    const enforce = createYoulinSessionEnforcer({
      enabled: undefined,
      readAuthority,
      readProof,
      timeoutMs: 1,
    });
    expect(await enforce({ id: 'ignored', userId: 'ignored' })).toEqual({
      status: 'not_enforced',
    });
    expect(readProof).not.toHaveBeenCalled();
    expect(readAuthority).not.toHaveBeenCalled();
  });

  it('allows authentication continuation but does not grant a resource permission', async () => {
    const { enforce } = setup();
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toEqual({
      context: {
        authEpoch: 3,
        enterpriseId: 'a',
        subjectId: proof().subjectId,
        userId: 'user-a',
      },
      status: 'continue_authentication',
    });
  });

  it('rejects missing proof before reading authority', async () => {
    const { enforce, readAuthority } = setup({ readProof: async () => null });
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toEqual({
      reason: 'SESSION_PROOF_MISSING',
      status: 'deny',
    });
    expect(readAuthority).not.toHaveBeenCalled();
  });

  it.each([
    ['authEpoch', 4],
    ['bindingId', 'a409417c-b054-4c36-ab6d-126c32f12486'],
    ['subjectId', 'ecbc1713-08f1-4182-ad90-0a7ebee5ce11'],
    ['userId', 'other-user'],
    ['externalSubject', 'other-principal'],
  ] as const)('rejects stale authority when %s changes', async (field, value) => {
    const { enforce } = setup({
      readAuthority: async () => ({ ...authority(), [field]: value }),
    });
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toMatchObject({
      reason: 'SESSION_STALE',
      status: 'deny',
    });
  });

  it('rejects disabled authority and rereads current state on every request', async () => {
    const { enforce, readAuthority } = setup();
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toMatchObject({
      status: 'continue_authentication',
    });
    readAuthority.mockResolvedValueOnce({ ...authority(), disabled: true });
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toEqual({
      reason: 'DISABLED',
      status: 'deny',
    });
    expect(readAuthority).toHaveBeenCalledTimes(2);
  });

  it('times out fail-closed and aborts outstanding state reads', async () => {
    let signal: AbortSignal | undefined;
    const { enforce } = setup({
      readProof: async (_sessionId: string, _userId: string, abort: AbortSignal) => {
        signal = abort;
        return new Promise<YoulinSessionProof>(() => {});
      },
      timeoutMs: 5,
    });
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toEqual({
      reason: 'STATE_UNAVAILABLE',
      status: 'deny',
    });
    expect(signal?.aborted).toBe(true);
  });

  it('maps dependency and corrupt-state faults to a fixed denial', async () => {
    const { enforce } = setup({
      readProof: async () => {
        throw new Error('private');
      },
    });
    expect(await enforce({ id: 'session-a', userId: 'user-a' })).toEqual({
      reason: 'STATE_UNAVAILABLE',
      status: 'deny',
    });
  });
});
