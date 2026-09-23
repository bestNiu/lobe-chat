import { randomBytes } from 'node:crypto';

import { createRealmConfiguration } from './realm.mjs';

export const createIdentityFixture = (runId) => {
  const realm = `youlin-${runId}`;
  const password = `Aa1!${randomBytes(24).toString('hex')}`;
  const webSecret = randomBytes(32).toString('hex');
  const config = createRealmConfiguration({
    realm,
    webSecret,
    webRedirect: 'http://127.0.0.1:3210/callback',
    desktopRedirect: 'http://127.0.0.1:3211/callback',
    testOnlyHttp: true,
  });
  config.attributes = { youlinSyntheticRun: runId };
  config.users = [
    {
      username: 'YY2026001',
      email: 'employee@example.invalid',
      firstName: 'Synthetic',
      lastName: 'Employee',
      enabled: true,
      emailVerified: true,
      realmRoles: ['employee'],
      credentials: [{ type: 'password', value: password, temporary: false }],
    },
    // Public RFC 6238 test vector, synthetic-only; never an enterprise credential.
    {
      username: 'YY2026003',
      email: 'otp@example.invalid',
      firstName: 'Synthetic',
      lastName: 'OTP',
      enabled: true,
      emailVerified: true,
      realmRoles: ['employee'],
      credentials: [
        { type: 'password', value: password, temporary: false },
        {
          type: 'otp',
          secretData: JSON.stringify({ value: '12345678901234567890' }),
          credentialData: JSON.stringify({
            subType: 'totp',
            digits: 6,
            counter: 0,
            period: 30,
            algorithm: 'HmacSHA1',
          }),
        },
      ],
    },
    {
      username: 'YY2026002',
      email: 'admin@example.invalid',
      firstName: 'Synthetic',
      lastName: 'Admin',
      enabled: true,
      emailVerified: true,
      realmRoles: ['platform-admin'],
      credentials: [{ type: 'password', value: password, temporary: false }],
      requiredActions: ['CONFIGURE_TOTP'],
    },
  ];
  return { config, password, realm, webSecret };
};
