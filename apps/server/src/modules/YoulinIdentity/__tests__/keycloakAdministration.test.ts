import { describe, expect, it, vi } from 'vitest';

import {
  KeycloakAdministration,
  KeycloakAdministrationError,
  KeycloakOutcomeUnconfirmedError,
} from '../keycloakAdministration';

const principalId = '00000000-0000-4000-8000-000000000301';
const subjectId = '00000000-0000-4000-8000-000000000302';
const issuer = 'https://idp.example/realms/enterprise';
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { headers, status });
const token = () => json({ access_token: 'synthetic-admin-token' });
const createInput = {
  commandId: 'stable-command',
  email: 'PERSON@EXAMPLE.COM',
  employeeNumber: 'EMPLOYEE-01',
  initialPassword: 'ephemeral-password',
  subjectId,
};

const admin = (fetchClient: typeof fetch) =>
  new KeycloakAdministration({
    adminClientId: 'dedicated-client',
    adminClientSecret: 'dedicated-secret',
    fetch: fetchClient,
    issuer,
    realm: 'enterprise',
  });

describe('KeycloakAdministration', () => {
  it('creates only a disabled tagged user and never returns the password or token', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            location: `https://idp.example/admin/realms/enterprise/users/${principalId}`,
          },
          status: 201,
        }),
      );
    const result = await admin(fetchClient).createDisabledUser(createInput);
    expect(result).toEqual({ created: true, id: principalId });
    const request = fetchClient.mock.calls[1][1];
    expect(request?.redirect).toBe('error');
    expect(JSON.parse(String(request?.body))).toEqual({
      attributes: {
        youlinProvisioningCommand: ['stable-command'],
        youlinSubjectId: [subjectId],
      },
      credentials: [{ temporary: true, type: 'password', value: 'ephemeral-password' }],
      email: 'person@example.com',
      emailVerified: false,
      enabled: false,
      username: 'employee-01',
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('accepts a conflict replay only by both exact protected tags', async () => {
    const exact = {
      attributes: {
        youlinProvisioningCommand: ['stable-command'],
        youlinSubjectId: [subjectId],
      },
      id: principalId,
      username: 'employee-01',
      email: 'person@example.com',
    };
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json([exact]));
    await expect(admin(fetchClient).createDisabledUser(createInput)).resolves.toEqual({
      created: false,
      id: principalId,
    });
    expect(fetchClient).toHaveBeenCalledTimes(4);
  });

  it('never adopts a 409 candidate by email or username alone', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        json([{ email: 'person@example.com', id: principalId, username: 'employee-01' }]),
      );
    await expect(admin(fetchClient).createDisabledUser(createInput)).rejects.toBeInstanceOf(
      KeycloakOutcomeUnconfirmedError,
    );
  });

  it('supports exact get, state changes, logout and verified empty sessions', async () => {
    const fetchClient = vi.fn<typeof fetch>();
    for (const response of [
      json({ id: principalId, enabled: false }),
      new Response(null, { status: 204 }),
      json({ id: principalId, enabled: false }),
      new Response(null, { status: 204 }),
      json([]),
      json([{ id: subjectId }]),
      json([]),
      json({ id: principalId, enabled: false }),
    ]) {
      fetchClient.mockResolvedValueOnce(token()).mockResolvedValueOnce(response);
    }
    const client = admin(fetchClient);
    await expect(client.getUser(principalId)).resolves.toMatchObject({ enabled: false });
    await client.setEnabled(principalId, false);
    await client.cleanupSessions(principalId);
    const adminCalls = fetchClient.mock.calls.filter(([url]) =>
      String(url).includes('/admin/realms/'),
    );
    expect(adminCalls.map(([url]) => String(url))).toEqual([
      `https://idp.example/admin/realms/enterprise/users/${principalId}`,
      `https://idp.example/admin/realms/enterprise/users/${principalId}`,
      `https://idp.example/admin/realms/enterprise/users/${principalId}`,
      `https://idp.example/admin/realms/enterprise/users/${principalId}/logout`,
      `https://idp.example/admin/realms/enterprise/users/${principalId}/sessions`,
      'https://idp.example/admin/realms/enterprise/clients?first=0&max=33',
      `https://idp.example/admin/realms/enterprise/users/${principalId}/offline-sessions/${subjectId}`,
      `https://idp.example/admin/realms/enterprise/users/${principalId}`,
    ]);
  });

  it('refuses cleanup evidence while an offline grant remains', async () => {
    const fetchClient = vi.fn<typeof fetch>();
    for (const value of [
      json({ id: principalId, enabled: false }),
      new Response(null, { status: 204 }),
      json([]),
      json([{ id: subjectId }]),
      json([{ id: 'offline-session' }]),
    ])
      fetchClient.mockResolvedValueOnce(token()).mockResolvedValueOnce(value);
    await expect(admin(fetchClient).cleanupSessions(principalId)).rejects.toMatchObject({
      code: 'KEYCLOAK_OFFLINE_SESSIONS_REMAIN',
    });
  });

  it('refuses cleanup evidence for an enabled user', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ id: principalId, enabled: true }));
    await expect(admin(fetchClient).cleanupSessions(principalId)).rejects.toMatchObject({
      code: 'KEYCLOAK_USER_NOT_DISABLED',
    });
    expect(fetchClient).toHaveBeenCalledTimes(2);
  });

  it('fails closed on unsafe configuration and unknown network outcomes', async () => {
    expect(
      () =>
        new KeycloakAdministration({
          adminClientId: 'client',
          adminClientSecret: 'secret',
          fetch,
          issuer: 'http://idp.example/realms/enterprise',
          realm: 'enterprise',
        }),
    ).toThrowError(KeycloakAdministrationError);
    const fetchClient = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'));
    await expect(admin(fetchClient).getUser(principalId)).rejects.toBeInstanceOf(
      KeycloakOutcomeUnconfirmedError,
    );
    expect(fetchClient).toHaveBeenCalledTimes(1);
  });
});
