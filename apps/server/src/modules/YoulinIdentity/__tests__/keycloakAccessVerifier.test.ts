import { describe, expect, it } from 'vitest';

import { createKeycloakAccessVerifier } from '../keycloakAccessVerifier';

const options = {
  audience: 'youlin-api',
  authorizedParties: ['youlin-web'],
  enabled: true,
  issuer: 'https://identity.example.invalid/realms/youlin',
};

describe('Keycloak access verifier configuration', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(() => createKeycloakAccessVerifier({ ...options, enabled: undefined })).toThrow(
      'IDENTITY_VERIFIER_DISABLED',
    );
  });
  it.each([
    'http://identity.example.invalid/realms/youlin',
    'https://name:password@identity.example.invalid/realms/youlin',
    'https://identity.example.invalid/realms/youlin?override=1',
    'https://identity.example.invalid/realms/youlin#fragment',
    'https://identity.example.invalid/realms/youlin/',
  ])('rejects unsafe or ambiguous issuer configuration: %s', (issuer) => {
    expect(() => createKeycloakAccessVerifier({ ...options, issuer })).toThrow(
      'UNTRUSTED_IDENTITY_ISSUER',
    );
  });
  it('does not let the test exception authorize arbitrary cleartext hosts', () => {
    expect(() =>
      createKeycloakAccessVerifier({
        ...options,
        issuer: 'http://other-host/realms/youlin',
        testOnlyLoopbackHttp: true,
      }),
    ).toThrow('UNTRUSTED_IDENTITY_ISSUER');
  });
  it('requires a target audience and authorized clients', () => {
    expect(() => createKeycloakAccessVerifier({ ...options, authorizedParties: [] })).toThrow(
      'INVALID_IDENTITY_CONFIGURATION',
    );
    expect(() => createKeycloakAccessVerifier({ ...options, audience: '' })).toThrow(
      'INVALID_IDENTITY_CONFIGURATION',
    );
  });
  it('rejects empty and oversized tokens before discovery IO', async () => {
    const verify = createKeycloakAccessVerifier(options);
    await expect(verify('')).rejects.toThrow('INVALID_ACCESS_TOKEN');
    await expect(verify('x'.repeat(16_385))).rejects.toThrow('INVALID_ACCESS_TOKEN');
  });
});
