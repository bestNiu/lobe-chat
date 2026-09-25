import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { copyImageInputs } from './copyImageInputs.mjs';

test('preserves relocatable pnpm links instead of baking host artifact paths into the image', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'youlin-image-links-'));
  const repository = path.join(temporary, 'repo');
  const artifacts = path.join(temporary, 'artifacts');
  try {
    for (const directory of ['next/standalone/node_modules/.pnpm/pg', 'next/static'])
      await mkdir(path.join(artifacts, directory), { recursive: true });
    await mkdir(path.join(repository, 'packages/database/migrations'), { recursive: true });
    await mkdir(path.join(repository, 'scripts/youlin/deployment'), { recursive: true });
    await writeFile(
      path.join(repository, 'scripts/youlin/deployment/Dockerfile'),
      'FROM scratch\n',
    );
    await writeFile(
      path.join(artifacts, 'next/standalone/node_modules/.pnpm/pg/index.js'),
      'synthetic',
    );
    await symlink('.pnpm/pg', path.join(artifacts, 'next/standalone/node_modules/pg'));
    const context = await copyImageInputs(artifacts, repository);
    assert.equal(await readlink(path.join(context, 'standalone/node_modules/pg')), '.pnpm/pg');
    await rm(path.join(artifacts, 'next'), { recursive: true });
    assert.equal(
      await readFile(path.join(context, 'standalone/node_modules/pg/index.js'), 'utf8'),
      'synthetic',
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
