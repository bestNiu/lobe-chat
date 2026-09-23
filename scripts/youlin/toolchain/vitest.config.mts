import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  resolve: {
    alias: {
      vitest: fileURLToPath(new URL('./node_modules/vitest/dist/index.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.test.ts'],
    maxWorkers: 1,
    restoreMocks: true,
  },
});
