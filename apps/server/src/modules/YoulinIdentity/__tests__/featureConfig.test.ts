import { afterEach, describe, expect, it } from 'vitest';

import {
  getYoulinEnterpriseConfig,
  isYoulinEnterpriseSessionEnforcementEnabled,
} from '../featureConfig';

describe('Youlin enterprise feature configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is default-off and does not require enterprise configuration', () => {
    process.env = { ...originalEnv };
    delete process.env.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT;
    delete process.env.AUTH_KEYCLOAK_ISSUER;

    expect(isYoulinEnterpriseSessionEnforcementEnabled()).toBe(false);
    expect(getYoulinEnterpriseConfig()).toBeNull();
  });

  it.each(['', 'true', 'yes', '2'])('rejects ambiguous enforcement flag %s', (value) => {
    process.env = { ...originalEnv, YOULIN_ENTERPRISE_SESSION_ENFORCEMENT: value };

    expect(() => isYoulinEnterpriseSessionEnforcementEnabled()).toThrow(
      'INVALID_YOULIN_ENTERPRISE_SESSION_ENFORCEMENT',
    );
  });

  it('requires explicit loopback mode for HTTP app and issuer origins', () => {
    process.env = {
      ...originalEnv,
      APP_URL: 'http://127.0.0.1:3000',
      AUTH_KEYCLOAK_ID: 'client',
      AUTH_KEYCLOAK_ISSUER: 'http://127.0.0.1:8080/realms/enterprise',
      YOULIN_ENTERPRISE_ID: 'enterprise',
      YOULIN_ENTERPRISE_SESSION_ENFORCEMENT: '1',
      YOULIN_KEYCLOAK_AUDIENCE: 'api',
    };

    expect(() => getYoulinEnterpriseConfig()).toThrow('UNTRUSTED_YOULIN_ORIGIN');
    process.env.YOULIN_LOCAL_TEST_MODE = '1';
    expect(getYoulinEnterpriseConfig()).toMatchObject({ localTestMode: true });
  });

  it('rejects a non-strict manual enrollment flag', () => {
    process.env = {
      ...originalEnv,
      APP_URL: 'https://app.example.com',
      AUTH_KEYCLOAK_ID: 'client',
      AUTH_KEYCLOAK_ISSUER: 'https://id.example.com/realms/enterprise',
      YOULIN_ENTERPRISE_ID: 'enterprise',
      YOULIN_ENTERPRISE_SESSION_ENFORCEMENT: '1',
      YOULIN_KEYCLOAK_AUDIENCE: 'api',
      YOULIN_MANUAL_ENROLLMENT: 'true',
    };

    expect(() => getYoulinEnterpriseConfig()).toThrow('INVALID_YOULIN_MANUAL_ENROLLMENT');
  });
});
