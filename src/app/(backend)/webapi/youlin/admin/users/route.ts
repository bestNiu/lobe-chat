import { auth } from '@/auth';
import { createYoulinAdminHandler } from '@/server/modules/YoulinIdentity/adminHttp';

export const POST = createYoulinAdminHandler((request) =>
  auth.api.getSession({ headers: request.headers }),
);
