// Reusable deployment configuration. No users, passwords or client secrets are committed.
export const createRealmConfiguration = ({
  realm,
  webSecret,
  webRedirect,
  desktopRedirect,
  testOnlyHttp = false,
}) => {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(realm) || !webSecret || webSecret.length < 32)
    throw new Error('Invalid realm configuration');
  for (const [kind, redirect] of [
    ['web', webRedirect],
    ['desktop', desktopRedirect],
  ]) {
    const url = new URL(redirect);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      redirect.includes('*') ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          url.hostname === '127.0.0.1' &&
          (kind === 'desktop' || testOnlyHttp)
        ))
    )
      throw new Error('Unsafe redirect URI');
  }
  const client = (clientId, publicClient, redirect) => ({
    clientId,
    enabled: true,
    publicClient,
    ...(publicClient ? {} : { secret: webSecret }),
    protocol: 'openid-connect',
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    implicitFlowEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [redirect],
    webOrigins: [],
    attributes: { 'pkce.code.challenge.method': 'S256' },
    protocolMappers: [
      {
        name: 'youlin-api-audience',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        consentRequired: false,
        config: {
          'included.client.audience': 'youlin-api',
          'access.token.claim': 'true',
          'id.token.claim': 'false',
        },
      },
    ],
  });
  return {
    realm,
    enabled: true,
    sslRequired: testOnlyHttp ? 'none' : 'all',
    registrationAllowed: false,
    registrationEmailAsUsername: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    editUsernameAllowed: false,
    resetPasswordAllowed: true,
    verifyEmail: true,
    rememberMe: false,
    bruteForceProtected: true,
    permanentLockout: false,
    failureFactor: 5,
    passwordPolicy:
      'length(12) and digits(1) and lowerCase(1) and upperCase(1) and notUsername(undefined)',
    accessTokenLifespan: 120,
    ssoSessionIdleTimeout: 900,
    ssoSessionMaxLifespan: 28_800,
    roles: { realm: [{ name: 'employee' }, { name: 'platform-admin' }] },
    clients: [
      client('youlin-web', false, webRedirect),
      client('youlin-desktop', true, desktopRedirect),
    ],
    browserFlow: 'youlin-browser',
    authenticatorConfig: [
      { alias: 'youlin-admin-role', config: { condUserRole: 'platform-admin', negate: 'false' } },
      {
        alias: 'youlin-non-admin-role',
        config: { condUserRole: 'platform-admin', negate: 'true' },
      },
    ],
    authenticationFlows: [
      {
        alias: 'youlin-browser',
        providerId: 'basic-flow',
        topLevel: true,
        builtIn: false,
        authenticationExecutions: [
          {
            flowAlias: 'youlin-authenticate',
            requirement: 'REQUIRED',
            priority: 10,
            authenticatorFlow: true,
          },
          {
            flowAlias: 'youlin-admin-mfa',
            requirement: 'CONDITIONAL',
            priority: 20,
            authenticatorFlow: true,
          },
          {
            flowAlias: 'youlin-employee-mfa',
            requirement: 'CONDITIONAL',
            priority: 30,
            authenticatorFlow: true,
          },
        ],
      },
      {
        alias: 'youlin-authenticate',
        providerId: 'basic-flow',
        topLevel: false,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: 'auth-cookie',
            requirement: 'ALTERNATIVE',
            priority: 10,
            authenticatorFlow: false,
          },
          {
            flowAlias: 'youlin-forms',
            requirement: 'ALTERNATIVE',
            priority: 20,
            authenticatorFlow: true,
          },
        ],
      },
      {
        alias: 'youlin-forms',
        providerId: 'basic-flow',
        topLevel: false,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: 'auth-username-password-form',
            requirement: 'REQUIRED',
            priority: 10,
            authenticatorFlow: false,
          },
        ],
      },
      {
        alias: 'youlin-employee-mfa',
        providerId: 'basic-flow',
        topLevel: false,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: 'conditional-user-role',
            authenticatorConfig: 'youlin-non-admin-role',
            requirement: 'REQUIRED',
            priority: 10,
            authenticatorFlow: false,
          },
          {
            authenticator: 'conditional-user-configured',
            requirement: 'REQUIRED',
            priority: 20,
            authenticatorFlow: false,
          },
          {
            authenticator: 'auth-otp-form',
            requirement: 'REQUIRED',
            priority: 30,
            authenticatorFlow: false,
          },
        ],
      },
      {
        alias: 'youlin-admin-mfa',
        providerId: 'basic-flow',
        topLevel: false,
        builtIn: false,
        authenticationExecutions: [
          {
            authenticator: 'conditional-user-role',
            authenticatorConfig: 'youlin-admin-role',
            requirement: 'REQUIRED',
            priority: 10,
            authenticatorFlow: false,
          },
          {
            authenticator: 'auth-otp-form',
            requirement: 'REQUIRED',
            priority: 20,
            authenticatorFlow: false,
          },
        ],
      },
    ],
  };
};
