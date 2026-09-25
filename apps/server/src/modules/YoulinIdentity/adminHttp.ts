import debug from 'debug';
import { z } from 'zod';

import { YoulinIdentityError } from '@/database/repositories/youlinIdentity/contracts';

import { getYoulinEnterpriseConfig } from './featureConfig';
import { enforceYoulinEnterpriseHttpSession } from './httpSessionEnforcement';
import { createManualProvisioningService } from './manualProvisioningFactory';

const log = debug('lobe-server:youlin-identity');
const requestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      displayName: z.string().max(255).optional(),
      email: z.email(),
      employeeNumber: z.string().max(128),
      idempotencyKey: z.string().max(80),
      initialPassword: z.string().min(12).max(1024),
    })
    .strict(),
  z
    .object({
      action: z.literal('disable'),
      expectedAuthEpoch: z.number().int().nonnegative(),
      expectedAuthorityVersion: z.number().int().nonnegative(),
      idempotencyKey: z.string().max(80),
      subjectId: z.uuid(),
    })
    .strict(),
]);
const response = (status: number, code: string) =>
  Response.json({ code }, { status, headers: { 'cache-control': 'no-store' } });

/** Local-test operator API; no actor, grant, binding or cleanup fields are accepted from HTTP. */
export const createYoulinAdminHandler =
  (
    getSession: (
      request: Request,
    ) => Promise<{ session: { id: string }; user: { id: string } } | null>,
  ) =>
  async (request: Request) => {
    try {
      const config = getYoulinEnterpriseConfig();
      if (!config?.manualEnrollment || !config.localTestMode) return response(404, 'NOT_AVAILABLE');
      if (
        request.headers.get('origin') !== config.appOrigin ||
        request.headers.get('content-type')?.split(';')[0] !== 'application/json'
      )
        return response(403, 'REQUEST_ORIGIN_REJECTED');
      const native = await getSession(request);
      if (!native?.user.id || !native.session.id) return response(401, 'AUTHENTICATION_REQUIRED');
      const decision = await enforceYoulinEnterpriseHttpSession({
        id: native.session.id,
        userId: native.user.id,
      });
      if (decision.status !== 'continue_authentication')
        return response(401, 'AUTHENTICATION_REQUIRED');
      // Bound streaming input even if the client omits or lies about Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return response(400, 'INVALID_REQUEST');
      const chunks: Uint8Array[] = [];
      let size = 0;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        void reader.cancel().catch(() => {});
      }, 5000);
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 8192) {
            await reader.cancel();
            return response(413, 'REQUEST_TOO_LARGE');
          }
          chunks.push(chunk.value);
        }
      } finally {
        clearTimeout(timer);
        reader.releaseLock();
      }
      if (timedOut) return response(408, 'REQUEST_TIMEOUT');
      let data: z.infer<typeof requestSchema>;
      try {
        data = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        return response(400, 'INVALID_REQUEST');
      }
      const service = createManualProvisioningService({
        authEpoch: decision.context.authEpoch,
        subjectId: decision.context.subjectId,
      });
      const { action, ...input } = data;
      const result =
        action === 'create' ? await service.provision(input) : await service.disable(input);
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      if (error instanceof YoulinIdentityError) {
        if (
          ['ACTOR_NOT_AUTHORIZED', 'PERMISSION_DENIED', 'PRIVATE_SERVICE_REQUIRED'].includes(
            error.code,
          )
        )
          return response(403, 'NOT_AUTHORIZED');
        if (
          ['ACCOUNT_UNAVAILABLE', 'SUBJECT_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(
            error.code,
          )
        )
          return response(409, 'STATE_CONFLICT');
      }
      log('Local identity operation incomplete; inspect authoritative receipts before retrying');
      return response(503, 'OPERATION_UNCONFIRMED');
    }
  };
