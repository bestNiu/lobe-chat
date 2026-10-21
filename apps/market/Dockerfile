# Internal market proxy — phase 1.
#
# The service only depends on its own package.json (hono, drizzle, zod and the
# LobeHub market SDK), so it builds standalone instead of dragging the whole
# monorepo install into the image.
FROM node:24-slim AS deps

RUN npm install -g pnpm@12

WORKDIR /app
COPY apps/market/package.json ./package.json
RUN pnpm install --prod=false --ignore-scripts

FROM node:24-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/market/package.json ./package.json
COPY apps/market/tsconfig.json ./tsconfig.json
COPY apps/market/src ./src

# `tsx` runs the TypeScript sources directly: the service is small and this
# avoids a separate build stage for phase 1.
ENV NODE_ENV=production \
    PORT=8789 \
    HOST=0.0.0.0 \
    M2M_STATE_PATH=/data/m2m-client.json \
    SNAPSHOT_DIR=/data/snapshot

EXPOSE 8789

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8789/health || exit 1

CMD ["node_modules/.bin/tsx", "src/index.ts"]