import path from 'node:path';

export const runtimeImages = Object.freeze({
  postgres:
    'paradedb/paradedb@sha256:293e187d9007952ceeed35b3ed7b10ec996566f48795d71fb8cd5a60c5738634',
  redis: 'redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99',
  node: 'node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3',
});

/** Synthetic empty-database smoke ONLY. No host ports, live credentials or employee access. */
export const createRuntimeSmokeProfile = ({ artifacts, image }) => {
  if (
    !path.isAbsolute(artifacts) ||
    /[$\r\n]/.test(artifacts) ||
    !/^sha256:[a-f0-9]{64}$/.test(image)
  )
    throw new Error('INVALID_RUNTIME_SMOKE_PROFILE');
  const locked = {
    pull_policy: 'never',
    security_opt: ['no-new-privileges:true'],
    cpus: 1,
    pids_limit: 128,
  };
  const node = {
    ...locked,
    image,
    user: '1000:1000',
    read_only: true,
    cap_drop: ['ALL'],
    tmpfs: ['/tmp:size=128m,mode=1777', '/app/.next/cache:size=128m,mode=1777'],
    environment: { NODE_OPTIONS: '--max-old-space-size=1536' },
  };
  return {
    services: {
      postgres: {
        ...locked,
        image: runtimeImages.postgres,
        env_file: [path.join(artifacts, 'database.env')],
        mem_limit: '2g',
        memswap_limit: '2g',
        volumes: [{ type: 'volume', source: 'database', target: '/var/lib/postgresql/data' }],
        healthcheck: {
          test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U youlin_fixture -d youlin_fixture'],
          interval: '2s',
          timeout: '2s',
          retries: 40,
        },
      },
      redis: {
        ...locked,
        image: runtimeImages.redis,
        user: '999:999',
        read_only: true,
        cap_drop: ['ALL'],
        mem_limit: '256m',
        memswap_limit: '256m',
        tmpfs: ['/data:size=32m,mode=1777'],
        command: [
          'redis-server',
          '--save',
          '',
          '--appendonly',
          'no',
          '--maxmemory',
          '128mb',
          '--maxmemory-policy',
          'noeviction',
        ],
        healthcheck: {
          test: ['CMD', 'redis-cli', 'ping'],
          interval: '2s',
          timeout: '2s',
          retries: 20,
        },
      },
      migrate: {
        ...node,
        mem_limit: '1g',
        memswap_limit: '1g',
        environment: { NODE_OPTIONS: '--max-old-space-size=768' },
        env_file: [path.join(artifacts, 'migration.env')],
        command: ['node', 'migrate.cjs'],
        depends_on: { postgres: { condition: 'service_healthy' } },
        restart: 'no',
      },
      app: {
        ...node,
        mem_limit: '2g',
        memswap_limit: '2g',
        env_file: [path.join(artifacts, 'app.env')],
        depends_on: {
          migrate: { condition: 'service_completed_successfully' },
          redis: { condition: 'service_healthy' },
        },
        healthcheck: {
          test: [
            'CMD',
            'node',
            '-e',
            "fetch('http://127.0.0.1:3210/signin').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))",
          ],
          interval: '3s',
          timeout: '3s',
          retries: 30,
        },
      },
      probe: {
        ...locked,
        image: runtimeImages.node,
        user: '1000:1000',
        read_only: true,
        cap_drop: ['ALL'],
        mem_limit: '128m',
        memswap_limit: '128m',
        profiles: ['probe'],
        entrypoint: ['node'],
        command: [
          '-e',
          `
          (async () => {
            const base = 'http://app:3210';
            const response = await fetch(base + '/signin');
            if (response.status !== 200) throw new Error('SIGNIN_STATUS');
            const html = await response.text();
            const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\\.(?:js|css)(?:\\?[^"']*)?)["']/g)].map(m => m[1]).filter(p => new URL(p, base).origin === base);
            if (!assets.length) throw new Error('ASSETS_MISSING');
            for (const asset of assets) {
              const res = await fetch(new URL(asset, base));
              const type = res.headers.get('content-type') || '';
              if (res.status !== 200 || !/javascript|text\\/css/.test(type)) throw new Error('ASSET_UNAVAILABLE');
            }
            console.log(JSON.stringify({ signin: 200, assets: assets.length, realLogin: false }));
          })().catch(() => { console.error('RUNTIME_HTTP_PROBE_FAILED'); process.exitCode = 1; });
        `,
        ],
      },
    },
    networks: { default: { internal: true } },
    volumes: { database: {} },
  };
};
