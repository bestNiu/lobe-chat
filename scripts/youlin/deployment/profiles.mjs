import path from 'node:path';

export const frontendVariants = ['desktop', 'mobile', 'auth', 'workbench', 'share'];
export const sourceEntries = [
  'apps',
  'packages',
  'src',
  'scripts',
  'plugins',
  'node_modules',
  'locales',
  'public',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'index.mobile.html',
  'index.auth.html',
  'index.workbench.html',
];

const bind = (source, target, readOnly = true) => ({
  type: 'bind',
  source,
  target,
  read_only: readOnly,
});

const outside = (base, target) => {
  const relative = path.relative(base, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
};

/** A build profile only: no real credentials, ports, network, app deployment or cold install. */
export const createBuildProfile = ({ repository, artifacts, uid, gid, image, caches }) => {
  if (
    !path.isAbsolute(repository) ||
    !path.isAbsolute(artifacts) ||
    !outside(repository, artifacts) ||
    !outside(artifacts, repository) ||
    /[$\r\n]/.test(repository) ||
    /[$\r\n]/.test(artifacts) ||
    !Number.isInteger(uid) ||
    uid <= 0 ||
    !Number.isInteger(gid) ||
    gid < 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(image)
  )
    throw new Error('INVALID_BUILD_PROFILE');
  // Persistent tool caches are an iteration optimisation, never a source of truth: they must live
  // outside both the repository and this build's artifacts, and release builds pass no caches at all.
  if (
    caches !== undefined &&
    (typeof caches?.root !== 'string' ||
      !path.isAbsolute(caches.root) ||
      /[$\r\n]/.test(caches.root) ||
      !outside(repository, caches.root) ||
      !outside(artifacts, caches.root) ||
      !outside(caches.root, artifacts))
  )
    throw new Error('INVALID_BUILD_CACHE_ROOT');
  const common = {
    image,
    pull_policy: 'never',
    user: `${uid}:${gid}`,
    read_only: true,
    network_mode: 'none',
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    mem_limit: '6g',
    memswap_limit: '6g',
    cpus: 2,
    pids_limit: 128,
    init: true,
    working_dir: '/workspace',
    entrypoint: ['node'],
    environment: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=4096',
      NEXT_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      HOME: '/tmp',
      NO_COLOR: '1',
    },
    tmpfs: [
      '/tmp:size=256m,mode=1777',
      '/workspace/node_modules/.vite-temp:size=128m,mode=1777',
      '/workspace/node_modules/.vite:size=128m,mode=1777',
    ],
  };
  const sources = sourceEntries.map((entry) =>
    bind(path.join(repository, entry), `/workspace/${entry}`),
  );
  const services = {};
  for (const variant of frontendVariants) {
    const microApp = variant === 'workbench' || variant === 'share';
    services[variant] = {
      ...structuredClone(common),
      working_dir: microApp ? `/workspace/apps/${variant}` : '/workspace',
      environment: {
        ...common.environment,
        ...(variant === 'mobile' ? { MOBILE: 'true' } : {}),
        ...(variant === 'auth' ? { AUTH: 'true' } : {}),
      },
      // With a cache root the Vite directories become writable host binds (per variant, so parallel
      // stages cannot race); without one they stay disposable tmpfs exactly as before.
      tmpfs: [
        ...common.tmpfs.filter(
          (entry) => !caches || !entry.startsWith('/workspace/node_modules/.vite'),
        ),
        ...(microApp && !caches
          ? [`/workspace/apps/${variant}/node_modules/.vite-temp:size=128m,mode=1777`]
          : []),
      ],
      volumes: [
        ...sources,
        bind(path.join(artifacts, 'dist'), '/output', false),
        ...(caches
          ? [
              bind(
                path.join(caches.root, `vite-${variant}`),
                '/workspace/node_modules/.vite',
                false,
              ),
              bind(
                path.join(caches.root, `vite-temp-${variant}`),
                '/workspace/node_modules/.vite-temp',
                false,
              ),
              ...(microApp
                ? [
                    bind(
                      path.join(caches.root, `vite-temp-apps-${variant}`),
                      `/workspace/apps/${variant}/node_modules/.vite-temp`,
                      false,
                    ),
                  ]
                : []),
            ]
          : []),
      ],
      command: [
        '/workspace/node_modules/vite/bin/vite.js',
        'build',
        '--outDir',
        `/output/${variant}`,
      ],
    };
  }
  services.backend = {
    ...structuredClone(common),
    environment: {
      ...common.environment,
      DOCKER: 'true',
      CIRCLE_NODE_TOTAL: '2',
      WORKBENCH_REQUIRED: '1',
      SHARE_REQUIRED: '1',
      APP_URL: 'http://build.invalid',
      DATABASE_DRIVER: 'node',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:65432/build_only',
      KEY_VAULTS_SECRET: 'use-for-build',
      AUTH_SECRET: 'synthetic-build-only-not-runtime',
    },
    tmpfs: ['/workspace:size=32m,mode=1777', ...common.tmpfs],
    volumes: [
      ...sources.filter(
        (mount) => !['/workspace/public', '/workspace/tsconfig.json'].includes(mount.target),
      ),
      bind(path.join(repository, 'next.config.ts'), '/workspace/next.config.ts'),
      bind(path.join(artifacts, 'tsconfig.json'), '/workspace/tsconfig.json', false),
      bind(path.join(artifacts, 'source-app'), '/workspace/src/app', false),
      bind(path.join(artifacts, 'public'), '/workspace/public', false),
      bind(path.join(artifacts, 'dist'), '/workspace/dist'),
      bind(path.join(artifacts, 'next'), '/workspace/.next', false),
      // Nested inside the artifacts mount: Next's own cache survives between builds while the build
      // output stays per-build. Deeper mounts are applied after their parent by the engine.
      ...(caches ? [bind(path.join(caches.root, 'next'), '/workspace/.next/cache', false)] : []),
    ],
    entrypoint: ['sh', '-c'],
    command: [
      'node --import tsx scripts/copySpaBuild.mts && node --import tsx scripts/generateSpaTemplates.mts && node node_modules/next/dist/bin/next build',
    ],
  };
  return { services };
};
