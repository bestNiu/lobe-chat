import { cp, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

/** Archive only the standalone outputs and migration inputs, never a repository root. */
export const copyImageInputs = async (artifacts, repository) => {
  const context = await mkdtemp(path.join(artifacts, 'package-'));
  await cp(path.join(artifacts, 'next/standalone'), path.join(context, 'standalone'), {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  await cp(path.join(artifacts, 'next/static'), path.join(context, 'static'), {
    recursive: true,
    dereference: false,
  });
  await cp(
    path.join(repository, 'packages/database/migrations'),
    path.join(context, 'migrations'),
    { recursive: true, dereference: false },
  );
  await cp(
    path.join(repository, 'scripts/youlin/deployment/Dockerfile'),
    path.join(context, 'Dockerfile'),
  );
  return context;
};
