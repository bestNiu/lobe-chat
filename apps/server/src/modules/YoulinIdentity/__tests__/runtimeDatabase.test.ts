import { describe, expect, it, vi } from 'vitest';

import { disposeYoulinRuntimeDatabase, getYoulinRuntimeDatabase } from '../runtimeDatabase';

const mocks = vi.hoisted(() => ({
  end: vi.fn(async () => undefined),
  poolConfigs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/config/db', () => ({
  serverDBEnv: {
    DATABASE_DRIVER: 'node',
    DATABASE_URL: 'postgres://identity.invalid/database',
  },
}));
vi.mock('@/database/schemas', () => ({}));
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn((pool: unknown) => ({ $client: pool })),
}));
vi.mock('pg', () => ({
  Pool: class {
    constructor(config: Record<string, unknown>) {
      mocks.poolConfigs.push(config);
    }

    end = mocks.end;
    on = vi.fn();
  },
}));

describe('Youlin dedicated runtime database', () => {
  it('is lazy, bounded, independently disposable, and does not mutate the shared pool', async () => {
    expect(mocks.poolConfigs).toHaveLength(0);

    const first = getYoulinRuntimeDatabase();
    const second = getYoulinRuntimeDatabase();

    expect(second).toBe(first);
    expect(mocks.poolConfigs).toEqual([
      {
        connectionString: 'postgres://identity.invalid/database',
        connectionTimeoutMillis: 1500,
        idle_in_transaction_session_timeout: 1500,
        max: 4,
        query_timeout: 5000,
        statement_timeout: 1500,
      },
    ]);
    await disposeYoulinRuntimeDatabase();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
