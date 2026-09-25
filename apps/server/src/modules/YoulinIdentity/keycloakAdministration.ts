import { z } from 'zod';

const uuid = z.uuid();
const realmName = z.string().regex(/^[\w.-]{1,128}$/);
const userRepresentation = z
  .object({
    attributes: z.record(z.string(), z.array(z.string())).optional(),
    email: z.email().optional(),
    enabled: z.boolean().optional(),
    id: z.uuid(),
    username: z.string().min(1).optional(),
  })
  .passthrough();

export interface KeycloakAdministrationOptions {
  /** Dedicated client credentials from YOULIN_IDP_ADMIN_CLIENT_ID/SECRET. */
  adminClientId: string;
  adminClientSecret: string;
  fetch: typeof fetch;
  issuer: string;
  realm: string;
  requestTimeoutMs?: number;
  /** False only for an owner-supplied password in the private offline bootstrap. */
  temporaryInitialPassword?: boolean;
  testOnlyLoopbackHttp?: boolean;
}

export interface CreateKeycloakUserInput {
  commandId: string;
  email: string;
  employeeNumber: string;
  initialPassword: string;
  subjectId: string;
}

export class KeycloakAdministrationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'KeycloakAdministrationError';
  }
}

export class KeycloakOutcomeUnconfirmedError extends KeycloakAdministrationError {
  constructor() {
    super('KEYCLOAK_OUTCOME_UNCONFIRMED');
  }
}

const parseIssuer = (issuer: string, realm: string, allowLoopback: boolean) => {
  const url = new URL(issuer);
  const expectedPath = `/realms/${encodeURIComponent(realm)}`;
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== expectedPath ||
    issuer.endsWith('/') ||
    (url.protocol !== 'https:' &&
      !(allowLoopback && url.protocol === 'http:' && url.hostname === '127.0.0.1'))
  )
    throw new KeycloakAdministrationError('UNTRUSTED_IDENTITY_ISSUER');
  return url;
};

/** Minimal Keycloak admin adapter. It never logs or returns tokens, passwords, or raw responses. */
export class KeycloakAdministration {
  private readonly adminBase: URL;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchClient: typeof fetch;
  readonly issuer: string;
  private readonly realm: string;
  private readonly timeoutMs: number;
  private readonly tokenUrl: URL;
  private readonly temporaryInitialPassword: boolean;

  constructor(options: KeycloakAdministrationOptions) {
    this.realm = realmName.parse(options.realm);
    this.temporaryInitialPassword = options.temporaryInitialPassword !== false;
    if (!options.adminClientId || !options.adminClientSecret)
      throw new KeycloakAdministrationError('ADMIN_CLIENT_CREDENTIALS_REQUIRED');
    const issuer = parseIssuer(options.issuer, this.realm, options.testOnlyLoopbackHttp === true);
    this.issuer = issuer.href;
    this.clientId = options.adminClientId;
    this.clientSecret = options.adminClientSecret;
    this.fetchClient = options.fetch;
    this.timeoutMs = z
      .number()
      .int()
      .min(100)
      .max(10_000)
      .parse(options.requestTimeoutMs ?? 2000);
    this.tokenUrl = new URL(`${issuer.href}/protocol/openid-connect/token`);
    this.adminBase = new URL(`/admin/realms/${encodeURIComponent(this.realm)}/`, issuer.origin);
  }

  private async request(path: string, init: RequestInit = {}) {
    let tokenResponse: Response;
    try {
      tokenResponse = await this.fetchClient(this.tokenUrl, {
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new KeycloakOutcomeUnconfirmedError();
    }
    if (!tokenResponse.ok) throw new KeycloakAdministrationError('KEYCLOAK_ADMIN_AUTH_FAILED');
    const token = z
      .object({ access_token: z.string().min(1).max(16_384) })
      .safeParse(await this.readJson(tokenResponse));
    if (!token.success) throw new KeycloakAdministrationError('INVALID_KEYCLOAK_RESPONSE');
    try {
      return await this.fetchClient(new URL(path, this.adminBase), {
        ...init,
        headers: {
          'authorization': `Bearer ${token.data.access_token}`,
          'content-type': 'application/json',
          ...init.headers,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new KeycloakOutcomeUnconfirmedError();
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > 262_144) throw new KeycloakAdministrationError('INVALID_KEYCLOAK_RESPONSE');
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new KeycloakOutcomeUnconfirmedError();
    }
    if (text.length > 262_144) throw new KeycloakAdministrationError('INVALID_KEYCLOAK_RESPONSE');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new KeycloakAdministrationError('INVALID_KEYCLOAK_RESPONSE');
    }
  }

  async createDisabledUser(input: CreateKeycloakUserInput) {
    const parsed = z
      .object({
        commandId: z.string().min(1).max(128),
        email: z
          .email()
          .max(320)
          .transform((value) => value.toLowerCase()),
        employeeNumber: z.string().regex(/^[A-Z0-9][A-Z0-9._:-]{0,127}$/),
        initialPassword: z.string().min(12).max(1024),
        subjectId: z.uuid(),
      })
      .strict()
      .parse(input);
    const response = await this.request('users', {
      body: JSON.stringify({
        attributes: {
          youlinProvisioningCommand: [parsed.commandId],
          youlinSubjectId: [parsed.subjectId],
        },
        credentials: [
          {
            temporary: this.temporaryInitialPassword,
            type: 'password',
            value: parsed.initialPassword,
          },
        ],
        email: parsed.email,
        emailVerified: false,
        enabled: false,
        username: parsed.employeeNumber.toLowerCase(),
      }),
      method: 'POST',
    });
    if (response.status === 201) {
      const location = response.headers.get('location');
      if (!location) throw new KeycloakOutcomeUnconfirmedError();
      let locationUrl: URL;
      try {
        locationUrl = new URL(location, this.adminBase);
      } catch {
        throw new KeycloakOutcomeUnconfirmedError();
      }
      const prefix = `${this.adminBase.href}users/`;
      if (locationUrl.origin !== this.adminBase.origin || !locationUrl.href.startsWith(prefix))
        throw new KeycloakOutcomeUnconfirmedError();
      const id = locationUrl.href.slice(prefix.length);
      const parsedId = uuid.safeParse(id);
      if (id.includes('/') || !parsedId.success) throw new KeycloakOutcomeUnconfirmedError();
      return { created: true as const, id: parsedId.data };
    }
    if (response.status >= 500) throw new KeycloakOutcomeUnconfirmedError();
    if (response.status !== 409) throw new KeycloakAdministrationError('KEYCLOAK_CREATE_FAILED');

    const query = new URLSearchParams({
      username: parsed.employeeNumber.toLowerCase(),
      exact: 'true',
    });
    const lookup = await this.request(`users?${query}`);
    if (!lookup.ok) throw new KeycloakAdministrationError('KEYCLOAK_LOOKUP_FAILED');
    const candidates = z.array(userRepresentation).parse(await this.readJson(lookup));
    const exact = candidates.filter(
      (candidate) =>
        candidate.attributes?.youlinProvisioningCommand?.length === 1 &&
        candidate.attributes.youlinProvisioningCommand[0] === parsed.commandId &&
        candidate.attributes?.youlinSubjectId?.length === 1 &&
        candidate.attributes.youlinSubjectId[0] === parsed.subjectId &&
        candidate.username === parsed.employeeNumber.toLowerCase() &&
        candidate.email?.toLowerCase() === parsed.email,
    );
    if (exact.length !== 1) throw new KeycloakOutcomeUnconfirmedError();
    return { created: false as const, id: exact[0].id };
  }

  async getUser(id: string) {
    const response = await this.request(`users/${uuid.parse(id)}`);
    if (response.status === 404) throw new KeycloakAdministrationError('KEYCLOAK_USER_NOT_FOUND');
    if (!response.ok) throw new KeycloakAdministrationError('KEYCLOAK_READ_FAILED');
    const user = userRepresentation.parse(await this.readJson(response));
    if (user.id !== id) throw new KeycloakAdministrationError('INVALID_KEYCLOAK_RESPONSE');
    return user;
  }

  async setEnabled(id: string, enabled: boolean) {
    const response = await this.request(`users/${uuid.parse(id)}`, {
      body: JSON.stringify({ enabled }),
      method: 'PUT',
    });
    if (response.status >= 500) throw new KeycloakOutcomeUnconfirmedError();
    if (response.status !== 204) throw new KeycloakAdministrationError('KEYCLOAK_UPDATE_FAILED');
  }

  async logout(id: string) {
    const response = await this.request(`users/${uuid.parse(id)}/logout`, { method: 'POST' });
    if (response.status >= 500) throw new KeycloakOutcomeUnconfirmedError();
    if (response.status !== 204) throw new KeycloakAdministrationError('KEYCLOAK_LOGOUT_FAILED');
  }

  async cleanupSessions(id: string) {
    if ((await this.getUser(id)).enabled !== false)
      throw new KeycloakAdministrationError('KEYCLOAK_USER_NOT_DISABLED');
    await this.logout(id);
    const response = await this.request(`users/${uuid.parse(id)}/sessions`);
    if (!response.ok) throw new KeycloakAdministrationError('KEYCLOAK_SESSION_CHECK_FAILED');
    const sessions = z
      .array(z.object({ id: z.string() }).passthrough())
      .parse(await this.readJson(response));
    if (sessions.length) throw new KeycloakAdministrationError('KEYCLOAK_SESSIONS_REMAIN');
    // Online logout alone is not evidence that offline grants are gone. Bound the local realm
    // census and fail closed instead of attesting incomplete cleanup or doing unbounded fan-out.
    const clientsResponse = await this.request('clients?first=0&max=33');
    if (!clientsResponse.ok) throw new KeycloakAdministrationError('KEYCLOAK_CLIENT_CHECK_FAILED');
    const clients = z
      .array(z.object({ id: z.uuid() }))
      .max(32)
      .parse(await this.readJson(clientsResponse));
    for (const client of clients) {
      const offline = await this.request(`users/${uuid.parse(id)}/offline-sessions/${client.id}`);
      if (!offline.ok) throw new KeycloakAdministrationError('KEYCLOAK_OFFLINE_CHECK_FAILED');
      if (
        z.array(z.object({ id: z.string() }).passthrough()).parse(await this.readJson(offline))
          .length
      )
        throw new KeycloakAdministrationError('KEYCLOAK_OFFLINE_SESSIONS_REMAIN');
    }
    if ((await this.getUser(id)).enabled !== false)
      throw new KeycloakAdministrationError('KEYCLOAK_USER_NOT_DISABLED');
  }
}
