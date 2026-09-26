import { z } from 'zod';

import { YoulinIdentityError } from '@/database/repositories/youlinIdentity/contracts';
import { YoulinModelGovernanceTransaction } from '@/database/repositories/youlinModelGovernance/governanceTransaction';
import {
  adminResponse as response,
  authorizeYoulinAdminRequest,
  logAdminFailure,
  readBoundedBody,
} from '@/server/modules/YoulinIdentity/adminGate';
import { getYoulinRuntimeDatabase } from '@/server/modules/YoulinIdentity/runtimeDatabase';

const limit = z.number().int().min(0).max(2_147_483_647).nullish();
const putSchema = z
  .object({
    grant: z
      .object({
        enabled: z.boolean(),
        model: z.string().trim().min(1).max(255),
        monthlyTokenLimit: limit,
        provider: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .optional(),
    quota: z.object({ monthlyTotalTokenLimit: limit }).strict().optional(),
    userId: z.string().min(1).max(255),
  })
  .strict()
  .refine((value) => value.grant !== undefined || value.quota !== undefined);

const unauthorized = (error: unknown) =>
  error instanceof YoulinIdentityError &&
  ['ACTOR_NOT_AUTHORIZED', 'PERMISSION_DENIED', 'PRIVATE_SERVICE_REQUIRED'].includes(error.code);

/**
 * Operator API for model authorization and token quotas. The actor always comes from the verified
 * session proof; a body that tries to name an actor, grant or epoch is rejected by `.strict()`
 * rather than ignored. Authorization itself is the reviewed control-plane transaction's job
 * (`identity:model-governance`), so this layer never decides who is an administrator.
 */
export const createModelAccessHandler =
  (
    getSession: (
      request: Request,
    ) => Promise<{ session: { id: string }; user: { id: string } } | null>,
  ) =>
  async (request: Request) => {
    const method = request.method.toUpperCase();
    if (!['GET', 'PUT'].includes(method)) return response(405, 'METHOD_NOT_ALLOWED');
    try {
      const gate = await authorizeYoulinAdminRequest(request, getSession, {
        expectJsonBody: method === 'PUT',
      });
      if (!gate.ok) return gate.response;
      const transaction = new YoulinModelGovernanceTransaction(getYoulinRuntimeDatabase(), {
        actor: { authEpoch: gate.context.authEpoch, subjectId: gate.context.subjectId },
        enabled: true,
        enterpriseId: gate.config.enterpriseId,
      });

      if (method === 'GET') {
        const userId = new URL(request.url).searchParams.get('userId') ?? '';
        if (!userId || userId.length > 255) return response(400, 'INVALID_REQUEST');
        const access = await transaction.listAccess(userId);
        return Response.json(access, { headers: { 'cache-control': 'no-store' } });
      }

      const body = await readBoundedBody(request);
      if ('status' in body) return response(body.status, body.code);
      const parsed = putSchema.safeParse(JSON.parse(body.text));
      if (!parsed.success) return response(400, 'INVALID_REQUEST');
      const { grant, quota, userId } = parsed.data;
      const result = {
        grant: grant ? await transaction.upsertGrant({ ...grant, targetUserId: userId }) : null,
        quota: quota ? await transaction.setUserQuota({ ...quota, targetUserId: userId }) : null,
      };
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      if (unauthorized(error)) return response(403, 'NOT_AUTHORIZED');
      if (error instanceof YoulinIdentityError && error.code.startsWith('INVALID_'))
        return response(400, 'INVALID_REQUEST');
      if (error instanceof SyntaxError) return response(400, 'INVALID_REQUEST');
      logAdminFailure('model-governance');
      return response(503, 'OPERATION_UNCONFIRMED');
    }
  };
