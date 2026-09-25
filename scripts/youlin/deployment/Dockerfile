# Packaging only: inputs are produced by the bounded offline builder, not a source checkout.
FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3210 NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node standalone/ ./
COPY --chown=node:node static/ ./.next/static/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node migrate.cjs ./migrate.cjs
USER node
EXPOSE 3210
CMD ["node", "server.js"]
