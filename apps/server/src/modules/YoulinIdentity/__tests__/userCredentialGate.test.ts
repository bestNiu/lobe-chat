import type { YoulinUserAuthority } from '@lobechat/types';
import { errors } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyYoulinCredentialError,
  createYoulinUserCredentialGate,
} from '../userCredentialGate';

const now = Date.parse('2026-09-01T00:00:10Z');
const principal = {
  issuer: 'https://idp.synthetic',
  subject: 'principal-a',
  issuedAt: now / 1000 - 2,
  expiresAt: now / 1000 + 60,
};
const state = (): YoulinUserAuthority => ({
  enterpriseId: 'a',
  issuer: principal.issuer,
  externalSubject: principal.subject,
  subjectId: 'd9d97e33-621d-4f13-a50a-548c4161cb54',
  userId: 'user-a',
  authEpoch: 3,
  authorityVersion: 5,
  bindingId: '8b63efcb-8d6b-46b1-9768-ddc89f0a40cb',
  disabled: false,
  credentialsNotBefore: new Date(now - 3000),
});
const setup = (overrides = {}) => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const verifyAccessToken = vi.fn(async () => principal);
  const readAuthority = vi.fn(async () => state());
  const gate = createYoulinUserCredentialGate({
    enabled: true,
    enterpriseId: 'a',
    issuer: principal.issuer,
    maxClockSkewSeconds: 0,
    timeoutMs: 50,
    verifyAccessToken,
    readAuthority,
    ...overrides,
  });
  return { gate, verifyAccessToken, readAuthority };
};
afterEach(() => {
  vi.restoreAllMocks();
});

describe('verified user credential to current authority bridge (not session persistence)', () => {
  it('returns only a current context for subsequent authorization and rereads every time', async () => {
    const { gate, readAuthority } = setup();
    expect(await gate('synthetic')).toEqual({
      status: 'continue_authorization',
      context: {
        enterpriseId: 'a',
        bindingId: state().bindingId,
        externalSubject: principal.subject,
        issuer: principal.issuer,
        userId: 'user-a',
        subjectId: state().subjectId,
        authEpoch: 3,
      },
    });
    readAuthority.mockResolvedValueOnce({ ...state(), disabled: true });
    expect(await gate('synthetic')).toEqual({ status: 'deny', reason: 'DISABLED' });
    expect(readAuthority).toHaveBeenCalledTimes(2);
  });
  it('defaults off without calling the verifier or reader', async () => {
    const { gate, verifyAccessToken, readAuthority } = setup({ enabled: undefined });
    expect(await gate('synthetic')).toMatchObject({ reason: 'FEATURE_DISABLED' });
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(readAuthority).not.toHaveBeenCalled();
  });
  it('does not query identity after signature/claim verification fails or issuer mismatches', async () => {
    const { gate, verifyAccessToken, readAuthority } = setup();
    verifyAccessToken.mockRejectedValueOnce(
      new Error('synthetic private token must not be logged'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await gate('synthetic')).toMatchObject({ status: 'deny' });
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic private token');
    verifyAccessToken.mockResolvedValueOnce({ ...principal, issuer: 'https://other.synthetic' });
    expect(await gate('synthetic')).toMatchObject({ reason: 'INVALID_CREDENTIAL' });
    expect(readAuthority).not.toHaveBeenCalled();
  });
  it('rejects mismatched tenant/principal or existing-session identity', async () => {
    const { gate, readAuthority } = setup();
    readAuthority.mockResolvedValueOnce({ ...state(), enterpriseId: 'other' });
    expect(await gate('synthetic')).toMatchObject({ reason: 'IDENTITY_MISMATCH' });
    readAuthority.mockResolvedValueOnce({ ...state(), externalSubject: 'other' });
    expect(await gate('synthetic')).toMatchObject({ reason: 'IDENTITY_MISMATCH' });
    expect(
      await gate('synthetic', { userId: 'other', subjectId: state().subjectId, authEpoch: 3 }),
    ).toMatchObject({ reason: 'SESSION_STALE' });
    expect(
      await gate('synthetic', { userId: 'user-a', subjectId: state().subjectId, authEpoch: 2 }),
    ).toMatchObject({ reason: 'SESSION_STALE' });
  });
  it('rejects old credentials even when the JWT verifier accepts their signatures', async () => {
    const { gate, readAuthority } = setup();
    readAuthority.mockResolvedValueOnce({ ...state(), credentialsNotBefore: new Date(now - 1000) });
    expect(await gate('synthetic')).toMatchObject({ reason: 'CREDENTIAL_TOO_OLD' });
  });
  it('subtracts the possible issuer clock lead rather than weakening the barrier', async () => {
    const { gate } = setup({ maxClockSkewSeconds: 2 });
    expect(await gate('synthetic')).toMatchObject({ reason: 'CREDENTIAL_TOO_OLD' });
  });
  it('checks expiration after the authority read and rejects future issuance', async () => {
    const { gate, verifyAccessToken } = setup();
    verifyAccessToken.mockResolvedValueOnce({ ...principal, expiresAt: now / 1000 });
    expect(await gate('synthetic')).toMatchObject({ reason: 'INVALID_CREDENTIAL' });
    verifyAccessToken.mockResolvedValueOnce({ ...principal, issuedAt: now / 1000 + 1 });
    expect(await gate('synthetic')).toMatchObject({ reason: 'INVALID_CREDENTIAL' });
  });
  it('times out fail-closed, aborts the reader, and never logs raw errors', async () => {
    let signal: AbortSignal | undefined;
    const { gate } = setup({
      timeoutMs: 5,
      readAuthority: async (_sub: string, abort: AbortSignal) => {
        signal = abort;
        return new Promise<YoulinUserAuthority>(() => {});
      },
    });
    expect(await gate('synthetic')).toEqual({ status: 'deny', reason: 'STATE_UNAVAILABLE' });
    expect(signal?.aborted).toBe(true);
  });
  it('treats expected JWT failures as invalid credentials without authority-outage logging', async () => {
    const { gate, verifyAccessToken, readAuthority } = setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    verifyAccessToken.mockRejectedValueOnce(new errors.JWSSignatureVerificationFailed('synthetic'));
    expect(await gate('synthetic')).toEqual({ status: 'deny', reason: 'INVALID_CREDENTIAL' });
    expect(readAuthority).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('treats an unbound verified principal as identity mismatch rather than a database outage', async () => {
    const { gate } = setup({ readAuthority: async () => null });
    expect(await gate('synthetic')).toEqual({ status: 'deny', reason: 'IDENTITY_MISMATCH' });
  });

  it('rejects corrupt terminal authority versions', async () => {
    const { gate, readAuthority } = setup();
    readAuthority.mockResolvedValueOnce({ ...state(), authorityVersion: Number.MAX_SAFE_INTEGER });
    expect(await gate('synthetic')).toMatchObject({ status: 'deny' });
  });

  it('classifies failures for operators without echoing credentials or database values', () => {
    // Fixed codes stay readable, so one reproduction names the failing check.
    expect(
      classifyYoulinCredentialError(new errors.JWTClaimValidationFailed('synthetic', {}, 'aud')),
    ).toBe('ERR_JWT_CLAIM_VALIDATION_FAILED');
    expect(
      classifyYoulinCredentialError(
        Object.assign(new Error('ignored'), { name: 'YoulinIdentityError', code: 'READER_BUSY' }),
      ),
    ).toBe('READER_BUSY');
    // Anything else collapses to a class name: never a token, subject, claim value or SQL text.
    const leaky = new Error('authorization Bearer eyJhbGciOi sub=person-1 select * from users');
    expect(classifyYoulinCredentialError(leaky)).toBe('Error');
    expect(classifyYoulinCredentialError(leaky)).not.toContain('eyJhbGciOi');
    expect(classifyYoulinCredentialError(undefined)).toBe('UNKNOWN');
  });
});
