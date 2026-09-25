import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { z } from 'zod';

export interface KeycloakAccessVerifierOptions {
  /** API audience, not an employee number or a workspace identifier. */
  audience: string;
  authorizedParties: readonly string[];
  enabled?: boolean;
  issuer: string;
  /** Only for an isolated, network-disabled container namespace. Never enable in production. */
  testOnlyLoopbackHttp?: boolean;
}

const principalSchema = z.object({
  azp: z.string().min(1),
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  iss: z.string().url(),
  sub: z.string().min(1).max(255),
  typ: z.literal('Bearer'),
});

export class InvalidKeycloakCredentialError extends Error {}

/** Expected client-token rejection, distinct from JWKS/network/configuration outages. */
export const isInvalidKeycloakCredential = (error: unknown) =>
  error instanceof InvalidKeycloakCredentialError ||
  error instanceof errors.JWTExpired ||
  error instanceof errors.JWTClaimValidationFailed ||
  error instanceof errors.JWTInvalid ||
  error instanceof errors.JWSInvalid ||
  error instanceof errors.JWSSignatureVerificationFailed ||
  error instanceof errors.JOSEAlgNotAllowed ||
  error instanceof errors.JOSENotSupported ||
  error instanceof errors.JWKSNoMatchingKey;

/** Authentication only. A successful result MUST still pass current revocation and authorization. */
export const createKeycloakAccessVerifier = (options: KeycloakAccessVerifierOptions) => {
  if (options.enabled !== true) throw new Error('IDENTITY_VERIFIER_DISABLED');
  const { audience, issuer } = options;
  if (!audience || !options.authorizedParties.length || options.authorizedParties.some((id) => !id))
    throw new Error('INVALID_IDENTITY_CONFIGURATION');
  const url = new URL(issuer);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    issuer.endsWith('/') ||
    (url.protocol !== 'https:' &&
      !(
        options.testOnlyLoopbackHttp === true &&
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1'
      ))
  )
    throw new Error('UNTRUSTED_IDENTITY_ISSUER');
  const parties = new Set(options.authorizedParties);
  const keys = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`), {
    cacheMaxAge: 60_000,
    cooldownDuration: 1000,
    timeoutDuration: 2000,
  });

  return async (token: string) => {
    if (!token || token.length > 16_384)
      throw new InvalidKeycloakCredentialError('INVALID_ACCESS_TOKEN');
    const result = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      audience,
      issuer,
      requiredClaims: ['sub', 'exp', 'iat', 'azp', 'typ'],
    });
    const parsed = principalSchema.safeParse(result.payload);
    if (!parsed.success) throw new InvalidKeycloakCredentialError('INVALID_ACCESS_TOKEN');
    const claims = parsed.data;
    if (!parties.has(claims.azp))
      throw new InvalidKeycloakCredentialError('UNTRUSTED_AUTHORIZED_PARTY');
    // Do not derive account binding, employee status, roles or authorization from email/username.
    return Object.freeze({
      expiresAt: claims.exp,
      issuedAt: claims.iat,
      issuer: claims.iss,
      subject: claims.sub,
    });
  };
};
