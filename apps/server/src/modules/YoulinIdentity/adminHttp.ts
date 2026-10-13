import { z } from 'zod';

import { YoulinIdentityError } from '@/database/repositories/youlinIdentity/contracts';
import { YoulinManualOperatorDirectory } from '@/database/repositories/youlinIdentity/manualOperatorDirectory';

import {
  adminResponse as response,
  authorizeYoulinAdminRequest,
  logAdminFailure,
  readBoundedBody,
} from './adminGate';
import { createManualProvisioningService } from './manualProvisioningFactory';
import { getYoulinRuntimeDatabase } from './runtimeDatabase';

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
/** Local-test operator API; no actor, grant, binding or cleanup fields are accepted from HTTP. */
export const createYoulinAdminHandler =
  (
    getSession: (
      request: Request,
    ) => Promise<{ session: { id: string }; user: { id: string } } | null>,
  ) =>
  async (request: Request) => {
    try {
      const method = request.method.toUpperCase();
      if (!['GET', 'POST'].includes(method)) return response(405, 'METHOD_NOT_ALLOWED');
      const gate = await authorizeYoulinAdminRequest(request, getSession, {
        expectJsonBody: method === 'POST',
      });
      if (!gate.ok) return gate.response;
      if (method === 'GET') {
        const params = new URL(request.url).searchParams;
        const directory = new YoulinManualOperatorDirectory(getYoulinRuntimeDatabase(), {
          actor: { authEpoch: gate.context.authEpoch, subjectId: gate.context.subjectId },
          enterpriseId: gate.config.enterpriseId,
        });
        const page = await directory.list({
          cursor: params.get('cursor') ?? undefined,
          employeeNumber: params.get('employeeNumber') ?? undefined,
          userId: params.get('userId') ?? undefined,
        });
        let canProvision = false;
        try {
          canProvision = await directory.canProvision();
        } catch (error) {
          if (!(error instanceof YoulinIdentityError) || error.code !== 'ACTOR_NOT_AUTHORIZED')
            throw error;
        }
        return Response.json(
          { ...page, canProvision },
          { headers: { 'cache-control': 'no-store' } },
        );
      }
      const body = await readBoundedBody(request);
      if (typeof body.status === 'number') return response(body.status, body.code);
      let data: z.infer<typeof requestSchema>;
      try {
        data = requestSchema.parse(JSON.parse(body.text));
      } catch {
        return response(400, 'INVALID_REQUEST');
      }
      const service = createManualProvisioningService({
        authEpoch: gate.context.authEpoch,
        subjectId: gate.context.subjectId,
      });
      const { action, ...input } = data;
      const result =
        action === 'create' ? await service.provision(input) : await service.disable(input);
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      if (error instanceof YoulinIdentityError) {
        if (error.code === 'INVALID_DIRECTORY_FILTER') return response(400, 'INVALID_REQUEST');
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
      logAdminFailure('identity-provisioning');
      return response(503, 'OPERATION_UNCONFIRMED');
    }
  };
