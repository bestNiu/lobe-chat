import debug from 'debug';

import type { YoulinEnterpriseConfig } from './featureConfig';
import { getYoulinEnterpriseConfig } from './featureConfig';
import { enforceYoulinEnterpriseHttpSession } from './httpSessionEnforcement';

const log = debug('lobe-server:youlin-identity');

export interface YoulinAdminContext {
  authEpoch: number;
  subjectId: string;
  userId: string;
}

export type YoulinAdminGate =
  | { ok: true; config: YoulinEnterpriseConfig; context: YoulinAdminContext }
  | { ok: false; response: Response };

export const adminResponse = (status: number, code: string) =>
  Response.json({ code }, { headers: { 'cache-control': 'no-store' }, status });

type GetSession = (
  request: Request,
) => Promise<{ session: { id: string }; user: { id: string } } | null>;

/**
 * The single rejection ladder for every local-test operator surface. Extracted so a second admin
 * API cannot drift from the first: same availability gate, same exact-origin rule, same native
 * session plus per-request enterprise enforcement, and the actor always comes from the verified
 * session proof — never from the request body.
 */
export const authorizeYoulinAdminRequest = async (
  request: Request,
  getSession: GetSession,
  options?: { expectJsonBody?: boolean },
): Promise<YoulinAdminGate> => {
  const config = getYoulinEnterpriseConfig();
  if (!config?.manualEnrollment || !config.localTestMode)
    return { ok: false, response: adminResponse(404, 'NOT_AVAILABLE') };
  const originAllowed = request.headers.get('origin') === config.appOrigin;
  const contentTypeAllowed =
    options?.expectJsonBody === false ||
    request.headers.get('content-type')?.split(';')[0] === 'application/json';
  if (!originAllowed || !contentTypeAllowed)
    return { ok: false, response: adminResponse(403, 'REQUEST_ORIGIN_REJECTED') };
  const native = await getSession(request);
  if (!native?.user.id || !native.session.id)
    return { ok: false, response: adminResponse(401, 'AUTHENTICATION_REQUIRED') };
  const decision = await enforceYoulinEnterpriseHttpSession({
    id: native.session.id,
    userId: native.user.id,
  });
  if (decision.status !== 'continue_authentication')
    return { ok: false, response: adminResponse(401, 'AUTHENTICATION_REQUIRED') };
  return {
    config,
    context: {
      authEpoch: decision.context.authEpoch,
      subjectId: decision.context.subjectId,
      userId: native.user.id,
    },
    ok: true,
  };
};

/** Bound streaming input even if the client omits or lies about Content-Length. */
export const readBoundedBody = async (request: Request, limit = 8192, timeoutMs = 5000) => {
  const reader = request.body?.getReader();
  if (!reader) return { code: 'INVALID_REQUEST' as const, status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { code: 'REQUEST_TOO_LARGE' as const, status: 413 };
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (timedOut) return { code: 'REQUEST_TIMEOUT' as const, status: 408 };
  return { text: Buffer.concat(chunks).toString('utf8') };
};

/** Fixed classification only: no request bodies, user ids or raw database errors. */
export const logAdminFailure = (surface: string) =>
  log('operator operation incomplete surface=%s', surface);
