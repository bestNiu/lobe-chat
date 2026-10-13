import { auth } from '@/auth';
import { createYoulinAdminHandler } from '@/server/modules/YoulinIdentity/adminHttp';

const handler = createYoulinAdminHandler((request) =>
  auth.api.getSession({ headers: request.headers }),
);

export const GET = handler;
export const POST = handler;
