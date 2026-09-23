import { randomUUID } from 'node:crypto';

import type { YoulinIdentityPermission } from '@lobechat/types';
import { youlinIdentityPermissions } from '@lobechat/types/youlinIdentity';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../../schemas';
import { users } from '../../../schemas/user';
import { youlinSubjects } from '../../../schemas/youlinIdentity';
import { youlinIdentityGrants } from '../../../schemas/youlinIdentityGovernance';
import type { LobeChatDatabase } from '../../../type';

/** Explicit private Unix-socket fixture only. Never getTestDB()/DATABASE_URL or a host service. */
export const createIdentityTestDatabase = async () => {
  const socket = process.env.YOULIN_NODEPG_SOCKET;
  const runId = process.env.YOULIN_NODEPG_RUN;
  if (
    !socket ||
    !runId ||
    !/^[a-f0-9-]{36}$/.test(runId) ||
    socket !== `/tmp/youlin-nodepg-${runId}/socket`
  )
    throw new Error('Use node scripts/youlin/nodePostgres.smoke.mjs --identity');
  const pool = new Pool({
    connectionTimeoutMillis: 1000,
    database: 'youlin_nodepg',
    host: socket,
    idle_in_transaction_session_timeout: 5000,
    max: 4,
    password: 'synthetic-only',
    port: 5432,
    ssl: false,
    statement_timeout: 5000,
    user: 'postgres',
  });
  pool.on('error', () => console.error('[Identity fixture] Disposable database connection failed'));
  const verifyMarker = async () => {
    const marker = await pool.query<{ run_id: string }>(
      'SELECT run_id FROM youlin_security_spike.test_environment_marker',
    );
    if (marker.rows.length !== 1 || marker.rows[0].run_id !== runId)
      throw new Error('Synthetic environment marker mismatch');
  };
  try {
    await verifyMarker();
  } catch (error) {
    await pool.end();
    throw error;
  }
  const db: LobeChatDatabase = drizzle(pool, { schema });
  const reset = async () => {
    await verifyMarker();
    await pool.query('TRUNCATE TABLE public.users, public.youlin_subjects CASCADE');
  };
  const seedActor = async (
    enterpriseId: string,
    permissions: readonly YoulinIdentityPermission[] = youlinIdentityPermissions,
    human = false,
  ) => {
    const id = randomUUID();
    const userId = human ? `synthetic-${id}` : null;
    if (userId) await db.insert(users).values({ id: userId });
    await db.insert(youlinSubjects).values({
      authEpoch: 0,
      enterpriseId,
      id,
      kind: human ? 'user' : 'service',
      status: 'active',
      userId,
    });
    if (permissions.length)
      await db.insert(youlinIdentityGrants).values(
        permissions.map((permission) => ({
          authEpoch: 0,
          enterpriseId,
          permission,
          subjectId: id,
        })),
      );
    return { authEpoch: 0, subjectId: id };
  };
  return { close: () => pool.end(), db, pool, reset, seedActor };
};
