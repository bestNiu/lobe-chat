// Container workload only. This checks explicit identity entrypoints plus their imports, not the full repo.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, writeFile } from 'node:fs/promises';

await access('/.dockerenv');
await access('/workspace/tsconfig.json');
await writeFile(
  '/tmp/youlin-identity-types.json',
  JSON.stringify({
    extends: '/workspace/tsconfig.json',
    compilerOptions: {
      incremental: false,
      types: ['node', 'vitest/globals'],
      // The temporary config lives outside the workspace; retain its actual type-library roots.
      typeRoots: ['/workspace/node_modules/@types', '/workspace/node_modules'],
    },
    include: [
      '/workspace/apps/server/src/modules/YoulinIdentity/**/*.ts',
      '/workspace/packages/database/src/repositories/youlinIdentity/**/*.ts',
      '/workspace/packages/database/src/schemas/youlinIdentity*.ts',
      '/workspace/packages/types/src/youlinIdentity.ts',
      '/workspace/src/libs/better-auth/plugins/youlinEnterprise.ts',
      '/workspace/src/libs/better-auth/plugins/youlinEnterprise.test.ts',
    ],
  }),
);
const child = spawn(
  '/workspace/node_modules/@typescript/native-preview/bin/tsgo',
  ['-p', '/tmp/youlin-identity-types.json', '--noEmit'],
  { env: { ...process.env, GOMAXPROCS: '2' }, stdio: 'inherit' },
);
const timer = setTimeout(() => {
  console.error('Scoped type-check deadline reached; requesting SIGTERM');
  child.kill('SIGTERM');
}, 30_000);
try {
  const [code, signal] = await once(child, 'exit');
  console.log(
    JSON.stringify({
      code,
      signal,
      scope: 'identity entrypoints and imports; not whole-repository',
    }),
  );
  process.exitCode = code ?? 1;
} catch (error) {
  console.error('Scoped type-check process failed', error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
