import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The market service talks to Postgres directly; tests that need one are
    // gated on MARKET_TEST_DATABASE_URL and skip themselves otherwise.
    testTimeout: 20_000,
  },
});