import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { getConfig } from '../config';
import * as schema from './schema';

export type MarketDb = ReturnType<typeof drizzle<typeof schema>>;

export interface MarketDbHandle {
  db: MarketDb;
  pool: Pool;
}

export const createMarketDb = (connectionString: string): MarketDbHandle => {
  const pool = new Pool({ connectionString, max: 10 });

  return { db: drizzle(pool, { schema }), pool };
};

let cached: MarketDbHandle | undefined;

/** Lazily created so importing modules never opens a socket. */
export const getDbHandle = (): MarketDbHandle => {
  if (!cached) {
    const connectionString = getConfig().DATABASE_URL;

    // Phase 1 runs without a database; only the phase-2 storage layer needs one.
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to use the market storage layer');
    }

    cached = createMarketDb(connectionString);
  }

  return cached;
};

export const getDb = (): MarketDb => getDbHandle().db;

export const closeDb = async (): Promise<void> => {
  if (!cached) return;

  const handle = cached;
  cached = undefined;
  await handle.pool.end();
};

/** Test seam: point the singleton at a specific database. */
export const setDbHandleForTest = (handle: MarketDbHandle | undefined) => {
  cached = handle;
};
