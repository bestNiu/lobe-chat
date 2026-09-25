import { z } from 'zod';

const parseStrictFlag = (name: string, value: string | undefined) => {
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error(`INVALID_${name}`);
};

export const isYoulinEnterpriseSessionEnforcementEnabled = () =>
  parseStrictFlag(
    'YOULIN_ENTERPRISE_SESSION_ENFORCEMENT',
    process.env.YOULIN_ENTERPRISE_SESSION_ENFORCEMENT,
  );

export interface YoulinEnterpriseConfig {
  appOrigin: string;
  audience: string;
  clientId: string;
  enterpriseId: string;
  issuer: string;
  localTestMode: boolean;
  manualEnrollment: boolean;
}

export const getYoulinEnterpriseConfig = (): YoulinEnterpriseConfig | null => {
  if (!isYoulinEnterpriseSessionEnforcementEnabled()) return null;

  const localTestMode = parseStrictFlag(
    'YOULIN_LOCAL_TEST_MODE',
    process.env.YOULIN_LOCAL_TEST_MODE,
  );
  const manualEnrollment = parseStrictFlag(
    'YOULIN_MANUAL_ENROLLMENT',
    process.env.YOULIN_MANUAL_ENROLLMENT,
  );
  const appUrl = z.url().parse(process.env.APP_URL);
  const issuer = z.url().parse(process.env.AUTH_KEYCLOAK_ISSUER);
  const app = new URL(appUrl);
  const identity = new URL(issuer);
  const loopbackHttp =
    localTestMode &&
    app.protocol === 'http:' &&
    app.hostname === '127.0.0.1' &&
    identity.protocol === 'http:' &&
    identity.hostname === '127.0.0.1';
  if ((app.protocol !== 'https:' || identity.protocol !== 'https:') && !loopbackHttp)
    throw new Error('UNTRUSTED_YOULIN_ORIGIN');
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== '/' ||
    identity.username ||
    identity.password ||
    identity.search ||
    identity.hash ||
    issuer.endsWith('/')
  )
    throw new Error('UNTRUSTED_YOULIN_ORIGIN');

  return Object.freeze({
    appOrigin: app.origin,
    audience: z.string().min(1).parse(process.env.YOULIN_KEYCLOAK_AUDIENCE),
    clientId: z.string().min(1).parse(process.env.AUTH_KEYCLOAK_ID),
    enterpriseId: z.string().min(1).max(128).parse(process.env.YOULIN_ENTERPRISE_ID),
    issuer,
    localTestMode,
    manualEnrollment,
  });
};
