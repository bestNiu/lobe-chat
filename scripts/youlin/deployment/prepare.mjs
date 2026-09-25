import { cp, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createBuildProfile } from './profiles.mjs';

/** Host file preparation only. No dependency install, build, test or credential reads. */
export const prepareBuild = async ({ repository, image, parent = os.tmpdir() }) => {
  const root = await realpath(repository);
  const outputParent = await realpath(parent);
  const relative = path.relative(root, outputParent);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    throw new Error('BUILD_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  // Vite can discover application-local env files as well as the unmounted root env.
  for (const app of ['share', 'workbench']) {
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
      try {
        await stat(path.join(root, 'apps', app, name));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      throw new Error('APP_LOCAL_ENV_FILE_PRESENT');
    }
  }
  const artifacts = await mkdtemp(path.join(outputParent, 'youlin-build-'));
  await Promise.all(
    ['dist', 'next'].map((entry) => mkdir(path.join(artifacts, entry), { mode: 0o700 })),
  );
  await cp(path.join(root, 'tsconfig.json'), path.join(artifacts, 'tsconfig.json'), {
    errorOnExist: true,
    force: false,
  });
  await cp(path.join(root, 'src/app'), path.join(artifacts, 'source-app'), {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
  await cp(path.join(root, 'public'), path.join(artifacts, 'public'), {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
  // Same Docker-only exclusions as the upstream Dockerfile, confined to this new copy.
  for (const entry of ['desktop', '(backend)/trpc/desktop'])
    await rm(path.join(artifacts, 'source-app', entry), { recursive: true, force: true });
  for (const cache of [
    'node_modules/.vite',
    'node_modules/.vite-temp',
    'apps/share/node_modules/.vite-temp',
    'apps/workbench/node_modules/.vite-temp',
  ])
    await mkdir(path.join(root, cache), { recursive: true });
  const profile = createBuildProfile({
    repository: root,
    artifacts,
    image,
    uid: process.getuid(),
    gid: process.getgid(),
  });
  await writeFile(path.join(artifacts, 'compose.json'), JSON.stringify(profile, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  return artifacts;
};
