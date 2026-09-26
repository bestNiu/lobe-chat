import { auth } from '@/auth';
import { createModelAccessHandler } from '@/server/modules/YoulinModelGovernance/modelAccessHttp';

const handler = createModelAccessHandler((request) =>
  auth.api.getSession({ headers: request.headers }),
);

export const GET = handler;
export const PUT = handler;
