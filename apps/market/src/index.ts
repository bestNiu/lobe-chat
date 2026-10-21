import { serve } from '@hono/node-server';

import { createApp } from './app';
import { getConfig } from './config';
import { SnapshotBuilder } from './snapshot/builder';
import { SnapshotStore } from './snapshot/store';
import { UpstreamClient } from './upstream/client';
import { M2MClient } from './upstream/m2m';

const bootstrap = async () => {
  const config = getConfig();

  const m2m = new M2MClient({
    baseUrl: config.UPSTREAM_MARKET_URL,
    statePath: config.M2M_STATE_PATH,
  });
  const upstream = new UpstreamClient({ baseUrl: config.UPSTREAM_MARKET_URL, m2m });
  const store = new SnapshotStore({ dir: config.SNAPSHOT_DIR });

  const builder = new SnapshotBuilder({
    client: upstream,
    concurrency: config.SNAPSHOT_PREFETCH_CONCURRENCY,
    intervals: {
      agents: config.SNAPSHOT_AGENTS_INTERVAL_MS,
      plugins: config.SNAPSHOT_PLUGINS_INTERVAL_MS,
      skills: config.SNAPSHOT_SKILLS_INTERVAL_MS,
    },
    perCategory: config.SNAPSHOT_PER_CATEGORY,
    store,
  });

  if (config.SNAPSHOT_ENABLED) {
    // Never awaited on the boot path: whatever is on disk already answers
    // requests, and a slow upstream must not delay the listener.
    await store.load().catch(() => undefined);
    void builder.refreshAll().catch((error) => {
      console.error('[market] initial snapshot refresh failed:', error);
    });
    builder.start();
  }

  const app = createApp({ config, store, upstream });

  const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
    console.info(`[market] listening on http://${info.address}:${info.port}`);
    console.info(`[market] upstream: ${config.UPSTREAM_MARKET_URL}`);
    console.info(`[market] snapshot: ${JSON.stringify(store.counts())}`);
  });

  const shutdown = () => {
    builder.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { app, builder, server, store };
};

void bootstrap();
