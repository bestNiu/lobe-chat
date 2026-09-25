import { createRealmConfiguration } from '../identity/realm.mjs';

/** Explicit local-test policy: manual enrollment, no email recovery or test-period MFA. */
export const createLocalIdentityRealm = ({ webSecret, controlSecret, port }) => {
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !/^[a-f0-9]{64}$/.test(controlSecret)
  )
    throw new Error('INVALID_LOCAL_REALM_CONFIGURATION');
  const realm = createRealmConfiguration({
    realm: 'youlin-local',
    webSecret,
    webRedirect: `http://127.0.0.1:${port}/api/auth/oauth2/callback/keycloak`,
    desktopRedirect: `http://127.0.0.1:${port}/unused-desktop`,
    testOnlyHttp: true,
  });
  realm.verifyEmail = false;
  realm.resetPasswordAllowed = false;
  realm.authenticatorConfig = [];
  realm.authenticationFlows = realm.authenticationFlows.filter(({ alias }) =>
    ['youlin-browser', 'youlin-authenticate', 'youlin-forms'].includes(alias),
  );
  realm.authenticationFlows[0].authenticationExecutions =
    realm.authenticationFlows[0].authenticationExecutions.filter(
      ({ flowAlias }) => flowAlias === 'youlin-authenticate',
    );
  realm.clients = realm.clients.filter(({ clientId }) => clientId === 'youlin-web');
  // Do NOT hand-pick defaultClientScopes here. Keycloak 26 emits the `sub` claim through the
  // `basic` scope's oidc-sub-mapper, and an imported client that names `basic` silently ends up
  // with only the scopes that already exist at import time (observed: email+profile, no sub),
  // which makes every access token fail `requiredClaims: ['sub']` at login. Keycloak's own
  // defaults keep `basic`, matching the realm fixture that the 14 protocol cases verify against.
  delete realm.clients[0].defaultClientScopes;
  delete realm.clients[0].optionalClientScopes;
  realm.clients.push(
    { clientId: 'account', enabled: false },
    { clientId: 'account-console', enabled: false },
    {
      clientId: 'youlin-identity-control',
      enabled: true,
      publicClient: false,
      clientAuthenticatorType: 'client-secret',
      secret: controlSecret,
      protocol: 'openid-connect',
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      redirectUris: [],
      webOrigins: [],
    },
  );
  // A realm-scoped service principal, not an employee or a platform administrator account.
  realm.users = [
    {
      username: 'service-account-youlin-identity-control',
      enabled: true,
      serviceAccountClientId: 'youlin-identity-control',
      clientRoles: {
        'realm-management': ['manage-users', 'view-users', 'query-users', 'view-clients'],
      },
    },
  ];
  const userProfile = {
    attributes: [
      { name: 'username', permissions: { view: ['admin', 'user'], edit: ['admin'] } },
      { name: 'email', permissions: { view: ['admin', 'user'], edit: ['admin'] } },
      { name: 'firstName', permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] } },
      { name: 'lastName', permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] } },
      { name: 'youlinSubjectId', permissions: { view: ['admin'], edit: ['admin'] } },
      { name: 'youlinProvisioningCommand', permissions: { view: ['admin'], edit: ['admin'] } },
    ],
  };
  realm.components = {
    'org.keycloak.userprofile.UserProfileProvider': [
      {
        name: 'declarative-user-profile',
        providerId: 'declarative-user-profile',
        config: { 'kc.user.profile.config': [JSON.stringify(userProfile)] },
      },
    ],
  };
  return realm;
};
