import debug from 'debug';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { serverDBEnv } from '@/config/db';
import * as schema from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

const log = debug('lobe-server:youlin-identity');

interface RuntimeDatabase {
  database: LobeChatDatabase;
  dispose: () => Promise<void>;
}

let runtime: RuntimeDatabase | undefined;

export const createYoulinRuntimeDatabase = (connectionString: string): RuntimeDatabase => {
  if (serverDBEnv.DATABASE_DRIVER !== 'node') throw new Error('YOULIN_NODE_DATABASE_REQUIRED');
  if (!connectionString) throw new Error('YOULIN_DATABASE_URL_REQUIRED');
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 1500,
    idle_in_transaction_session_timeout: 1500,
    max: 4,
    query_timeout: 5000,
    statement_timeout: 1500,
  });
  pool.on('error', () => log('Dedicated identity database idle connection failed'));
  return {
    database: drizzle(pool, { schema }) as LobeChatDatabase,
    dispose: () => pool.end(),
  };
};

/** Lazy: callers must check the feature flag before asking for this database. */
export const getYoulinRuntimeDatabase = () => {
  runtime ??= createYoulinRuntimeDatabase(serverDBEnv.DATABASE_URL ?? '');
  return runtime.database;
};

export const disposeYoulinRuntimeDatabase = async () => {
  const current = runtime;
  runtime = undefined;
  await current?.dispose();
};
