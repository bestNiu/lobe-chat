import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YoulinIdentityError } from '@/database/repositories/youlinIdentity/contracts';

import { createYoulinAdminHandler } from '../adminHttp';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  enforce: vi.fn(),
  factory: vi.fn(),
  provision: vi.fn(),
  disable: vi.fn(),
}));
vi.mock('../featureConfig', () => ({ getYoulinEnterpriseConfig: mocks.config }));
vi.mock('../httpSessionEnforcement', () => ({ enforceYoulinEnterpriseHttpSession: mocks.enforce }));
vi.mock('../manualProvisioningFactory', () => ({ createManualProvisioningService: mocks.factory }));
const actor = { authEpoch: 4, subjectId: '00000000-0000-4000-8000-000000000912' };
const input = {
  action: 'create',
  email: 'person@example.invalid',
  employeeNumber: 'TEST-1',
  idempotencyKey: 'test-command',
  initialPassword: 'Synthetic1!Password',
};
const request = (body: unknown = input, origin = 'http://127.0.0.1:33210') =>
  new Request('http://127.0.0.1:33210/webapi/youlin/admin/users', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const native = vi.fn(async () => ({ session: { id: 'native' }, user: { id: 'user-a' } }));
const handler = createYoulinAdminHandler(native);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    manualEnrollment: true,
    localTestMode: true,
    appOrigin: 'http://127.0.0.1:33210',
  });
  mocks.enforce.mockResolvedValue({ status: 'continue_authentication', context: actor });
  mocks.provision.mockResolvedValue({ status: 'activated', subjectId: 'new-subject' });
  mocks.factory.mockReturnValue({ provision: mocks.provision, disable: mocks.disable });
});

describe('local administrator HTTP boundary', () => {
  it('is unavailable by default and rejects foreign origins before session lookup', async () => {
    mocks.config.mockReturnValueOnce(null);
    expect((await handler(request())).status).toBe(404);
    expect((await handler(request(input, 'https://foreign.example'))).status).toBe(403);
    expect(native).not.toHaveBeenCalled();
  });
  it('rejects stale native sessions before constructing a service', async () => {
    mocks.enforce.mockResolvedValueOnce({ status: 'deny', reason: 'SESSION_STALE' });
    expect((await handler(request())).status).toBe(401);
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it('uses the verified captured actor, and returns no initial credential', async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(mocks.factory).toHaveBeenCalledWith(actor);
    expect(await response.text()).not.toContain(input.initialPassword);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects client-supplied actor or cleanup evidence', async () => {
    expect((await handler(request({ ...input, actor }))).status).toBe(400);
    expect((await handler(request({ ...input, idpRevocationConfirmedEpoch: 4 }))).status).toBe(400);
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it('enforces actual byte size regardless of Content-Length', async () => {
    expect((await handler(request({ ...input, displayName: 'a'.repeat(9000) }))).status).toBe(413);
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it('does not turn an ordinary authenticated user into an administrator', async () => {
    mocks.provision.mockRejectedValueOnce(new YoulinIdentityError('ACTOR_NOT_AUTHORIZED'));
    expect((await handler(request())).status).toBe(403);
  });
  it('masks provider and database errors rather than reflecting secret-bearing diagnostics', async () => {
    mocks.provision.mockRejectedValueOnce(new Error('synthetic-sensitive-error'));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic-sensitive-error');
  });
});
